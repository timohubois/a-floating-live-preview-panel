// Presentation only: never capture fields, fetch previews, acquire locks or control native saves.
export function createPreviewPanel(strings, {
    postTitle = '', nativeSaving, onOpen, onClose, onRefresh, onRetry, onError, beforeMove, afterMove,
}, createPreviewViewport) {
    const mainWindow = window;
    const mainDocument = document;
    const scope = 'floating-live-preview';
    const preferences = mainWindow.wp.data.select('core/preferences');
    const preferenceActions = mainWindow.wp.data.dispatch('core/preferences');
    preferenceActions.setDefaults(scope, {
        rememberVisibility: true, panelOpen: true, scrollToChanges: true, viewport: 'desktop',
    });
    let rememberVisibility = preferences.get(scope, 'rememberVisibility') !== false;
    let followChanges = preferences.get(scope, 'scrollToChanges') !== false;
    const showOnLoad = (!rememberVisibility || preferences.get(scope, 'panelOpen') !== false) && !nativeSaving;
    // SVGs: WordPress Contributors, @wordpress/icons 20.0.0, GPL-2.0-or-later.
    // Gutenberg 55ab503b80b1561f48414b2eb209c25b793a9e8a; unchanged paths and shared SVG presentation.
    const icons = {
        desktop: '<path d="M4.75 16.75V17H3.25C3.11193 17 3 17.1119 3 17.25H21C21 17.1119 20.8881 17 20.75 17H19.25V16.75M4.75 16.75V8.5C4.75 7.80964 5.30964 7.25 6 7.25H18C18.6904 7.25 19.25 7.80964 19.25 8.5V16.75M4.75 16.75H19.25" />',
        tablet: '<path d="M10 16.5H14M18.25 18V6C18.25 5.30964 17.6904 4.75 17 4.75H7C6.30964 4.75 5.75 5.30964 5.75 6L5.75 18C5.75 18.6904 6.30964 19.25 7 19.25H17C17.6904 19.25 18.25 18.6904 18.25 18Z" />',
        mobile: '<path d="M11 16.5H13M16.25 18V6C16.25 5.30964 15.6904 4.75 15 4.75H9C8.30964 4.75 7.75 5.30964 7.75 6L7.75 18C7.75 18.6904 8.30964 19.25 9 19.25H15C15.6904 19.25 16.25 18.6904 16.25 18Z" />',
        update: '<path d="M12 5.5L17.7929 11.2929C18.1834 11.6834 18.1834 12.3166 17.7929 12.7071L16 14.5M16 5.5H12V9.5M12 18.5L6.20711 12.7071C5.81658 12.3166 5.81658 11.6834 6.20711 11.2929L8 9.5M8 18.5H12V14.5" />',
        fullscreen: '<path d="M4.75 10V4.75H10M4.75 4.75L10 10M14 19.25H19.25V14M19.25 19.25L14 14" />',
        fullscreenExit: '<path d="M10 4.75V10H4.75M10 10L4.75 4.75M19.25 14H14V19.25M14 14L19.25 19.25" />',
        drawerRight: '<path d="M14.25 19.25L18 19.25C18.6904 19.25 19.25 18.6904 19.25 18L19.25 6C19.25 5.30964 18.6904 4.75 18 4.75L14.25 4.75M14.25 19.25L6 19.25C5.30964 19.25 4.75 18.6904 4.75 18L4.75 6C4.75 5.30964 5.30965 4.75 6 4.75L14.25 4.75M14.25 19.25L14.25 4.75" />',
        replace: '<path d="M11 18H15.5C16.6046 18 17.5 17.1046 17.5 16V13.25M15 15.25L17.5 13.25L20 15.25M13 6.25L8.5 6.25C7.39543 6.25 6.5 7.14543 6.5 8.25L6.5 11M9 9L6.5 11L4 9M5 19.25H8C8.69036 19.25 9.25 18.6904 9.25 18V15C9.25 14.3096 8.69036 13.75 8 13.75H5C4.30964 13.75 3.75 14.3096 3.75 15V18C3.75 18.6904 4.30964 19.25 5 19.25ZM16 10.25H19C19.6904 10.25 20.25 9.69036 20.25 9V6C20.25 5.30964 19.6904 4.75 19 4.75H16C15.3096 4.75 14.75 5.30964 14.75 6V9C14.75 9.69036 15.3096 10.25 16 10.25Z" />',
        moreHorizontal: '<path d="M18.25 12.25L18.25 11.75L17.75 11.75L17.75 12.25L18.25 12.25Z" fill="currentColor" stroke="none" /><path d="M12.25 12.25L12.25 11.75L11.75 11.75L11.75 12.25L12.25 12.25Z" fill="currentColor" stroke="none" /><path d="M6.25 12.25L6.25 11.75L5.75 11.75L5.75 12.25L6.25 12.25Z" fill="currentColor" stroke="none" /><path d="M18.25 12.25L18.25 11.75L17.75 11.75L17.75 12.25L18.25 12.25Z" /><path d="M12.25 12.25L12.25 11.75L11.75 11.75L11.75 12.25L12.25 12.25Z" /><path d="M6.25 12.25L6.25 11.75L5.75 11.75L5.75 12.25L6.25 12.25Z" />',
        closeSmall: '<path d="M7.75 16.25L16.25 7.75M16.25 16.25L7.75 7.75" />',
        check: '<path d="M7 12L10 15L17 8" />',
    };

    function element(tag, className, text) {
        const node = mainDocument.createElement(tag);
        node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function setIcon(node, name) {
        // Only fixed, bundled Gutenberg SVG paths above are inserted as markup.
        node.innerHTML = `<svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false">${icons[name]}</svg>`;
    }

    function label(button, text) {
        button.setAttribute('aria-label', text);
        button.title = text;
    }

    function button(text, icon) {
        const node = element('button', icon ? 'flp-icon' : 'flp-command', icon ? '' : text);
        node.type = 'button';
        label(node, text);
        if (icon) setIcon(node, icon);
        return node;
    }

    const launcher = button(strings.title, 'desktop');
    launcher.id = 'flp-toggle';
    launcher.className = 'flp-launcher';
    launcher.append(element('span', '', strings.title));
    launcher.setAttribute('aria-controls', 'flp-panel');
    launcher.setAttribute('aria-expanded', String(showOnLoad));
    launcher.hidden = showOnLoad;
    const panel = element('section', 'flp-panel');
    panel.hidden = !showOnLoad;
    panel.id = 'flp-panel';
    panel.setAttribute('aria-label', strings.title);
    panel.dataset.state = 'loading';
    const header = element('div', 'flp-header');
    const move = button(strings.move);
    move.className = 'flp-move';
    const dot = element('span', 'flp-dot');
    dot.setAttribute('aria-hidden', 'true');
    const caption = element('span', 'flp-caption');
    move.replaceChildren(dot, caption);
    const refresh = button(strings.refresh, 'update');
    refresh.disabled = true;
    const modeButton = button(strings.expand, 'fullscreen');
    modeButton.classList.add('flp-mode');
    const actions = element('details', 'flp-actions');
    const actionsToggle = element('summary', 'flp-icon');
    label(actionsToggle, strings.actions);
    setIcon(actionsToggle, 'moreHorizontal');
    const commands = element('div', 'flp-commands');
    function commandGroup(text, ...controls) {
        const group = element('div', 'flp-command-group');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', text);
        group.append(element('p', 'flp-command-heading', text), ...controls);
        return group;
    }
    const pip = button(strings.pip);
    const pipHint = element('span', 'flp-command-hint', strings.pipHint);
    pipHint.setAttribute('aria-hidden', 'true');
    pip.append(pipHint);
    const fullscreen = button(strings.fullscreen);
    const reset = button(strings.reset);
    const dockLeft = button(strings.dockLeft);
    const dockRight = button(strings.dockRight);
    const rememberVisibilityOption = button(strings.rememberVisibility);
    rememberVisibilityOption.setAttribute('aria-pressed', String(rememberVisibility));
    const follow = button(strings.follow);
    follow.setAttribute('aria-pressed', String(followChanges));
    for (const option of [rememberVisibilityOption, follow]) {
        const check = element('span', 'flp-command-check');
        check.setAttribute('aria-hidden', 'true');
        setIcon(check, 'check');
        option.append(check);
    }
    const openPreview = element('a', 'flp-command flp-open-preview', strings.openPreview);
    openPreview.target = '_blank';
    openPreview.rel = 'noopener noreferrer';
    openPreview.referrerPolicy = 'no-referrer';
    openPreview.hidden = true;
    openPreview.addEventListener('click', () => {
        actions.open = false;
        actionsToggle.focus({ preventScroll: true });
    });
    const displayGroup = commandGroup(strings.display, openPreview, pip, fullscreen);
    const layoutGroup = commandGroup(strings.layout, dockLeft, dockRight, reset);
    commands.append(displayGroup, layoutGroup, commandGroup(strings.preferences, rememberVisibilityOption, follow));
    actions.append(actionsToggle, commands);
    const close = button(strings.close, 'closeSmall');
    header.append(refresh, move, actions, modeButton, close);
    const viewport = element('div', 'flp-viewport');
    const stage = element('div', 'flp-stage');
    const empty = element('div', 'flp-empty', strings.loading);
    viewport.append(stage, empty);
    const devicebar = element('div', 'flp-devicebar');
    const devices = element('div', 'flp-devices');
    devices.setAttribute('role', 'group');
    devices.setAttribute('aria-label', strings.viewport);
    const dimensions = element('span', 'flp-dimensions');
    dimensions.title = strings.viewportNotice;
    const responsiveViewport = createPreviewViewport(viewport, stage, dimensions, preferences.get(scope, 'viewport'));
    const deviceButtons = Object.fromEntries(responsiveViewport.presets.map((name) => {
        const control = button(strings[name], name);
        control.setAttribute('aria-pressed', String(name === responsiveViewport.device));
        control.addEventListener('click', () => {
            if (responsiveViewport.device !== name) preferenceActions.set(scope, 'viewport', name);
            for (const [key, node] of Object.entries(deviceButtons)) node.setAttribute('aria-pressed', String(key === name));
            responsiveViewport.select(name, visible);
        });
        devices.append(control);
        return [name, control];
    }));
    devicebar.append(devices, dimensions);
    const feedback = element('div', 'flp-feedback');
    feedback.hidden = true;
    const errorText = element('span', 'flp-error');
    const retry = button(strings.retry, 'update');
    feedback.append(errorText, retry);
    const status = element('span', 'flp-sr-only');
    status.setAttribute('role', 'status');
    panel.append(header, viewport, devicebar, feedback, status);
    mainDocument.body.append(launcher, panel);

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
            retry.classList.toggle('flp-takeover', takeOverAction);
            setIcon(retry, takeOverAction ? 'replace' : 'update');
            if (takeOverAction) retry.append(element('span', '', action));
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
        panel.style.setProperty('--flp-menu-height', `${Math.max(1, rect.height - 48)}px`);
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
        setIcon(modeButton, pipWindow ? 'drawerRight' : full || expanded ? 'fullscreenExit' : 'fullscreen');
        pip.hidden = !inPage || !mainWindow.documentPictureInPicture;
        fullscreen.hidden = !inPage || !mainDocument.fullscreenEnabled;
        displayGroup.hidden = openPreview.hidden && pip.hidden && fullscreen.hidden;
        layoutGroup.hidden = !inPage;
        labelMove();
        panel.classList.toggle('flp-expanded', expanded);
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
            panel.classList.remove('flp-dragging');
            mainDocument.documentElement.classList.remove('flp-window-dragging');
            mainDocument.documentElement.style.removeProperty('--flp-drag-cursor');
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
            panel.classList.add('flp-dragging');
            mainDocument.documentElement.style.setProperty(
                '--flp-drag-cursor', edge === 'move' ? 'grabbing' : mainWindow.getComputedStyle(control).cursor
            );
            mainDocument.documentElement.classList.add('flp-window-dragging');
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
    for (const [edge, text] of Object.entries({
        n: strings.resizeTop, ne: strings.resizeTopRight, e: strings.resizeRight, se: strings.resizeBottomRight,
        s: strings.resizeBottom, sw: strings.resizeBottomLeft, w: strings.resizeLeft, nw: strings.resizeTopLeft,
    })) {
        const handle = button(text);
        handle.className = `flp-resize flp-resize-${edge}`;
        handle.textContent = '';
        panel.append(handle);
        geometryControl(handle, edge);
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
            const stylesheet = mainDocument.getElementById('floating-live-preview-css');
            if (stylesheet) {
                const copy = stylesheet.cloneNode(true);
                copy.addEventListener('load', responsiveViewport.layout, { once: true });
                detached.document.head.append(copy);
            }
            detached.document.title = caption.textContent;
            detached.document.body.className = 'flp-pip-document';
            panel.classList.add('flp-pip');
            detached.document.body.append(panel);
            responsiveViewport.layout();
            detached.addEventListener('resize', responsiveViewport.layout);
            detached.document.addEventListener('pointerdown', dismissActions);
            detached.document.addEventListener('keydown', dismissActions);
            detached.addEventListener('pagehide', () => {
                beforeMove();
                mainDocument.body.append(panel);
                panel.classList.remove('flp-pip');
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
