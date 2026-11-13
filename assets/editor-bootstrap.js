(() => {
    'use strict';

    // Keep classic WordPress dependencies ordered; load application code as native modules.
    const config = window.aFloatingLivePreviewPanel;
    const form = document.getElementById('post');
    if (!config || !form) return;

    // Observe native saves before asynchronous module loading can yield to heartbeat or form events.
    const nativeEditor = { idle: Promise.resolve(), saving: false, previewing: false };
    let finishNative;
    let nativePreview;
    let replayingPreview = false;

    function beginPreview() {
        const token = Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
        const base = config.base;
        const name = `aflpp_preview_${token}`;
        const fields = Object.entries({ aflpp_base: base, aflpp_preview: token }).map(([name, value]) => {
            const field = document.createElement('input');
            Object.assign(field, { type: 'hidden', name, value });
            form.append(field);
            return field;
        });
        let timer;
        let settled = false;
        let resolve;
        const done = new Promise((finish) => { resolve = finish; });
        const deadline = Date.now() + 30000;
        const finish = (error) => {
            settled = true;
            clearTimeout(timer);
            nativePreview = null;
            nativeEditor.previewing = false;
            for (const field of fields) field.remove();
            document.cookie = `${name}=; Max-Age=0; Path=${config.adminCookiePath}; SameSite=Strict`;
            resolve();
            nativeEditor.onPreview?.(error, config.base !== base);
        };
        const check = () => {
            if (settled) return;
            clearTimeout(timer);
            const receipt = document.cookie.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`));
            const value = receipt?.slice(name.length + 1);
            if (value?.startsWith(`${base}.`) && /^[a-f0-9]{64}$/.test(value.slice(65))) {
                config.base = value.slice(65);
                finish();
            } else if (receipt || Date.now() >= deadline) {
                finish(Object.assign(new Error(config.strings.nativePreviewFailed), { code: 'aflpp_source_changed' }));
            } else timer = setTimeout(check, 100);
        };
        nativePreview = { done, check };
        nativeEditor.idle = Promise.all([nativeEditor.idle, done]);
        timer = setTimeout(check, 100);
    }

    form.addEventListener('click', (event) => {
        const control = event.target.closest('#post-preview');
        if (!control || control.classList.contains('disabled') || replayingPreview || !window.crypto?.getRandomValues) return;
        if (nativeEditor.previewing) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        nativeEditor.previewing = true;
        const pending = nativeEditor.beforePreview?.();
        if (!pending) { beginPreview(); return; }
        event.preventDefault();
        event.stopImmediatePropagation();
        // Reserve core's named preview tab during the user gesture, before awaiting a write.
        window.open('', control.target || 'wp-preview');
        const proceed = () => {
            beginPreview();
            replayingPreview = true;
            try { control.click(); } finally { replayingPreview = false; }
        };
        pending.then(proceed, proceed);
    }, true);
    window.jQuery(document).on('heartbeat-send.aflpp', (event, data) => {
        nativePreview?.check();
        data.aflpp_base = config.base;
    }).on('before-autosave.aflpp', () => {
        // Core emits this even when its heartbeat-send handler was registered after ours.
        const autosave = new Promise((resolve) => { finishNative = resolve; });
        nativeEditor.idle = Promise.all([autosave, nativePreview?.done]);
        nativeEditor.onAutosave?.();
    }).on('heartbeat-tick.aflpp heartbeat-error.aflpp', (event, data) => {
        if (typeof data?.aflpp_base === 'string' && /^[a-f0-9]{64}$/.test(data.aflpp_base)) {
            config.base = data.aflpp_base;
        }
        if (typeof data?.rest_nonce === 'string') config.nonce = data.rest_nonce;
        finishNative?.();
        finishNative = null;
    });
    const saving = (event) => {
        if ((event.type === 'submit' && form.querySelector('#wp-preview')?.value !== 'dopreview')
            || event.target.closest('#publish, #save-post')) nativeEditor.saving = true;
    };
    form.addEventListener('click', saving, true);
    form.addEventListener('submit', saving, true);
    const stopWatchingStartupSave = () => {
        form.removeEventListener('click', saving, true);
        form.removeEventListener('submit', saving, true);
    };

    Promise.all([
        import(config.editorModule),
        import(config.panelModule),
        import(config.viewportModule),
        import(config.scrollModule),
        config.acfModule ? import(config.acfModule) : null,
    ]).then(([editor, view, viewport, scroll, acf]) => {
        if (typeof view.createPreviewPanel !== 'function') throw new Error('Preview panel module has no initializer.');
        if (typeof viewport.createPreviewViewport !== 'function') throw new Error('Preview viewport module has no initializer.');
        if (typeof scroll.createPreviewScroll !== 'function') throw new Error('Preview scroll module has no initializer.');
        if (acf && typeof acf.initAcf !== 'function') throw new Error('ACF preview module has no initializer.');
        stopWatchingStartupSave();
        const createPreviewPanel = (strings, options) => view.createPreviewPanel(strings, options, viewport.createPreviewViewport);
        editor.initPreview(config, acf?.initAcf, nativeEditor, createPreviewPanel, scroll.createPreviewScroll);
    }).catch((error) => {
        stopWatchingStartupSave();
        nativeEditor.beforePreview = null;
        nativeEditor.onPreview = null;
        nativeEditor.onAutosave = null;
        window.jQuery(document).off('.aflpp');
        document.getElementById('aflpp-panel')?.remove();
        document.getElementById('aflpp-toggle')?.remove();
        const notice = document.createElement('div');
        notice.className = 'notice notice-error';
        notice.setAttribute('role', 'alert');
        const message = document.createElement('p');
        message.textContent = config.strings.bootFailed;
        notice.append(message);
        (document.getElementById('wpbody-content') || document.body).prepend(notice);
        console.error('A Floating Live Preview Panel could not start.', error);
    });
})();
