import { select, dispatch } from '@wordpress/data';
import { store as preferencesStore } from '@wordpress/preferences';

// Bind the PHP-rendered panel. Never capture fields, fetch previews, acquire locks or control native saves.
export function createPreviewPanel(strings, {
    postTitle = '', onOpen, onClose, onRefresh, onRetry, beforeMove, afterMove,
}, createPreviewViewport, createPreviewControls) {
    const mainWindow = window;
    const mainDocument = document;
    const scope = 'a-floating-live-preview-panel';
    const preferences = select(preferencesStore);
    const preferenceActions = dispatch(preferencesStore);
    preferenceActions.setDefaults(scope, {
        rememberVisibility: true, panelOpen: true, scrollToChanges: true, viewport: 'desktop',
    });
    let rememberVisibility = preferences.get(scope, 'rememberVisibility') !== false;
    let followChanges = preferences.get(scope, 'scrollToChanges') !== false;
    const showOnLoad = !rememberVisibility || preferences.get(scope, 'panelOpen') !== false;
    const launcher = mainDocument.getElementById('aflpp-toggle');
    const panel = mainDocument.getElementById('aflpp-panel');
    if (!launcher || !panel) throw new Error('Preview panel markup is missing.');

    const move = panel.querySelector('.aflpp-move');
    const dot = panel.querySelector('.aflpp-dot');
    const statusTooltip = panel.querySelector('.aflpp-status-tooltip');
    const caption = panel.querySelector('.aflpp-caption');
    const openPreviews = panel.querySelectorAll('.aflpp-open-preview');
    const viewport = panel.querySelector('.aflpp-viewport');
    const stage = panel.querySelector('.aflpp-stage');
    const empty = panel.querySelector('.aflpp-empty');
    const emptyTitle = empty.querySelector('.aflpp-empty-title');
    const emptyDescription = empty.querySelector('.aflpp-empty-description');
    const emptyNote = empty.querySelector('.aflpp-empty-note');
    const emptyActions = empty.querySelector('.aflpp-empty-actions');
    const emptyRetry = empty.querySelector('[data-action="retry"]');
    const emptyClose = empty.querySelector('[data-action="close"]');
    const emptyPreview = empty.querySelector('.aflpp-open-preview');
    const spinner = empty.querySelector('.aflpp-spinner');
    const devicebar = panel.querySelector('.aflpp-devicebar');
    const dimensions = panel.querySelector('.aflpp-dimensions');
    const feedback = panel.querySelector('.aflpp-feedback');
    const feedbackTitle = feedback.querySelector('.aflpp-feedback-title');
    const feedbackDescription = feedback.querySelector('.aflpp-feedback-description');
    const feedbackRetry = feedback.querySelector('[data-action="retry"]');
    const feedbackClose = feedback.querySelector('[data-action="close"]');
    const dismissNotice = feedback.querySelector('[data-action="dismiss-notice"]');
    const status = panel.querySelector('[role="status"]');
    const responsiveViewport = createPreviewViewport(viewport, stage, dimensions, preferences.get(scope, 'viewport'));

    function label(button, text) {
        button.setAttribute('aria-label', text);
        button.title = text;
    }

    // Native titles cover hover; expose the same status on keyboard focus, dismissible with Escape.
    move.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') move.classList.add('aflpp-status-dismissed');
    });
    move.addEventListener('blur', () => move.classList.remove('aflpp-status-dismissed'));

    let visible = showOnLoad;
    let pipWindow;
    const saved = preferences.get(scope, 'layout');
    const validLayout = saved && !Array.isArray(saved) && saved.bounds
        && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(saved.bounds[key]))
        && saved.bounds.width > 0 && saved.bounds.height > 0
        && [null, 'left', 'center', 'right'].includes(saved.dock) && typeof saved.expanded === 'boolean';
    let expanded = validLayout ? saved.expanded : false;
    let controls;
    let takeOverAction = false;
    let windowNotice = '';
    let current = {
        text: strings.loading, state: 'loading', hasPreview: false, canRetry: false, reason: '',
    };
    const bounds = validLayout ? { ...saved.bounds } : { x: 0, y: 0, width: 480, height: 340 };
    let dock = validLayout ? saved.dock : 'right';

    function labelMove() {
        const fixed = pipWindow || expanded || panel.ownerDocument.fullscreenElement === panel;
        move.setAttribute('aria-label', fixed ? caption.textContent : `${caption.textContent} — ${strings.move}`);
        move.title = `${caption.textContent} — ${current.text}`;
    }

    function setTitle(value) {
        // The editor's identity, not an iframe title or a claim that the preview is current/published.
        const title = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
        caption.textContent = title ? `${strings.preview} — ${title}` : strings.title;
        if (pipWindow) pipWindow.document.title = caption.textContent;
        labelMove();
    }
    setTitle(postTitle);

    function copy(node, text) {
        node.textContent = text;
        node.hidden = !text;
    }

    function presentation() {
        const { text, state, hasPreview, reason } = current;
        let heading = text;
        let description = '';
        let note = '';
        if (state === 'handover') {
            heading = strings.switchingPreview;
            description = text;
            note = strings.tabEdits;
        } else if (state === 'conflict') {
            description = {
                'handed-off': strings.handedOffHelp,
                busy: strings.takeoverTimeoutHelp,
                manual: strings.closeOtherHelp,
            }[reason] || strings.conflictHelp;
            note = reason === 'manual' ? strings.manualSwitchHint : strings.tabEdits;
        } else if (state === 'error') {
            if (reason === 'unavailable' || reason === 'browser') {
                heading = reason === 'unavailable' ? strings.unavailableTitle : strings.browserTitle;
                description = text;
            } else if (!hasPreview) {
                heading = strings.failed;
                description = text === strings.failed ? strings.failedHelp : text;
                if (reason === 'reload') description += ` ${strings.reviewBeforeReload}`;
            } else {
                if (text === strings.failed) heading = strings.refreshFailed;
                description = reason === 'reload' ? strings.reviewBeforeReload : strings.previousPreview;
            }
        } else if (!hasPreview) {
            heading = strings.loading;
            description = strings.preparing;
        }
        return { heading, description, note };
    }

    function restoreFocus(focused) {
        if (!focused || !panel.contains(focused)) return;
        if (!focused.closest('[hidden]') && !focused.disabled) return;
        if (!empty.hidden) emptyTitle.focus({ preventScroll: true });
        else controls.focus(current.canRefresh ? 'refresh' : 'mode');
    }

    function renderFeedback() {
        const { state, hasPreview, canRetry, reason } = current;
        const problem = hasPreview && ['error', 'conflict', 'handover'].includes(state);
        const { heading, description } = presentation();
        feedback.hidden = !problem && !windowNotice;
        feedback.dataset.tone = problem && state === 'error' ? 'error' : 'notice';
        copy(feedbackTitle, problem ? heading : windowNotice);
        copy(feedbackDescription, problem ? description : windowNotice ? strings.windowNoticeHelp : '');
        feedbackRetry.hidden = !problem || !(takeOverAction || (canRetry && ['error', 'conflict'].includes(state)));
        feedbackClose.hidden = !(problem && state === 'error' && !canRetry && reason !== 'reload');
        dismissNotice.hidden = problem || !windowNotice;
        panel.dataset.hasFeedback = String(!feedback.hidden);
    }

    // A failed window operation must not change preview ownership, readiness or refresh controls.
    function showWindowNotice(text) {
        if (!(current.hasPreview && ['error', 'conflict', 'handover'].includes(current.state))) {
            windowNotice = text;
            renderFeedback();
        }
        status.textContent = `${text} ${strings.windowNoticeHelp}`;
    }

    function clearWindowNotice() {
        windowNotice = '';
        renderFeedback();
    }

    function report(text, state = 'loading', {
        canTakeOver = false, hasPreview = false, previewUrl, canRefresh = false, canRetry = true, reason = '',
    } = {}) {
        const focused = panel.ownerDocument.activeElement;
        const resetEmptyScroll = !hasPreview && (current.state !== state || current.text !== text || current.reason !== reason);
        current = { text, state, canTakeOver, hasPreview, previewUrl, canRefresh, canRetry, reason };
        if (['error', 'conflict', 'handover'].includes(state)) windowNotice = '';
        panel.dataset.state = state;
        panel.dataset.hasPreview = String(hasPreview);
        dot.title = text;
        statusTooltip.textContent = text;
        labelMove();
        // Keep the ordinary new-tab action stable across refresh/blur; only the empty-state fallback is conditional.
        for (const link of openPreviews) {
            link.hidden = !previewUrl;
            if (previewUrl) link.href = previewUrl;
            else link.removeAttribute('href');
        }
        const takingOver = state === 'handover';
        takeOverAction = canTakeOver && (state === 'conflict' || takingOver);
        const action = takeOverAction ? (takingOver ? strings.takingOver : strings.takeOver) : strings.retry;
        for (const button of [emptyRetry, feedbackRetry]) {
            label(button, action);
            button.textContent = action;
            button.disabled = takingOver;
        }
        empty.hidden = hasPreview;
        devicebar.hidden = !hasPreview;
        const { heading, description, note } = presentation();
        copy(emptyTitle, heading);
        copy(emptyDescription, description);
        copy(emptyNote, note);
        spinner.hidden = hasPreview || !['loading', 'stale', 'ready'].includes(state);
        emptyRetry.hidden = hasPreview || !(takeOverAction || (canRetry && ['error', 'conflict'].includes(state)));
        emptyPreview.hidden = hasPreview || !previewUrl || state !== 'error';
        emptyClose.hidden = hasPreview || state !== 'error' || !emptyRetry.hidden;
        emptyActions.hidden = emptyRetry.hidden && emptyPreview.hidden && emptyClose.hidden;
        renderFeedback();
        if (resetEmptyScroll) empty.scrollTop = 0;
        status.textContent = [heading, description, note].filter(Boolean).join(' ');
        syncControls();
        restoreFocus(focused);
    }

    function toggleFollow() {
        followChanges = !followChanges;
        preferenceActions.set(scope, 'scrollToChanges', followChanges);
        syncControls();
    }

    function rememberPanelVisibility(value) {
        if (rememberVisibility && preferences.get(scope, 'panelOpen') !== value) {
            preferenceActions.set(scope, 'panelOpen', value);
        }
    }

    function toggleRememberVisibility() {
        rememberVisibility = !rememberVisibility;
        preferenceActions.set(scope, 'rememberVisibility', rememberVisibility);
        // Re-enabling adopts the current panel, rather than an older hidden state.
        if (rememberVisibility) rememberPanelVisibility(visible);
        syncControls();
    }

    function rememberLayout() {
        preferenceActions.set(scope, 'layout', { bounds: { ...bounds }, dock, expanded });
    }

    // Collapse the margins too on very small windows; never use an off-screen minimum.
    function area(gap = 16, top = 48) {
        const width = Math.max(1, mainWindow.innerWidth);
        const height = Math.max(1, mainWindow.innerHeight);
        const left = Math.min(gap, (width - 1) / 2);
        top = Math.min(top, height - 1);
        const right = width - left;
        const bottom = height - Math.min(gap, height - top - 1);
        return { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    function fit(next) {
        const available = area();
        next.width = Math.min(available.width, Math.max(Math.min(320, available.width), next.width));
        next.height = Math.min(available.height, Math.max(Math.min(220, available.height), next.height));
        next.x = Math.max(available.left, Math.min(available.right - next.width, next.x));
        next.y = Math.max(available.top, Math.min(available.bottom - next.height, next.y));
        return next;
    }

    function compactRect() {
        const rect = fit({ ...bounds });
        if (dock) {
            const available = area();
            rect.x = dock === 'left' ? available.left
                : dock === 'center' ? (mainWindow.innerWidth - rect.width) / 2 : available.right - rect.width;
            rect.y = available.bottom - rect.height;
        }
        return rect;
    }

    function draw() {
        if (pipWindow) return;
        let rect = compactRect();
        if (expanded) {
            const available = area(12, 44);
            rect = { x: available.left, y: available.top, width: available.width, height: available.height };
        }
        Object.assign(panel.style, {
            left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`, transform: '',
        });
    }

    function dockWindow(side = 'right', resetSize = false) {
        if (resetSize) Object.assign(bounds, { width: 480, height: 340 });
        expanded = false;
        dock = side;
        draw();
        rememberLayout();
        syncControls();
    }

    function supportsPip() {
        return typeof mainWindow.documentPictureInPicture?.requestWindow === 'function';
    }

    function syncControls() {
        const full = panel.ownerDocument.fullscreenElement === panel;
        const inPage = !pipWindow && !full;
        labelMove();
        panel.classList.toggle('aflpp-expanded', expanded);
        controls.update({
            inPage, inPip: !!pipWindow, dock, rememberVisibility, followChanges, device: responsiveViewport.device,
            canRefresh: current.canRefresh, hasPreview: current.hasPreview, previewUrl: current.previewUrl,
            canPip: inPage && supportsPip(),
            canFullscreen: inPage && !!mainDocument.fullscreenEnabled,
            mode: full || expanded ? 'compact' : 'expand',
            modeLabel: full ? strings.exitFullscreen : expanded ? strings.compact : strings.expand,
        });
    }

    function toggleMode() {
        controls.closeMenu();
        if (pipWindow) { pipWindow.close(); return; }
        if (mainDocument.fullscreenElement === panel) {
            mainDocument.exitFullscreen().then(clearWindowNotice, () => showWindowNotice(strings.fullscreenFailed));
            return;
        }
        expanded = !expanded;
        draw();
        rememberLayout();
        syncControls();
        controls.focus('mode');
    }

    move.addEventListener('dblclick', () => { if (!pipWindow) toggleMode(); });
    async function enterFullscreen() {
        if (pipWindow || !mainDocument.fullscreenEnabled) return;
        controls.closeMenu();
        try {
            await panel.requestFullscreen();
            clearWindowNotice();
            controls.focus('mode');
        } catch {
            controls.focus('actions');
            showWindowNotice(strings.fullscreenFailed);
        }
    }
    mainDocument.addEventListener('fullscreenchange', syncControls);

    // Free resizing keeps the opposite edge fixed; docked resizing retains the chosen anchor.
    function resizeBounds(start, edge, dx, dy) {
        const available = area();
        const minWidth = Math.min(320, available.width);
        const minHeight = Math.min(220, available.height);
        const left = edge.includes('w') ? Math.max(available.left, Math.min(start.x + dx, start.x + start.width - minWidth)) : start.x;
        const top = edge.includes('n') ? Math.max(available.top, Math.min(start.y + dy, start.y + start.height - minHeight)) : start.y;
        const right = edge.includes('e') ? Math.min(available.right, Math.max(start.x + start.width + dx, left + minWidth)) : start.x + start.width;
        const bottom = edge.includes('s') ? Math.min(available.bottom, Math.max(start.y + start.height + dy, top + minHeight)) : start.y + start.height;
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
            const { pointer, moved } = drag;
            drag = null;
            mainWindow.cancelAnimationFrame(animation);
            if (control.hasPointerCapture(pointer)) control.releasePointerCapture(pointer);
            panel.classList.remove('aflpp-dragging');
            mainDocument.documentElement.classList.remove('aflpp-window-dragging');
            mainDocument.documentElement.style.removeProperty('--aflpp-drag-cursor');
            draw();
            if (moved) {
                Object.assign(bounds, compactRect());
                rememberLayout();
                syncControls();
            }
        }
        control.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || pipWindow || expanded || mainDocument.fullscreenElement === panel) return;
            event.preventDefault();
            control.focus({ preventScroll: true });
            controls.closeMenu();
            drag = { ...compactRect(), pointer: event.pointerId, pointerX: event.clientX, pointerY: event.clientY };
            control.setPointerCapture(event.pointerId);
        });
        control.addEventListener('pointermove', (event) => {
            if (!drag || drag.pointer !== event.pointerId) return;
            const dx = event.clientX - drag.pointerX;
            const dy = event.clientY - drag.pointerY;
            if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
            drag.moved = true;
            if (edge === 'move') dock = null;
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
            controls.closeMenu();
            Object.assign(bounds, compactRect());
            if (edge === 'move') dock = null;
            const step = event.shiftKey ? 40 : 10;
            if (edge === 'move') {
                bounds.x += delta[0] * step;
                bounds.y += delta[1] * step;
            } else Object.assign(bounds, resizeBounds(bounds, edge, delta[0] * step, delta[1] * step));
            Object.assign(bounds, compactRect());
            draw();
            rememberLayout();
            syncControls();
        });
    }
    geometryControl(move, 'move');
    for (const handle of panel.querySelectorAll('[data-edge]')) {
        geometryControl(handle, handle.dataset.edge);
    }
    // Viewport corrections are temporary, not new saved layout preferences.
    mainWindow.addEventListener('resize', draw);

    async function popOut() {
        if (pipWindow || mainDocument.fullscreenElement === panel || !supportsPip()) return;
        controls.closeMenu();
        let detached;
        const restore = () => {
            if (pipWindow !== detached) return;
            beforeMove();
            responsiveViewport.beforeMove();
            controls.beforeMove();
            mainDocument.body.append(panel);
            panel.classList.remove('aflpp-pip');
            pipWindow = null;
            controls.remount();
            draw();
            responsiveViewport.afterMove();
            syncControls();
            // Moving an iframe between documents can reload it. Refresh from current editor values.
            afterMove();
            if (visible) controls.focus('mode');
        };
        try {
            // A rejected request leaves the current document and preview completely untouched.
            detached = await mainWindow.documentPictureInPicture.requestWindow({ width: 640, height: 440 });
            if (!visible) { detached.close(); return; }
            const theme = mainWindow.getComputedStyle(panel);
            for (const name of ['--wp-admin-theme-color', '--wp-admin-theme-color-darker-10', '--wp-admin-border-width-focus']) {
                const value = theme.getPropertyValue(name);
                if (value) detached.document.documentElement.style.setProperty(name, value);
            }
            // Core concatenation removes the individual wp-components stylesheet ID.
            // Keep the actual admin bundles and relevant standalone/inline styles in source order.
            const stylesheets = mainDocument.querySelectorAll([
                'link[rel="stylesheet"][href*="/load-styles.php"]',
                '#wp-components-css', '#wp-components-inline-css',
                '#a-floating-live-preview-panel-css', '#a-floating-live-preview-panel-inline-css',
            ].join(', '));
            for (const stylesheet of stylesheets) {
                const copy = stylesheet.cloneNode(true);
                copy.addEventListener('load', responsiveViewport.layout, { once: true });
                detached.document.head.append(copy);
            }
            detached.document.title = caption.textContent;
            detached.document.body.className = 'aflpp-pip-document';
            detached.addEventListener('resize', responsiveViewport.layout);
            detached.addEventListener('pagehide', restore, { once: true });
            pipWindow = detached;
            beforeMove();
            responsiveViewport.beforeMove();
            controls.beforeMove();
            panel.classList.add('aflpp-pip');
            detached.document.body.append(panel);
            controls.remount();
            responsiveViewport.afterMove();
            syncControls();
            clearWindowNotice();
            controls.focus('mode');
            afterMove();
        } catch {
            if (detached) {
                restore();
                detached.close();
            }
            controls.focus('actions');
            showWindowNotice(strings.pipFailed);
        }
    }

    // Only explicit user opening/closing changes the preference, never coordinator cleanup or window moves.
    function closePanel() {
        controls.closeMenu();
        rememberPanelVisibility(false);
        onClose();
        launcher.focus();
    }
    for (const button of panel.querySelectorAll('[data-action="close"]')) {
        button.addEventListener('click', closePanel);
    }
    dismissNotice.addEventListener('click', () => {
        clearWindowNotice();
        status.textContent = current.text;
        controls.focus('actions');
    });
    launcher.addEventListener('click', () => {
        rememberPanelVisibility(true);
        onOpen();
    });
    for (const button of [emptyRetry, feedbackRetry]) {
        button.addEventListener('click', () => {
            if (!button.disabled && !button.hidden) onRetry(takeOverAction);
        });
    }
    controls = createPreviewControls(panel, strings, {
        refresh: () => { if (current.canRefresh) onRefresh(); },
        mode: toggleMode, close: closePanel, popOut, fullscreen: enterFullscreen,
        dock: (side) => dockWindow(side), reset: () => dockWindow('right', true),
        follow: toggleFollow, rememberVisibility: toggleRememberVisibility,
        device(name) {
            if (responsiveViewport.device !== name) preferenceActions.set(scope, 'viewport', name);
            responsiveViewport.select(name, visible);
            syncControls();
        },
    });
    draw();
    report(strings.loading, 'loading', { canRetry: false });
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
            if (!value) {
                controls.closeMenu();
                windowNotice = '';
                renderFeedback();
                responsiveViewport.layout();
            }
            visible = value;
            if (visible) draw();
            panel.hidden = !visible;
            launcher.hidden = visible;
            launcher.setAttribute('aria-expanded', String(visible));
        },
        report,
        setTitle,
        clearPreview() {
            stage.replaceChildren();
            const loading = ['ready', 'stale', 'loading'].includes(current.state);
            report(loading ? strings.loading : current.text, loading ? 'loading' : current.state, {
                ...current, hasPreview: false, previewUrl: undefined, canRefresh: false,
                canRetry: loading ? false : current.canRetry,
            });
        },
        returnToEditor() {
            controls.closeMenu();
            pipWindow?.close();
            if (mainDocument.fullscreenElement === panel) mainDocument.exitFullscreen().catch(() => {});
        },
    };
}
