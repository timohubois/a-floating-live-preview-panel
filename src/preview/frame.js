// Own iframe loading and optional HTML enhancements, not the source's writes or selection lifecycle.
export function createPreviewFrame(view, scrolling, strings, report) {
    let activeFrame;
    let activeDocument;
    let address;
    let cancelLoad;

    function cancel() {
        cancelLoad?.();
    }

    function load(nextAddress, isCurrent, followChanges = () => false) {
        const url = new URL(nextAddress);
        if (url.origin === 'null' || url.origin !== window.location.origin) throw new Error(strings.browser);
        const token = url.searchParams.get('aflpp_token');
        if (!token) throw new Error(strings.failed);
        // Isolated editors cannot inspect otherwise same-origin, non-isolated preview documents.
        if (window.crossOriginIsolated) url.searchParams.set('aflpp_isolated', '1');
        cancel();
        address = url.href;
        // Keep the new-tab action available for every output type, including browser-native viewers.
        report(strings.updating);
        return new Promise((resolve, reject) => {
            const frame = view.stage.ownerDocument.createElement('iframe');
            frame.title = strings.title;
            frame.className = 'aflpp-frame aflpp-loading';
            frame.setAttribute('aria-hidden', 'true');
            frame.setAttribute('tabindex', '-1');
            // Authorization is server-side; sandboxing would block native output such as Chromium's PDF viewer.
            frame.referrerPolicy = 'same-origin';
            let settled = false;
            const timeout = setTimeout(() => finish(new Error(strings.failed)), 30000);
            const cancel = () => finish();
            cancelLoad = cancel;
            function finish(error) {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (cancelLoad === cancel) cancelLoad = null;
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
                if (!replacing) activeDocument = null;
                if (!isCurrent()) { finish(); return; }
                let doc;
                try {
                    const candidate = frame.contentDocument;
                    const marker = candidate?.querySelector('meta[name="a-floating-live-preview-panel"]');
                    if (marker?.content === token) doc = candidate;
                } catch { /* Cross-origin and browser-owned documents are not inspectable. */ }
                let target;
                if (doc && replacing) {
                    scrolling.remember(activeDocument);
                    if (followChanges() && activeDocument) target = scrolling.findTarget(activeDocument, doc);
                }
                if (replacing && activeFrame) {
                    activeFrame.onload = null;
                    activeFrame.onerror = null;
                    activeFrame.remove();
                }
                activeFrame = frame;
                activeDocument = doc;
                frame.classList.remove('aflpp-loading');
                frame.removeAttribute('aria-hidden');
                frame.removeAttribute('tabindex');
                if (doc && replacing) scrolling.restore(doc, target);
                // A load is not proof of valid content; only marked HTML receives scroll enhancements.
                report(strings.current, 'ready');
                finish();
            };
            frame.onerror = () => {
                if (frame === activeFrame) {
                    activeDocument = null;
                    if (isCurrent()) report(strings.failed, 'error');
                } else finish(new Error(strings.failed));
            };
            frame.src = url.href;
            view.stage.append(frame);
        });
    }

    return {
        get hasPreview() { return !!activeFrame; },
        get address() { return address; },
        load,
        cancel,
        clear() {
            cancel();
            scrolling.remember(activeDocument);
            if (activeFrame) {
                activeFrame.onload = null;
                activeFrame.onerror = null;
            }
            activeFrame = null;
            activeDocument = null;
            address = null;
            view.clearPreview();
        },
    };
}
