// One lifecycle owns field capture, refreshes, Web Locks, takeover and native-save sequencing.
export function initPreview(config, initAcf, nativeEditor, createPreviewPanel, createPreviewScroll, createPreviewFrame) {
    const form = document.getElementById('post');
    if (!config || !form) return;

    const strings = config.strings;
    const mainWindow = window;
    const scrolling = createPreviewScroll();
    const view = createPreviewPanel(strings, {
        postTitle: document.getElementById('title')?.value ?? config.postTitle,
        onOpen: () => startPreview(),
        onClose: () => stopPreview(),
        onRefresh: refreshPreview,
        onRetry: (takeOver) => takeOver ? startPreview(true) : refreshPreview(),
        beforeMove: discardFrames,
        afterMove: () => { if (previewActive) refreshPreview(); },
    });

    // Visibility belongs to the view: a shown panel can be active, waiting or paused.
    // Disabling refreshes does not release ownership until the outstanding refresh has drained.
    let previewActive = false;
    let capturing = false;
    let generation = 0;
    let refreshTimer;
    const frames = createPreviewFrame(view, scrolling, strings, report);
    let followPending = false;
    let refreshTask;
    let nativePreviewError;
    // Covers queued acquisition, active ownership and draining the final refresh before release.
    let ownershipTask;
    let requestStop;
    let takeoverRequest;
    let takeoverTimer;
    const editors = new WeakSet();
    let channel;
    try {
        if (mainWindow.BroadcastChannel) {
            channel = new mainWindow.BroadcastChannel(
                `a-floating-live-preview-panel:${config.endpoint}:${config.postId}:${config.userId}`
            );
            channel.onmessage = (event) => {
                if (event.data?.type !== 'takeover' || !previewActive) return;
                stopPreview(true);
                report(strings.handedOff, 'conflict', { reason: 'handed-off' });
            };
            mainWindow.addEventListener('pagehide', (event) => { if (!event.persisted) channel.close(); });
        }
    } catch {
        channel?.close();
        channel = null; // Keep manual close/retry when cross-tab messaging is unavailable.
    }

    function report(text, state = 'loading', { canRetry = true, reason = '' } = {}) {
        if (state === 'ready') followPending = false;
        view.report(text, state, {
            canTakeOver: !!channel, hasPreview: frames.hasPreview, previewUrl: frames.address, canRetry, reason,
            canRefresh: previewActive && !nativeEditor.saving && ['ready', 'error'].includes(state) && (state !== 'error' || canRetry),
        });
    }

    function reportFailure(error) {
        // Recovery hints only affect the panel; never reload or alter native editor controls.
        const code = error?.code;
        const reload = [
            'aflpp_invalid_nonce', 'rest_cookie_invalid_nonce', 'aflpp_preview_conflict',
            'aflpp_source_changed', 'aflpp_acf_unavailable',
        ].includes(code);
        const reason = reload ? 'reload'
            : ['aflpp_cannot_preview', 'rest_forbidden', 'rest_cannot_edit'].includes(code) ? 'permission'
                : error?.message === strings.browser ? 'browser' : '';
        if (reason) {
            previewActive = false;
            clearTimeout(refreshTimer);
            frames.cancel();
            requestStop?.();
        }
        const text = typeof code === 'string' || error?.message === strings.browser ? error.message : strings.failed;
        report(text, 'error', { reason, canRetry: !reason });
    }

    function changed() {
        if (!previewActive || capturing) return;
        generation += 1;
        followPending = true;
        frames.cancel();
        clearTimeout(refreshTimer);
        if (nativeEditor.saving) return;
        report(strings.stale, 'stale');
        if (!nativeEditor.previewing) refreshTimer = setTimeout(update, 1000);
    }

    nativeEditor.onAutosave = changed;
    nativeEditor.beforePreview = () => {
        generation += 1;
        clearTimeout(refreshTimer);
        frames.cancel();
        if (previewActive) report(strings.nativePreview);
        return refreshTask;
    };
    nativeEditor.onPreview = (error, saved) => {
        // ACF's remaining row deltas still reference the pre-Preview draft; do not apply them twice.
        if (!error && saved && acf?.hasStructuralPaginationChanges()) {
            error = Object.assign(new Error(strings.nativePreviewAcf), { code: 'aflpp_source_changed' });
        }
        nativePreviewError = error;
        if (!previewActive) return;
        if (error) reportFailure(error);
        else changed();
    };

    function watchEditor(editor) {
        if (!editor || editors.has(editor)) return;
        editors.add(editor);
        editor.on('input change undo redo SetContent', changed);
    }
    if (mainWindow.tinymce) {
        mainWindow.tinymce.editors.forEach(watchEditor);
        mainWindow.tinymce.on('AddEditor', (event) => watchEditor(event.editor));
    }
    function cancelNativeSave() {
        if (!nativeEditor.saving) return;
        nativeEditor.saving = false;
        changed();
    }
    nativeEditor.onSaveCancelled = cancelNativeSave;
    const acf = initAcf?.(form, changed, watchEditor, cancelNativeSave);
    nativeEditor.isValidating = () => acf?.isValidating?.();
    function onFieldChange(event) {
        if (event.target.name === 'post_title') view.setTitle(event.target.value);
        if (['post_title', 'content', 'excerpt'].includes(event.target.name) || acf?.isField(event.target)) changed();
    }
    nativeEditor.onFieldChange = onFieldChange;
    form.addEventListener('input', onFieldChange);
    // Quicktags emits non-bubbling native change events after toolbar and media insertions.
    form.addEventListener('change', onFieldChange, true);

    function capture() {
        capturing = true;
        let values;
        try {
            mainWindow.tinymce?.triggerSave();
            values = new FormData(form);
        } finally { capturing = false; }
        const data = new URLSearchParams();
        for (const [name, value] of values) {
            if (typeof value === 'string' && (
                ['post_title', 'content', 'excerpt'].includes(name) || acf?.accepts(name)
            )) data.append(name, value);
        }
        data.set('base', config.base);
        return data;
    }

    function loadFrame(address, version) {
        return frames.load(address, () => previewActive && version === generation,
            () => view.followChanges && followPending);
    }

    function update() {
        if (!previewActive || refreshTask || nativeEditor.previewing || nativeEditor.saving) return;
        clearTimeout(refreshTimer);
        const version = generation;
        report(strings.updating);
        refreshTask = (async () => {
            try {
                await nativeEditor.idle;
                if (!previewActive || nativeEditor.saving) return;
                const base = config.base;
                const response = await fetch(config.endpoint, {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'X-WP-Nonce': config.nonce }, body: capture(),
                });
                const result = await response.json();
                // An overlapping native draft autosave can invalidate this request and its revision.
                await nativeEditor.idle;
                if (!previewActive || nativeEditor.saving || base !== config.base) return;
                if (!response.ok || typeof result.url !== 'string') {
                    throw Object.assign(new Error(result.message || strings.failed), { code: result.code });
                }
                if (previewActive && version === generation) await loadFrame(result.url, version);
            } catch (error) {
                if (previewActive && !nativeEditor.saving) reportFailure(error);
            } finally {
                refreshTask = null;
                if (previewActive && !nativeEditor.previewing && !nativeEditor.saving && version !== generation) {
                    clearTimeout(refreshTimer);
                    refreshTimer = setTimeout(update, 1000);
                }
            }
        })();
    }

    function discardFrames() {
        generation += 1;
        frames.clear();
    }

    function stopPreview(keepVisible = false) {
        view.setVisible(keepVisible);
        previewActive = false;
        clearTimeout(refreshTimer);
        discardFrames();
        clearTimeout(takeoverTimer);
        takeoverTimer = null;
        takeoverRequest?.abort();
        view.returnToEditor();
        requestStop?.();
    }

    async function startPreview(takeOver = false) {
        view.setVisible(true);
        if (previewActive) return;
        if (nativePreviewError) { reportFailure(nativePreviewError); return; }
        if (ownershipTask) {
            if (takeoverRequest && !takeoverRequest.signal.aborted) return;
            const version = generation;
            try { await ownershipTask; } catch { /* Cancelled or timed-out lock request. */ }
            if (view.visible && version === generation) startPreview(takeOver);
            return;
        }
        if (!config.available) {
            report(strings.unavailable, 'error', { canRetry: false, reason: 'unavailable' });
            return;
        }
        if (!mainWindow.isSecureContext || !navigator.locks) {
            report(strings.browser, 'error', { canRetry: false, reason: 'browser' });
            return;
        }
        const controller = takeOver && channel ? new AbortController() : null;
        let timedOut = false;
        takeoverRequest = controller;
        if (controller) {
            report(strings.waiting, 'handover');
            takeoverTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
        } else report(nativeEditor.saving ? strings.saving : strings.updating);
        try {
            // Queue cooperatively. Never steal: the current owner must finish its PHP write first.
            const options = controller ? { signal: controller.signal } : { ifAvailable: true };
            // Different sites can share an origin and post IDs; users of the same site/post must still contend.
            ownershipTask = navigator.locks.request(`a-floating-live-preview-panel:${config.endpoint}:${config.postId}`, options, async (lock) => {
                clearTimeout(takeoverTimer);
                takeoverTimer = null;
                takeoverRequest = null;
                if (!view.visible || controller?.signal.aborted) return;
                if (!lock) {
                    report(channel ? strings.conflict : strings.closeOther, 'conflict', {
                        reason: channel ? 'other-tab' : 'manual',
                    });
                    return;
                }
                report(nativeEditor.saving ? strings.saving : strings.updating);
                try {
                    await new Promise((resolve) => {
                        requestStop = resolve;
                        previewActive = true;
                        generation += 1;
                        update();
                    });
                    // A cancelled fetch does not cancel a PHP write; finish it before releasing ownership.
                    await refreshTask;
                } finally {
                    requestStop = null;
                }
            });
            if (controller) {
                try { channel.postMessage({ type: 'takeover' }); }
                catch (error) {
                    controller.abort();
                    if (previewActive) stopPreview(true);
                    await ownershipTask.catch(() => {});
                    throw error;
                }
            }
            await ownershipTask;
            if (view.visible && timedOut) report(strings.takeoverTimeout, 'conflict', { reason: 'busy' });
        } catch (error) {
            previewActive = false;
            if (view.visible && timedOut) report(strings.takeoverTimeout, 'conflict', { reason: 'busy' });
            else if (view.visible && error.name !== 'AbortError') reportFailure(error);
        } finally {
            clearTimeout(takeoverTimer);
            takeoverTimer = null;
            takeoverRequest = null;
            ownershipTask = null;
        }
    }

    function refreshPreview() {
        if (nativeEditor.saving) return;
        if (!previewActive) { startPreview(); return; }
        generation += 1;
        frames.cancel();
        update();
    }

    let drainingNativeSave = false;
    function continueNativeSave(event, resume) {
        if (event.defaultPrevented) return;
        if (drainingNativeSave) {
            nativeEditor.deferredSaves?.add(event);
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (nativeEditor.saving) return;
        // Saving is not closing: retain the frame, window and ownership until navigation or cancellation.
        nativeEditor.saving = true;
        generation += 1;
        clearTimeout(refreshTimer);
        frames.cancel();
        if (previewActive) report(strings.saving);
        const pending = refreshTask || (nativeEditor.previewing ? nativeEditor.idle : null);
        if (!pending) return;
        // Our own interception waits for a write; it is not a validation rejection.
        nativeEditor.deferredSaves?.add(event);
        event.preventDefault();
        event.stopImmediatePropagation();
        drainingNativeSave = true;
        const proceed = () => {
            drainingNativeSave = false;
            if (nativeEditor.saving) resume();
        };
        pending.then(proceed, proceed);
    }
    form.addEventListener('click', (event) => {
        const control = event.target.closest('#publish, #save-post');
        // Core ignores disabled controls; do not close the panel or queue a save for that click.
        if (control && !control.disabled && !control.classList.contains('disabled')) {
            continueNativeSave(event, () => control.click());
        }
    }, true);
    form.addEventListener('submit', (event) => {
        if (form.querySelector('#wp-preview')?.value === 'dopreview') return;
        continueNativeSave(event, () => form.requestSubmit(event.submitter || undefined));
    }, true);

    if (view.visible) startPreview();
}
