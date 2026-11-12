// One lifecycle owns field capture, refreshes, Web Locks, takeover and native-save sequencing.
export function initPreview(config, initAcf, nativeEditor, createPreviewPanel, createPreviewScroll) {
    const form = document.getElementById('post');
    if (!config || !form) return;

    const strings = config.strings;
    const mainWindow = window;
    const $ = mainWindow.jQuery;
    const scrolling = createPreviewScroll();
    const view = createPreviewPanel(strings, {
        postTitle: document.getElementById('title')?.value ?? config.postTitle,
        nativeSaving: nativeEditor.saving,
        onOpen: () => startPreview(),
        onClose: () => stopPreview(),
        onRefresh: refreshPreview,
        onRetry: (takeOver) => takeOver ? startPreview(true) : refreshPreview(),
        onError: (message) => report(message, 'error', { canRetry: false }),
        beforeMove: discardFrames,
        afterMove: () => { if (previewActive) refreshPreview(); },
    });

    // Visibility belongs to the view: a shown panel can be active, waiting or paused.
    // Disabling refreshes does not release ownership until the outstanding refresh has drained.
    let previewActive = false;
    let capturing = false;
    let generation = 0;
    let refreshTimer;
    let activeFrame;
    let activeDocument;
    let previewAddress;
    let followPending = false;
    let refreshTask;
    // Covers queued acquisition, active ownership and draining the final refresh before release.
    let ownershipTask;
    let requestStop;
    let takeoverRequest;
    let takeoverTimer;
    let autosavePaused = false;
    let cancelFrame;
    const editors = new WeakSet();
    let channel;
    try {
        if (mainWindow.BroadcastChannel) {
            channel = new mainWindow.BroadcastChannel(
                `floating-live-preview:${config.endpoint}:${config.postId}:${config.userId}`
            );
            channel.onmessage = (event) => {
                if (event.data?.type !== 'takeover' || !previewActive) return;
                stopPreview(true);
                report(strings.handedOff, 'conflict');
            };
            mainWindow.addEventListener('pagehide', (event) => { if (!event.persisted) channel.close(); });
        }
    } catch {
        channel?.close();
        channel = null; // Keep manual close/retry when cross-tab messaging is unavailable.
    }

    function report(text, state = 'loading', { canRetry = true } = {}) {
        view.report(text, state, {
            canTakeOver: !!channel, hasPreview: !!activeFrame, previewUrl: previewAddress, canRetry,
            canRefresh: previewActive && ['ready', 'stale', 'error'].includes(state),
        });
    }

    function changed() {
        if (!previewActive || capturing) return;
        generation += 1;
        followPending = true;
        cancelFrame?.();
        report(strings.stale, 'stale');
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(update, 1000);
    }

    function watchEditor(editor) {
        if (!editor || editors.has(editor)) return;
        editors.add(editor);
        editor.on('input change undo redo SetContent', changed);
    }
    if (mainWindow.tinymce) {
        mainWindow.tinymce.editors.forEach(watchEditor);
        mainWindow.tinymce.on('AddEditor', (event) => watchEditor(event.editor));
    }
    const acf = initAcf?.(form, changed, watchEditor);
    $(form).on('input.flp change.flp', (event) => {
        if (event.target.name === 'post_title') view.setTitle(event.target.value);
        if (['post_title', 'content', 'excerpt'].includes(event.target.name)) changed();
    });

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
        const url = new URL(address);
        if (url.origin === 'null' || url.origin !== mainWindow.location.origin) throw new Error(strings.browser);
        const token = url.searchParams.get('flp_token');
        if (!token) throw new Error(strings.failed);
        previewAddress = url.href;
        // Keep the normal new-tab action pointed at the latest authorized URL, for every output type.
        report(strings.updating);
        return new Promise((resolve, reject) => {
            const frame = view.stage.ownerDocument.createElement('iframe');
            frame.title = strings.title;
            frame.className = 'flp-frame flp-loading';
            frame.setAttribute('aria-hidden', 'true');
            frame.setAttribute('tabindex', '-1');
            // Browser-native output: a sandbox blocks built-in viewers, including Chromium's PDF viewer.
            // Authorization happens on the original WordPress request, not in the final document's DOM.
            frame.referrerPolicy = 'same-origin';
            let settled = false;
            const timeout = setTimeout(() => finish(new Error(strings.failed)), 30000);
            const cancel = () => finish();
            cancelFrame = cancel;
            function finish(error) {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (cancelFrame === cancel) cancelFrame = null;
                if (frame !== activeFrame) {
                    frame.onload = null;
                    frame.onerror = null;
                    frame.remove();
                }
                if (error) reject(error);
                else resolve();
            }
            frame.onload = () => {
                const replacing = frame !== activeFrame;
                // Native navigation may replace even a previously verified HTML document.
                if (!replacing) activeDocument = null;
                if (!previewActive || version !== generation) { finish(); return; }
                let doc;
                try {
                    const candidate = frame.contentDocument;
                    const marker = candidate?.querySelector('meta[name="floating-live-preview"]');
                    if (marker?.content === token) doc = candidate;
                } catch { /* Cross-origin and browser-owned documents are not inspectable. */ }
                let target;
                if (doc && replacing) {
                    scrolling.remember(activeDocument);
                    if (view.followChanges && followPending && activeDocument) {
                        target = scrolling.findTarget(activeDocument, doc);
                    }
                }
                if (replacing && activeFrame) {
                    activeFrame.onload = null;
                    activeFrame.onerror = null;
                    activeFrame.remove();
                }
                activeFrame = frame;
                activeDocument = doc;
                frame.classList.remove('flp-loading');
                frame.removeAttribute('aria-hidden');
                frame.removeAttribute('tabindex');
                if (doc && replacing) scrolling.restore(doc, target);
                followPending = false;
                // This reports a completed refresh, not verified content. The marker only enables HTML enhancements.
                report(strings.current, 'ready');
                finish();
            };
            frame.onerror = () => {
                if (frame === activeFrame) {
                    activeDocument = null;
                    if (previewActive && version === generation) report(strings.failed, 'error');
                } else finish(new Error(strings.failed));
            };
            frame.src = url.href;
            view.stage.append(frame);
        });
    }

    function update() {
        if (!previewActive || refreshTask) return;
        clearTimeout(refreshTimer);
        const version = generation;
        report(strings.updating);
        refreshTask = (async () => {
            try {
                await nativeEditor.idle;
                if (!previewActive) return;
                const response = await fetch(config.endpoint, {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'X-WP-Nonce': config.nonce }, body: capture(),
                });
                const result = await response.json();
                if (!response.ok || typeof result.url !== 'string') throw new Error(result.message || strings.failed);
                if (previewActive && version === generation) await loadFrame(result.url, version);
            } catch (error) {
                if (previewActive) report(error.message || strings.failed, 'error');
            } finally {
                refreshTask = null;
                if (previewActive && version !== generation) {
                    clearTimeout(refreshTimer);
                    refreshTimer = setTimeout(update, 1000);
                }
            }
        })();
    }

    function discardFrames() {
        generation += 1;
        cancelFrame?.();
        scrolling.remember(activeDocument);
        if (activeFrame) {
            activeFrame.onload = null;
            activeFrame.onerror = null;
        }
        activeFrame = null;
        activeDocument = null;
        previewAddress = null;
        view.clearPreview();
    }

    function resumeAutosave() {
        if (!autosavePaused || view.visible || refreshTask) return;
        mainWindow.wp?.autosave?.server.resume();
        autosavePaused = false;
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
        resumeAutosave();
    }

    async function startPreview(takeOver = false) {
        view.setVisible(true);
        if (previewActive) return;
        if (ownershipTask) {
            if (takeoverRequest && !takeoverRequest.signal.aborted) return;
            const version = generation;
            try { await ownershipTask; } catch { /* Cancelled or timed-out lock request. */ }
            if (view.visible && version === generation) startPreview(takeOver);
            return;
        }
        if (!config.available) { report(strings.unavailable, 'error', { canRetry: false }); return; }
        if (!mainWindow.isSecureContext || !navigator.locks) { report(strings.browser, 'error', { canRetry: false }); return; }
        if (!autosavePaused) {
            mainWindow.wp?.autosave?.server.suspend();
            autosavePaused = true;
        }
        const controller = takeOver && channel ? new AbortController() : null;
        let timedOut = false;
        takeoverRequest = controller;
        if (controller) {
            report(strings.waiting, 'handover');
            takeoverTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
        } else report(strings.updating);
        try {
            // Queue cooperatively. Never steal: the current owner must finish its PHP write first.
            const options = controller ? { signal: controller.signal } : { ifAvailable: true };
            // Different sites can share an origin and post IDs; users of the same site/post must still contend.
            ownershipTask = navigator.locks.request(`floating-live-preview:${config.endpoint}:${config.postId}`, options, async (lock) => {
                clearTimeout(takeoverTimer);
                takeoverTimer = null;
                takeoverRequest = null;
                if (!view.visible || controller?.signal.aborted) return;
                if (!lock) { report(channel ? strings.conflict : strings.closeOther, 'conflict'); return; }
                report(strings.updating);
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
                    resumeAutosave();
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
            if (view.visible && timedOut) report(strings.takeoverTimeout, 'conflict');
        } catch (error) {
            previewActive = false;
            if (view.visible && timedOut) report(strings.takeoverTimeout, 'conflict');
            else if (view.visible && error.name !== 'AbortError') report(error.message || strings.failed, 'error');
        } finally {
            clearTimeout(takeoverTimer);
            takeoverTimer = null;
            takeoverRequest = null;
            ownershipTask = null;
            resumeAutosave();
        }
    }

    function refreshPreview() {
        if (!previewActive) { startPreview(); return; }
        generation += 1;
        cancelFrame?.();
        update();
    }

    let resumingNativeSave = false;
    function continueAfterPreview(event, resume) {
        if (resumingNativeSave || (!previewActive && !refreshTask && !ownershipTask && !autosavePaused)) return;
        const pending = ownershipTask || refreshTask;
        stopPreview();
        if (!pending) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        report(strings.saving);
        const proceed = () => {
            resumingNativeSave = true;
            try { resume(); } finally { resumingNativeSave = false; }
        };
        pending.then(proceed, proceed);
    }
    form.addEventListener('click', (event) => {
        const control = event.target.closest('#publish, #save-post, #post-preview');
        if (control) continueAfterPreview(event, () => control.click());
    }, true);
    form.addEventListener('submit', (event) => {
        continueAfterPreview(event, () => form.requestSubmit(event.submitter || undefined));
    }, true);

    if (view.visible) startPreview();
}
