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

    const move = panel.querySelector('.aflpp-move-control');
    const resize = panel.querySelector('.aflpp-resize');
    const resizeEdges = panel.querySelectorAll('[data-resize-edge]');
    const header = panel.querySelector('.aflpp-header');
    const dot = panel.querySelector('.aflpp-dot');
    const caption = panel.querySelector('.aflpp-caption');
    const viewport = panel.querySelector('.aflpp-viewport');
    const stage = panel.querySelector('.aflpp-stage');
    const empty = panel.querySelector('.aflpp-empty');
    const devicebar = panel.querySelector('.aflpp-devicebar');
    const dimensions = panel.querySelector('.aflpp-dimensions');
    const feedback = panel.querySelector('.aflpp-feedback');
    const status = panel.querySelector('[role="status"]');
    const responsiveViewport = createPreviewViewport(viewport, stage, dimensions, preferences.get(scope, 'viewport'));

    let visible = showOnLoad;
    let pipWindow;
    const saved = preferences.get(scope, 'layout');
    const validLayout = saved && !Array.isArray(saved) && saved.bounds
        && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(saved.bounds[key]))
        && saved.bounds.width > 0 && saved.bounds.height > 0
        && [null, 'left', 'center', 'right'].includes(saved.dock) && typeof saved.expanded === 'boolean'
        && (saved.anchor === undefined || ['left', 'center', 'right'].includes(saved.anchor));
    let expanded = validLayout ? saved.expanded : false;
    let controls;
    let takeOverAction = false;
    let windowNotice = '';
    let current = {
        text: strings.loading, state: 'loading', hasPreview: false, canRetry: false, reason: '',
    };
    const sizes = { small: { width: 480, height: 340 }, large: { width: 640, height: 440 } };
    const bounds = validLayout ? { ...saved.bounds } : { x: 0, y: 0, ...sizes.small };
    let dock = validLayout ? saved.dock : 'right';
    // Keep the same collapse/resize corner when dragging away from a dock. Older layouts default to the right.
    let anchor = dock || (validLayout && saved.anchor) || 'right';
    let launcherDragClick = false;
    const anchorFactor = () => anchor === 'left' ? 0 : anchor === 'center' ? 0.5 : 1;

    function setTitle(value) {
        // Plain text, not an editor field or a full-width focus/drag button.
        const title = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
        caption.textContent = title ? `${strings.preview} — ${title}` : strings.title;
        caption.title = caption.textContent;
        if (pipWindow) pipWindow.document.title = caption.textContent;
    }
    setTitle(postTitle);

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

    function restoreFocus(focused, wasInside) {
        if (!focused || !wasInside) return;
        if (panel.contains(focused) && !focused.closest('[hidden]') && !focused.disabled) return;
        controls.focus(empty.hidden ? 'actions' : 'empty-title');
    }

    function feedbackState() {
        const { state, hasPreview, canRetry, reason } = current;
        const problem = hasPreview && ['error', 'conflict', 'handover'].includes(state);
        feedback.hidden = !problem && !windowNotice;
        feedback.tabIndex = feedback.hidden ? -1 : 0;
        panel.dataset.hasFeedback = String(!feedback.hidden);
        if (feedback.hidden) return null;
        const { heading, description } = presentation();
        return {
            heading: problem ? heading : windowNotice,
            description: problem ? description : strings.windowNoticeHelp,
            status: !problem || state === 'handover' ? 'info' : state === 'error' && !canRetry ? 'error' : 'warning',
            dismissible: !problem,
            retry: problem && (takeOverAction || (canRetry && ['error', 'conflict'].includes(state))),
            close: problem && state === 'error' && !canRetry && reason !== 'reload',
            disabled: state === 'handover',
            action: takeOverAction ? (state === 'handover' ? strings.takingOver : strings.takeOver) : strings.retry,
        };
    }

    // A failed window operation must not change preview ownership, readiness or refresh controls.
    function showWindowNotice(text) {
        if (!(current.hasPreview && ['error', 'conflict', 'handover'].includes(current.state))) {
            windowNotice = text;
            syncControls();
        }
        status.textContent = `${text} ${strings.windowNoticeHelp}`;
    }

    function clearWindowNotice() {
        windowNotice = '';
        syncControls();
    }

    function report(text, state = 'loading', {
        canTakeOver = false, hasPreview = false, previewUrl, canRefresh = false, canRetry = true, reason = '',
    } = {}) {
        const focused = panel.ownerDocument.activeElement;
        const wasInside = panel.contains(focused);
        const resetEmptyScroll = !hasPreview && (current.state !== state || current.text !== text || current.reason !== reason);
        current = { text, state, canTakeOver, hasPreview, previewUrl, canRefresh, canRetry, reason };
        if (['error', 'conflict', 'handover'].includes(state)) windowNotice = '';
        panel.dataset.state = state;
        panel.dataset.hasPreview = String(hasPreview);
        panel.dataset.retryable = String(canRetry);
        dot.title = text;
        takeOverAction = canTakeOver && ['conflict', 'handover'].includes(state);
        empty.hidden = hasPreview;
        devicebar.hidden = !hasPreview;
        const { heading, description, note } = presentation();
        if (resetEmptyScroll) empty.scrollTop = 0;
        // Placeholder announces its instructions; the live region supplies the heading without repeating them.
        status.textContent = hasPreview ? [heading, description, note].filter(Boolean).join(' ') : heading;
        syncControls();
        restoreFocus(focused, wasInside);
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
        preferenceActions.set(scope, 'layout', { bounds: { ...bounds }, dock, anchor, expanded });
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
        const factor = anchorFactor();
        Object.assign(launcher.style, {
            left: `${rect.x + rect.width * factor}px`, top: `${rect.y + rect.height}px`,
            transform: `translate(${-100 * factor}%, -100%)`,
        });
        panel.dataset.anchor = anchor;
        if (expanded) {
            const available = area(12, 44);
            rect = { x: available.left, y: available.top, width: available.width, height: available.height };
        }
        Object.assign(panel.style, {
            left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`, transform: '',
        });
    }

    function dockWindow(side = 'right', resetSize = false) {
        if (resetSize) Object.assign(bounds, sizes.small);
        expanded = false;
        anchor = dock = side;
        draw();
        rememberLayout();
        syncControls();
    }

    function sizeWindow(name) {
        if (!Object.hasOwn(sizes, name)) return;
        const rect = compactRect();
        Object.assign(bounds, sizes[name], {
            x: rect.x + (rect.width - sizes[name].width) * anchorFactor(),
            y: rect.y + rect.height - sizes[name].height,
        });
        expanded = false;
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
        const movable = inPage && !expanded;
        panel.classList.toggle('aflpp-expanded', expanded);
        resize.hidden = !movable;
        for (const edge of resizeEdges) edge.hidden = !movable || !usableEdge(edge.dataset.resizeEdge);
        const retry = takeOverAction || (current.canRetry && ['error', 'conflict'].includes(current.state));
        controls.update({
            inPage, inPip: !!pipWindow, movable, dock, rememberVisibility, followChanges, device: responsiveViewport.device,
            busy: current.hasPreview && ['loading', 'handover'].includes(current.state) && current.text !== strings.saving,
            empty: current.hasPreview ? null : {
                ...presentation(), busy: ['loading', 'stale', 'ready', 'handover'].includes(current.state),
                icon: ['unavailable', 'browser'].includes(current.reason) ? 'info' : current.state === 'conflict' ? 'pip' : 'warning',
                retry, disabled: current.state === 'handover', close: current.state === 'error' && !retry,
                action: takeOverAction ? (current.state === 'handover' ? strings.takingOver : strings.takeOver) : strings.retry,
                previewUrl: current.state === 'error' ? current.previewUrl : undefined,
            },
            notice: feedbackState(),
            size: expanded ? undefined : Object.keys(sizes).find((name) => bounds.width === sizes[name].width && bounds.height === sizes[name].height),
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

    header.addEventListener('dblclick', (event) => {
        if (!pipWindow && !event.target.closest('button, a')) toggleMode();
    });
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

    // Docked edges that cannot move must not advertise a resize cursor or eat pointer input.
    function usableEdge(edge) {
        return !dock || (!edge.includes('s') && !(dock === 'left' && edge.includes('w'))
            && !(dock === 'right' && edge.includes('e')));
    }

    // Physical edges are independent of text direction. Center anchoring grows symmetrically.
    function resizeBounds(start, edge, dx, dy) {
        const available = area();
        const horizontal = edge.includes('e') || edge.includes('w');
        const vertical = edge.includes('n') || edge.includes('s');
        const factor = anchor === 'center' ? 0.5 : edge.includes('w') ? 1 : 0;
        const pinX = start.x + start.width * factor;
        const fromTop = edge.includes('n');
        const pinY = start.y + (fromTop ? start.height : 0);
        const maxWidth = factor === 0 ? available.right - pinX : factor === 1
            ? pinX - available.left : 2 * Math.min(pinX - available.left, available.right - pinX);
        const maxHeight = fromTop ? pinY - available.top : available.bottom - pinY;
        const widthDelta = (edge.includes('w') ? -dx : dx) * (factor === 0.5 ? 2 : 1);
        const width = Math.max(Math.min(320, maxWidth), Math.min(maxWidth, start.width + widthDelta));
        const height = Math.max(Math.min(220, maxHeight), Math.min(maxHeight, start.height + (fromTop ? -dy : dy)));
        const widthChanged = horizontal && dx !== 0 && width !== start.width;
        const heightChanged = vertical && dy !== 0 && height !== start.height;
        // Untouched axes retain preferred coordinates too, not their temporary viewport fit.
        return {
            x: widthChanged ? pinX - width * factor : start.preferredBounds.x,
            y: heightChanged ? (fromTop ? pinY - height : pinY) : start.preferredBounds.y,
            width: widthChanged ? width : start.preferredBounds.width,
            height: heightChanged ? height : start.preferredBounds.height,
        };
    }

    function moveBounds(start, dx, dy) {
        const rect = fit({ ...start, x: start.x + dx, y: start.y + dy });
        // Moving never turns temporary viewport fitting into a new preferred size.
        bounds.x = rect.x;
        bounds.y = rect.y;
        dock = null;
    }

    // Move the visible panel with a compositor transform. Hidden-panel/launcher layout and resizing are batched.
    function geometryControl(control, resizing = false, edge) {
        const isLauncher = control === launcher;
        const isHeader = control === header;
        const resizeEdge = () => edge || (anchor === 'left' ? 'ne' : 'nw');
        const fixed = () => pipWindow || (!isLauncher && expanded) || mainDocument.fullscreenElement === panel
            || (resizing && !usableEdge(resizeEdge()));
        let drag;
        let animation;
        const startRect = () => ({ ...compactRect(), preferredBounds: { ...bounds } });
        function paint() {
            animation = null;
            if (!drag) return;
            if (!resizing && !isLauncher) {
                const rect = compactRect();
                panel.style.transform = `translate3d(${rect.x - drag.x}px, ${rect.y - drag.y}px, 0)`;
            } else draw();
        }
        function finish() {
            if (!drag) return;
            const { pointer, moved } = drag;
            drag = null;
            mainWindow.cancelAnimationFrame(animation);
            if (control.hasPointerCapture(pointer)) control.releasePointerCapture(pointer);
            panel.classList.remove('aflpp-dragging');
            control.classList.remove('aflpp-edge-active');
            mainDocument.documentElement.classList.remove('aflpp-window-dragging');
            mainDocument.documentElement.style.removeProperty('--aflpp-drag-cursor');
            draw();
            if (moved) {
                if (isLauncher) launcherDragClick = true;
                rememberLayout();
                syncControls();
            }
        }
        control.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || fixed()) return;
            if (isHeader && event.target.closest('button, a, [role="button"]')) return;
            if (isLauncher) launcherDragClick = false;
            event.preventDefault();
            if (isLauncher) launcher.focus({ preventScroll: true });
            else if (control === move) controls.focus('move');
            controls.closeMenu();
            drag = { ...startRect(), pointer: event.pointerId, pointerX: event.clientX, pointerY: event.clientY };
            control.setPointerCapture(event.pointerId);
        });
        control.addEventListener('pointermove', (event) => {
            if (!drag || drag.pointer !== event.pointerId) return;
            const dx = event.clientX - drag.pointerX;
            const dy = event.clientY - drag.pointerY;
            if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
            drag.moved = true;
            panel.classList.add('aflpp-dragging');
            if (resizing) control.classList.add('aflpp-edge-active');
            mainDocument.documentElement.style.setProperty(
                '--aflpp-drag-cursor', resizing ? mainWindow.getComputedStyle(control).cursor : 'grabbing'
            );
            mainDocument.documentElement.classList.add('aflpp-window-dragging');
            if (resizing) Object.assign(bounds, resizeBounds(drag, resizeEdge(), dx, dy));
            else moveBounds(drag, dx, dy);
            if (!animation) animation = mainWindow.requestAnimationFrame(paint);
        });
        for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) control.addEventListener(event, finish);
        mainWindow.addEventListener('blur', finish);
        if (isHeader || edge) return; // Pointer-only titlebar/edges add no extra keyboard stops.
        control.addEventListener('keydown', (event) => {
            const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
            if (!delta || event.altKey || event.ctrlKey || event.metaKey || fixed()) return;
            event.preventDefault();
            controls.closeMenu();
            const start = startRect();
            const step = event.shiftKey ? 40 : 10;
            if (resizing) Object.assign(bounds, resizeBounds(start, resizeEdge(), delta[0] * step, delta[1] * step));
            else moveBounds(start, delta[0] * step, delta[1] * step);
            draw();
            rememberLayout();
            syncControls();
            const rect = compactRect();
            status.textContent = resizing
                ? `${strings.resize}: ${Math.round(rect.width)} × ${Math.round(rect.height)}` : strings.moved;
        });
    }
    resize.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') resize.classList.add('aflpp-help-dismissed');
    });
    resize.addEventListener('blur', () => resize.classList.remove('aflpp-help-dismissed'));
    geometryControl(move);
    geometryControl(header);
    geometryControl(launcher);
    geometryControl(resize, true);
    for (const edge of resizeEdges) geometryControl(edge, true, edge.dataset.resizeEdge);
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
    launcher.addEventListener('click', (event) => {
        if (launcherDragClick && event.detail !== 0) {
            launcherDragClick = false;
            event.preventDefault();
            return;
        }
        launcherDragClick = false;
        rememberPanelVisibility(true);
        onOpen();
        if (visible) controls.focus('actions');
    });
    controls = createPreviewControls(panel, strings, {
        refresh: () => { if (current.canRefresh) onRefresh(); },
        retry: () => {
            if (current.state !== 'handover' && (takeOverAction || (current.canRetry && ['error', 'conflict'].includes(current.state)))) {
                onRetry(takeOverAction);
            }
        },
        dismissNotice: () => {
            clearWindowNotice();
            status.textContent = current.text;
            controls.focus('actions');
        },
        mode: toggleMode, close: closePanel, popOut, fullscreen: enterFullscreen,
        dock: (side) => dockWindow(side), size: sizeWindow, reset: () => dockWindow('right', true),
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
                syncControls();
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
