import apiFetch from '@wordpress/api-fetch';
import { select, subscribe } from '@wordpress/data';
import { addFilter, removeFilter } from '@wordpress/hooks';
import { createBlockEditorAcf } from '../compatibility/block-editor-acf.js';

const scope = 'a-floating-live-preview-panel';
const fingerprint = /^[a-f0-9]{64}$/;

// Use public editor selectors/hooks. Never replace savePost or inspect the block canvas.
export function createBlockEditor(config) {
    const native = { ready: false, notReady: config.strings.postOnly, saving: false, idle: Promise.resolve(), title: config.postTitle };
    let preview;
    let destroyed = false;
    let lastValues;
    let wasSaving = false;
    let requests = 0;
    let failure;
    let settleQueued = false;
    const acf = config.acfEnabled ? createBlockEditorAcf(() => {
        preview?.changed();
        scheduleObserve();
    }) : null;
    const editor = () => select('core/editor');
    const ownsPost = () => Number(editor()?.getCurrentPostId()) === config.postId
        && editor()?.getCurrentPostType() === config.postType;
    const fail = () => { failure = Object.assign(new Error(config.strings.nativeSaveFailed), { code: 'aflpp_source_changed' }); };
    const token = () => Array.from(window.crypto.getRandomValues(new Uint8Array(16)),
        (byte) => byte.toString(16).padStart(2, '0')).join('');

    function values() {
        const state = editor();
        return {
            post_title: state.getEditedPostAttribute('title') ?? '',
            content: state.getEditedPostContent(),
            excerpt: state.getEditedPostAttribute('excerpt') ?? '',
            featured_media: state.getEditedPostAttribute('featured_media') ?? 0,
        };
    }

    function observe() {
        if (destroyed || !preview) return;
        const state = editor();
        const postReady = ownsPost() && !!state.getCurrentPost()?.id;
        acf?.observe();
        const ready = postReady && (acf?.ready ?? true);
        native.notReady = postReady ? config.strings.acfRefreshing : config.strings.postOnly;
        const saving = postReady && (state.isSavingPost() || requests > 0);
        const becameReady = ready && !native.ready;
        native.ready = ready;
        native.saving = saving;
        if (!ready) {
            preview.pause(native.notReady, 'paused');
            return;
        }
        if (saving && !wasSaving) {
            preview.pause(editor().isPreviewingPost() ? config.strings.nativePreview : config.strings.saving);
        }
        const finished = wasSaving && !saving;
        wasSaving = saving;
        // Track cheap raw values and immutable block references; serialize only when capturing a preview.
        const current = {
            post_title: state.getEditedPostAttribute('title') ?? '',
            excerpt: state.getEditedPostAttribute('excerpt') ?? '',
            content: state.getPostEdits().content ?? state.getCurrentPost().content,
            blocks: state.getEditedPostAttribute('blocks'),
            featured_media: state.getEditedPostAttribute('featured_media') ?? 0,
        };
        if (native.title !== current.post_title) {
            native.title = current.post_title;
            preview.setTitle(native.title);
        }
        if (!lastValues || Object.keys(current).some((key) => current[key] !== lastValues[key])) {
            lastValues = current;
            preview.changed();
        }
        if (finished || becameReady) preview.resume(failure);
    }

    // Store subscriptions can run during core's action dispatch. Defer our own observation, not native saves.
    function scheduleObserve() {
        if (settleQueued) return;
        settleQueued = true;
        queueMicrotask(() => { settleQueued = false; observe(); });
    }

    async function beforeSave(edits) {
        if (destroyed || !preview || Number(edits.id) !== config.postId || !ownsPost()) return edits;
        native.saving = true;
        const pending = preview.pause(editor().isPreviewingPost() ? config.strings.nativePreview : config.strings.saving);
        // A preview failure must never reject WordPress's save.
        try { await pending; } catch { /* Native saving takes precedence. */ }
        return edits;
    }

    function requestRoute(options) {
        if (typeof options.path === 'string' && options.path.startsWith('/')) return options.path.split('?')[0].replace(/\/$/, '');
        if (typeof options.url !== 'string') return '';
        const url = new URL(options.url, window.location.href);
        const root = new URL(config.restRoot, window.location.href);
        if (url.origin !== root.origin) return '';
        if (url.searchParams.has('rest_route')) return url.searchParams.get('rest_route').replace(/\/$/, '');
        if (!url.pathname.startsWith(root.pathname)) return '';
        return `/${url.pathname.slice(root.pathname.length)}`.replace(/\/$/, '');
    }

    function isMetaSave(options) {
        if (!window._wpMetaBoxUrl || !(options.body instanceof FormData) || typeof options.url !== 'string') return false;
        const url = new URL(options.url, window.location.href);
        const expected = new URL(window._wpMetaBoxUrl, window.location.href);
        return url.origin === window.location.origin && url.origin === expected.origin && url.pathname === expected.pathname
            && url.searchParams.has('meta-box-loader') && options.body.get('post_ID') === String(config.postId)
            && options.body.get('action') === 'editpost';
    }

    function accept(receipt, request, base) {
        if (!receipt || receipt.request !== request || receipt.before !== base || config.base !== base
            || typeof receipt.after !== 'string' || !fingerprint.test(receipt.after) || typeof receipt.available !== 'boolean') {
            fail();
            return;
        }
        config.base = receipt.after;
        config.available = receipt.available;
    }

    async function middleware(options, next) {
        if (destroyed || !preview || !['POST', 'PUT', 'PATCH'].includes((options.method || 'GET').toUpperCase())) return next(options);
        const route = requestRoute(options);
        const restSave = route === config.postRoute || route === `${config.postRoute}/autosaves`;
        const metaSave = !restSave && isMetaSave(options);
        if (!restSave && !metaSave) return next(options);
        requests++;
        native.saving = true;
        scheduleObserve();
        const pending = preview.pause(config.strings.saving);
        try { await pending; } catch { /* Drain errors belong to the panel, not the native save. */ }
        const base = config.base;
        const request = token();
        let cookieName;
        try {
            if (restSave) {
                const response = await next({ ...options, headers: {
                    ...options.headers, 'X-AFLPP-Base': base, 'X-AFLPP-Request': request,
                } });
                // Core's native saves use parsed records. Preserve parse:false for other opted-in callers too.
                if (options.parse === false) {
                    try {
                        const data = await response.clone().json();
                        accept(data?._aflpp_receipt, request, base);
                    } catch { fail(); }
                    return response;
                }
                if (!response || typeof response !== 'object') { fail(); return response; }
                const { _aflpp_receipt: receipt, ...record } = response;
                accept(receipt, request, base);
                return record;
            }
            const body = new FormData();
            for (const [key, value] of options.body) body.append(key, value);
            body.set('aflpp_base', base);
            body.set('aflpp_preview', request);
            body.set('aflpp_metabox', '1');
            cookieName = `aflpp_preview_${request}`;
            const response = await next({ ...options, body });
            const cookie = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
            const receipt = cookie?.slice(cookieName.length + 1);
            accept({ request, before: base, after: receipt?.startsWith(`${base}.`) ? receipt.slice(65) : '', available: config.available }, request, base);
            if (!failure) acf?.saved();
            return response;
        } catch (error) {
            // Even a REST 4xx can follow wp_update_post(). Retry preview only when the server
            // confirms this request left its baseline unchanged; never advance a rejected save.
            let receipt = error?._aflpp_receipt;
            try {
                if (receipt !== undefined) delete error._aflpp_receipt;
            } catch {
                // Read-only errors must keep WordPress's original rejection; pause without trusting the receipt.
                receipt = undefined;
            }
            const status = error?.data?.status;
            if (restSave && error?.name !== 'AbortError' && typeof error?.code === 'string'
                && Number.isInteger(status) && status >= 400 && status < 500 && receipt?.after === base) {
                accept(receipt, request, base);
            } else fail();
            throw error;
        } finally {
            if (cookieName) document.cookie = `${cookieName}=; Max-Age=0; Path=${config.adminCookiePath}; SameSite=Strict`;
            requests--;
            scheduleObserve();
        }
    }

    native.preparePreview = () => {
        const data = { ...values(), base: config.base };
        if (!acf) return apiFetch({ url: config.endpoint, method: 'POST', data });
        const body = acf.capture();
        for (const [key, value] of Object.entries(data)) body.set(key, value);
        return apiFetch({ url: config.endpoint, method: 'POST', body });
    };
    const unsubscribe = subscribe(scheduleObserve);
    addFilter('editor.preSavePost', scope, beforeSave);
    apiFetch.use(middleware);
    native.connect = (session) => { preview = session; observe(); };
    native.destroy = () => {
        destroyed = true;
        unsubscribe();
        acf?.destroy();
        removeFilter('editor.preSavePost', scope);
    };
    window.addEventListener('pagehide', (event) => { if (!event.persisted) native.destroy(); });
    return native;
}
