// Bind the PHP-rendered panel. Never capture fields, fetch previews, acquire locks or control native saves.
export function createPreviewPanel(strings, {
    postTitle = '', nativeSaving, onOpen, onClose, onRefresh, onRetry, onError, beforeMove, afterMove,
}, createPreviewViewport) {
    const mainWindow = window;
    const mainDocument = document;
    const scope = 'a-floating-live-preview-panel';
    const preferences = mainWindow.wp.data.select('core/preferences');
    const preferenceActions = mainWindow.wp.data.dispatch('core/preferences');
    preferenceActions.setDefaults(scope, {
        rememberVisibility: true, panelOpen: true, scrollToChanges: true, viewport: 'desktop',
    });
    let rememberVisibility = preferences.get(scope, 'rememberVisibility') !== false;
    let followChanges = preferences.get(scope, 'scrollToChanges') !== false;
    const showOnLoad = (!rememberVisibility || preferences.get(scope, 'panelOpen') !== false) && !nativeSaving;
    const launcher = mainDocument.getElementById('aflpp-toggle');
    const panel = mainDocument.getElementById('aflpp-panel');
    if (!launcher || !panel) throw new Error('Preview panel markup is missing.');

    const move = panel.querySelector('.aflpp-move');
    const dot = panel.querySelector('.aflpp-dot');
    const caption = panel.querySelector('.aflpp-caption');
    const refresh = panel.querySelector('[data-action="refresh"]');
    const modeButton = panel.querySelector('.aflpp-mode');
    const actions = panel.querySelector('.aflpp-actions');
    const actionsToggle = actions.querySelector('summary');
    const pip = panel.querySelector('[data-action="pip"]');
    const fullscreen = panel.querySelector('[data-action="fullscreen"]');
    const reset = panel.querySelector('[data-action="reset"]');
    const dockLeft = panel.querySelector('[data-action="dock-left"]');
    const dockRight = panel.querySelector('[data-action="dock-right"]');
    const rememberVisibilityOption = panel.querySelector('[data-action="remember-visibility"]');
    const follow = panel.querySelector('[data-action="follow"]');
    const openPreview = panel.querySelector('.aflpp-open-preview');
    const displayGroup = panel.querySelector('[data-group="display"]');
    const layoutGroup = panel.querySelector('[data-group="layout"]');
    const close = panel.querySelector('[data-action="close"]');
    const viewport = panel.querySelector('.aflpp-viewport');
    const stage = panel.querySelector('.aflpp-stage');
    const empty = panel.querySelector('.aflpp-empty');
    const dimensions = panel.querySelector('.aflpp-dimensions');
    const feedback = panel.querySelector('.aflpp-feedback');
    const errorText = panel.querySelector('.aflpp-error');
    const retry = panel.querySelector('[data-action="retry"]');
    const retryText = panel.querySelector('.aflpp-retry-label');
    const status = panel.querySelector('[role="status"]');
    const responsiveViewport = createPreviewViewport(viewport, stage, dimensions, preferences.get(scope, 'viewport'));
    const deviceButtons = panel.querySelectorAll('[data-viewport]');

    function label(button, text) {
        button.setAttribute('aria-label', text);
        button.title = text;
    }

    rememberVisibilityOption.setAttribute('aria-pressed', String(rememberVisibility));
    follow.setAttribute('aria-pressed', String(followChanges));
    for (const control of deviceButtons) {
        const name = control.dataset.viewport;
        control.setAttribute('aria-pressed', String(name === responsiveViewport.device));
        control.addEventListener('click', () => {
            if (responsiveViewport.device !== name) preferenceActions.set(scope, 'viewport', name);
            for (const node of deviceButtons) node.setAttribute('aria-pressed', String(node === control));
            responsiveViewport.select(name, visible);
        });
    }
    openPreview.addEventListener('click', () => {
        actions.open = false;
        actionsToggle.focus({ preventScroll: true });
    });

    let visible = showOnLoad;
    let pipWindow;
    let expanded = false;
    let takeOverAction = false;
    const bounds = { x: 0, y: 0, width: 480, height: 340 };
    let dock = 'right';

    function labelMove() {
        const fixed = pipWindow || expanded || panel.ownerDocument.fullscreenElement === panel;
        move.setAttribute('aria-label', fixed ? caption.textContent : `${caption.textContent} — ${strings.move}`);
    }

    function setTitle(value) {
        // The editor's identity, not an iframe title or a claim that the preview is current/published.
        const title = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
        caption.textContent = title ? `${strings.preview} — ${title}` : strings.title;
        move.title = caption.textContent;
        if (pipWindow) pipWindow.document.title = caption.textContent;
        labelMove();
    }
    setTitle(postTitle);

    function report(text, state = 'loading', {
        canTakeOver = false, hasPreview = false, previewUrl, canRefresh = false, canRetry = true,
    } = {}) {
        panel.dataset.state = state;
        status.textContent = text;
        dot.title = text;
        launcher.title = `${strings.title} — ${text}`;
        feedback.hidden = !['error', 'conflict', 'handover'].includes(state);
        // Keep the ordinary new-tab action stable across refresh/blur; it is not an output warning.
        openPreview.hidden = !previewUrl;
        displayGroup.hidden = openPreview.hidden && pip.hidden && fullscreen.hidden;
        if (previewUrl) openPreview.href = previewUrl;
        else openPreview.removeAttribute('href');
        const takingOver = state === 'handover';
        takeOverAction = canTakeOver && (state === 'conflict' || takingOver);
        const action = takeOverAction ? (takingOver ? strings.takingOver : strings.takeOver) : strings.retry;
        if (retry.title !== action) {
            label(retry, action);
            retry.classList.toggle('aflpp-takeover', takeOverAction);
            for (const icon of retry.querySelectorAll('[data-icon]')) {
                icon.toggleAttribute('hidden', icon.dataset.icon !== (takeOverAction ? 'takeover' : 'retry'));
            }
            retryText.textContent = action;
            retryText.hidden = !takeOverAction;
        }
        refresh.disabled = !canRefresh;
        retry.hidden = !takeOverAction && !(canRetry && ['error', 'conflict'].includes(state));
        retry.disabled = takingOver;
        errorText.textContent = text;
        errorText.title = errorText.textContent;
        empty.textContent = feedback.hidden ? strings.loading : text;
        empty.hidden = hasPreview;
    }

    follow.addEventListener('click', () => {
        followChanges = !followChanges;
        preferenceActions.set(scope, 'scrollToChanges', followChanges);
        follow.setAttribute('aria-pressed', String(followChanges));
    });
    function rememberPanelVisibility(value) {
        if (rememberVisibility && preferences.get(scope, 'panelOpen') !== value) {
            preferenceActions.set(scope, 'panelOpen', value);
        }
    }
    rememberVisibilityOption.addEventListener('click', () => {
        rememberVisibility = !rememberVisibility;
        preferenceActions.set(scope, 'rememberVisibility', rememberVisibility);
        // Re-enabling adopts the current panel, rather than restoring an older hidden state next time.
        if (rememberVisibility) rememberPanelVisibility(visible);
        rememberVisibilityOption.setAttribute('aria-pressed', String(rememberVisibility));
    });

    function fit(next = bounds) {
        const gap = 16;
        const width = Math.max(1, mainWindow.innerWidth - gap * 2);
        const height = Math.max(1, mainWindow.innerHeight - 64);
        next.width = Math.min(width, Math.max(Math.min(320, width), next.width));
        next.height = Math.min(height, Math.max(Math.min(220, height), next.height));
        next.x = Math.max(gap, Math.min(mainWindow.innerWidth - next.width - gap, next.x));
        next.y = Math.max(48, Math.min(mainWindow.innerHeight - next.height - gap, next.y));
        return next;
    }

    function draw() {
        if (pipWindow) return;
        const rect = expanded
            ? { x: 12, y: 44, width: mainWindow.innerWidth - 24, height: mainWindow.innerHeight - 56 }
            : fit();
        Object.assign(panel.style, {
            left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`, transform: '',
        });
        panel.style.setProperty('--aflpp-menu-height', `${Math.max(1, rect.height - 48)}px`);
    }

    function dockWindow(side = 'right', resetSize = false) {
        if (resetSize) Object.assign(bounds, { width: 480, height: 340 });
        expanded = false;
        dock = side;
        fit();
        bounds.x = side === 'left' ? 16 : mainWindow.innerWidth - bounds.width - 16;
        bounds.y = mainWindow.innerHeight - bounds.height - 16;
        draw();
        syncControls();
    }

    function syncControls() {
        const full = panel.ownerDocument.fullscreenElement === panel;
        const inPage = !pipWindow && !full;
        label(modeButton, pipWindow ? strings.return : full ? strings.exitFullscreen : expanded ? strings.compact : strings.expand);
        const mode = pipWindow ? 'return' : full || expanded ? 'compact' : 'expand';
        for (const icon of modeButton.querySelectorAll('[data-icon]')) {
            icon.toggleAttribute('hidden', icon.dataset.icon !== mode);
        }
        pip.hidden = !inPage || !mainWindow.documentPictureInPicture;
        fullscreen.hidden = !inPage || !mainDocument.fullscreenEnabled;
        displayGroup.hidden = openPreview.hidden && pip.hidden && fullscreen.hidden;
        layoutGroup.hidden = !inPage;
        labelMove();
        panel.classList.toggle('aflpp-expanded', expanded);
    }

    function toggleMode() {
        actions.open = false;
        if (pipWindow) { pipWindow.close(); return; }
        if (mainDocument.fullscreenElement === panel) {
            mainDocument.exitFullscreen().catch((error) => onError(error.message));
            return;
        }
        expanded = !expanded;
        dock = null;
        draw();
        syncControls();
        modeButton.focus({ preventScroll: true });
    }

    modeButton.addEventListener('click', toggleMode);
    move.addEventListener('dblclick', () => { if (!pipWindow) toggleMode(); });
    fullscreen.addEventListener('click', async () => {
        if (fullscreen.hidden) return;
        actions.open = false;
        try {
            await panel.requestFullscreen();
            modeButton.focus({ preventScroll: true });
        } catch (error) { actionsToggle.focus({ preventScroll: true }); onError(error.message); }
    });
    mainDocument.addEventListener('fullscreenchange', syncControls);
    for (const [control, side, resetSize] of [[reset, 'right', true], [dockLeft, 'left'], [dockRight, 'right']]) {
        control.addEventListener('click', () => {
            if (layoutGroup.hidden) return;
            actions.open = false;
            dockWindow(side, resetSize);
            actionsToggle.focus({ preventScroll: true });
        });
    }

    function dismissActions(event) {
        if (event.type === 'keydown' && event.key === 'Escape' && actions.open) {
            actions.open = false;
            actionsToggle.focus();
            event.preventDefault();
        } else if (event.type === 'pointerdown' && !actions.contains(event.target)) actions.open = false;
    }
    mainDocument.addEventListener('pointerdown', dismissActions);
    mainDocument.addEventListener('keydown', dismissActions);

    // Pointer and keyboard resizing move the same edge, keeping the opposite edge fixed.
    function resizeBounds(start, edge, dx, dy) {
        const minWidth = Math.min(320, Math.max(1, mainWindow.innerWidth - 32));
        const minHeight = Math.min(220, Math.max(1, mainWindow.innerHeight - 64));
        const left = edge.includes('w') ? Math.max(16, Math.min(start.x + dx, start.x + start.width - minWidth)) : start.x;
        const top = edge.includes('n') ? Math.max(48, Math.min(start.y + dy, start.y + start.height - minHeight)) : start.y;
        const right = edge.includes('e') ? Math.min(mainWindow.innerWidth - 16, Math.max(start.x + start.width + dx, left + minWidth)) : start.x + start.width;
        const bottom = edge.includes('s') ? Math.min(mainWindow.innerHeight - 16, Math.max(start.y + start.height + dy, top + minHeight)) : start.y + start.height;
        return { x: left, y: top, width: right - left, height: bottom - top };
    }

    // Move with a compositor transform; commit bounds on release. Resize is batched once per frame.
    function geometryControl(control, edge) {
        let drag;
        let animation;
        function paint() {
            animation = null;
            if (!drag) return;
            if (edge === 'move') {
                panel.style.transform = `translate3d(${bounds.x - drag.x}px, ${bounds.y - drag.y}px, 0)`;
            } else draw();
        }
        function finish() {
            if (!drag) return;
            const pointer = drag.pointer;
            drag = null;
            mainWindow.cancelAnimationFrame(animation);
            if (control.hasPointerCapture(pointer)) control.releasePointerCapture(pointer);
            panel.classList.remove('aflpp-dragging');
            mainDocument.documentElement.classList.remove('aflpp-window-dragging');
            mainDocument.documentElement.style.removeProperty('--aflpp-drag-cursor');
            draw();
        }
        control.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || pipWindow || expanded || mainDocument.fullscreenElement === panel) return;
            event.preventDefault();
            control.focus({ preventScroll: true });
            dock = null;
            actions.open = false;
            drag = { ...bounds, pointer: event.pointerId, pointerX: event.clientX, pointerY: event.clientY };
            control.setPointerCapture(event.pointerId);
        });
        control.addEventListener('pointermove', (event) => {
            if (!drag || drag.pointer !== event.pointerId) return;
            const dx = event.clientX - drag.pointerX;
            const dy = event.clientY - drag.pointerY;
            if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
            drag.moved = true;
            panel.classList.add('aflpp-dragging');
            mainDocument.documentElement.style.setProperty(
                '--aflpp-drag-cursor', edge === 'move' ? 'grabbing' : mainWindow.getComputedStyle(control).cursor
            );
            mainDocument.documentElement.classList.add('aflpp-window-dragging');
            if (edge === 'move') {
                Object.assign(bounds, fit({ x: drag.x + dx, y: drag.y + dy, width: drag.width, height: drag.height }));
            } else Object.assign(bounds, resizeBounds(drag, edge, dx, dy));
            if (!animation) animation = mainWindow.requestAnimationFrame(paint);
        });
        for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) control.addEventListener(event, finish);
        mainWindow.addEventListener('blur', finish);
        control.addEventListener('keydown', (event) => {
            const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
            if (
                !delta || event.altKey || event.ctrlKey || event.metaKey
                || pipWindow || expanded || mainDocument.fullscreenElement === panel
            ) return;
            if (edge !== 'move' && !(delta[0] ? /[ew]/.test(edge) : /[ns]/.test(edge))) return;
            event.preventDefault();
            dock = null;
            const step = event.shiftKey ? 40 : 10;
            if (edge === 'move') {
                bounds.x += delta[0] * step;
                bounds.y += delta[1] * step;
            } else Object.assign(bounds, resizeBounds(bounds, edge, delta[0] * step, delta[1] * step));
            draw();
        });
    }
    geometryControl(move, 'move');
    for (const handle of panel.querySelectorAll('[data-edge]')) {
        geometryControl(handle, handle.dataset.edge);
    }
    mainWindow.addEventListener('resize', () => {
        if (dock && !expanded) dockWindow(dock);
        else draw();
    });

    pip.addEventListener('click', async () => {
        if (pip.hidden) return;
        actions.open = false;
        try {
            // This must run directly from a user gesture; browsers cannot auto-open native PiP.
            const detached = await mainWindow.documentPictureInPicture.requestWindow({ width: 640, height: 440 });
            if (!visible) { detached.close(); return; }
            pipWindow = detached;
            actions.open = false;
            beforeMove();
            const theme = mainWindow.getComputedStyle(panel);
            for (const name of ['--wp-admin-theme-color', '--wp-admin-theme-color-darker-10', '--wp-admin-border-width-focus']) {
                const value = theme.getPropertyValue(name);
                if (value) detached.document.documentElement.style.setProperty(name, value);
            }
            const stylesheet = mainDocument.getElementById('a-floating-live-preview-panel-css');
            if (stylesheet) {
                const copy = stylesheet.cloneNode(true);
                copy.addEventListener('load', responsiveViewport.layout, { once: true });
                detached.document.head.append(copy);
            }
            detached.document.title = caption.textContent;
            detached.document.body.className = 'aflpp-pip-document';
            panel.classList.add('aflpp-pip');
            detached.document.body.append(panel);
            responsiveViewport.layout();
            detached.addEventListener('resize', responsiveViewport.layout);
            detached.document.addEventListener('pointerdown', dismissActions);
            detached.document.addEventListener('keydown', dismissActions);
            detached.addEventListener('pagehide', () => {
                beforeMove();
                mainDocument.body.append(panel);
                panel.classList.remove('aflpp-pip');
                pipWindow = null;
                draw();
                responsiveViewport.layout();
                syncControls();
                // Moving an iframe between documents can reload it. Refresh from current editor values.
                afterMove();
                if (visible) modeButton.focus({ preventScroll: true });
            }, { once: true });
            syncControls();
            modeButton.focus({ preventScroll: true });
            afterMove();
        } catch (error) { actionsToggle.focus({ preventScroll: true }); onError(error.message || strings.pipUnavailable); }
    });

    // Only explicit user opening/closing changes the preference, never coordinator cleanup or window moves.
    close.addEventListener('click', () => {
        rememberPanelVisibility(false);
        onClose();
        launcher.focus();
    });
    launcher.addEventListener('click', () => {
        rememberPanelVisibility(true);
        onOpen();
    });
    refresh.addEventListener('click', () => { if (!refresh.disabled) onRefresh(); });
    retry.addEventListener('click', () => { if (!retry.disabled && !retry.hidden) onRetry(takeOverAction); });
    dockWindow('right', true);
    // Reveal only after binding controls and positioning the server-rendered panel.
    panel.hidden = !visible;
    launcher.hidden = visible;
    launcher.setAttribute('aria-expanded', String(visible));

    return {
        // The coordinator owns frame contents; the panel owns their document and viewport geometry.
        stage,
        get visible() { return visible; },
        get followChanges() { return followChanges; },
        setVisible(value) {
            if (!value) responsiveViewport.layout();
            visible = value;
            panel.hidden = !visible;
            launcher.hidden = visible;
            launcher.setAttribute('aria-expanded', String(visible));
        },
        report,
        setTitle,
        clearPreview() {
            stage.replaceChildren();
            empty.hidden = false;
        },
        returnToEditor() {
            actions.open = false;
            pipWindow?.close();
            if (mainDocument.fullscreenElement === panel) mainDocument.exitFullscreen().catch(() => {});
        },
    };
}
