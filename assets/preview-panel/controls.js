import { createElement as h, createPortal, createRoot, flushSync, Fragment } from '@wordpress/element';
import { Button, DropdownMenu, MenuGroup, MenuItem, MenuItemsChoice, Popover, SlotFillProvider, Toolbar, ToolbarButton } from '@wordpress/components';
import { icons } from '../../src/icons.js';

// Native WordPress controls only. The panel owns geometry, preferences and preview state.
export function createPreviewControls(panel, strings, callbacks) {
    const container = panel.querySelector('.aflpp-controls');
    const refreshContainer = panel.querySelector('.aflpp-refresh-control');
    const devicesContainer = panel.querySelector('.aflpp-device-controls');
    const pipContainer = panel.querySelector('.aflpp-pip-control');
    const launcherContainer = panel.ownerDocument.querySelector('#aflpp-toggle .aflpp-launcher-icon');
    const dismissContainer = panel.querySelector('.aflpp-dismiss-icon');
    const resizeContainer = panel.querySelector('.aflpp-resize-icon');
    let root = createRoot(container);
    let state;
    let open = false;

    function Controls() {
        const { inPage, inPip, mode, modeLabel, canRefresh, hasPreview, previewUrl, canPip, canFullscreen, dock, size, rememberVisibility, followChanges, device } = state;
        const command = (action) => () => { closeMenu(); action(); };
        return h(SlotFillProvider, null,
            createPortal(icons.pip, launcherContainer),
            createPortal(icons.close, dismissContainer),
            createPortal(icons.resize, resizeContainer),
            createPortal(!inPip && h(Button, {
                className: 'aflpp-icon', icon: icons.refresh, label: strings.refresh, showTooltip: true,
                disabled: !canRefresh, onClick: callbacks.refresh, 'data-action': 'refresh',
            }), refreshContainer),
            createPortal(canPip && hasPreview && h(Button, {
                className: 'aflpp-pip-button', icon: icons.pip, label: strings.popOut, 'aria-label': strings.popOut,
                showTooltip: true, onClick: callbacks.popOut, 'data-action': 'pop-out',
            }), pipContainer),
            h(DropdownMenu, {
                className: 'aflpp-actions', label: strings.actions, icon: icons.more, open,
                onToggle: (value) => { open = value; render(); },
                toggleProps: { className: 'aflpp-icon', 'data-action': 'actions' },
                popoverProps: { placement: 'bottom-end', offset: 6, shift: true, className: 'aflpp-menu-popover' },
            }, () => h(Fragment, null,
                inPip && h(MenuGroup, null, h(MenuItem, {
                    disabled: !canRefresh, onClick: command(callbacks.refresh), 'data-action': 'refresh',
                }, strings.refresh)),
                (previewUrl || canPip || canFullscreen) && h(MenuGroup, { label: strings.display },
                    previewUrl && h(MenuItem, {
                        href: previewUrl, target: '_blank', rel: 'noopener noreferrer', referrerPolicy: 'no-referrer',
                        onClick: closeMenu, 'data-action': 'open-preview',
                    }, strings.openPreview),
                    canPip && h(MenuItem, {
                        icon: icons.pip, onClick: command(callbacks.popOut), 'data-action': 'pip', 'aria-label': strings.popOut,
                    }, strings.popOut),
                    canFullscreen && h(MenuItem, {
                        onClick: command(callbacks.fullscreen), 'data-action': 'fullscreen',
                    }, strings.fullscreen),
                ),
                inPage && h(MenuGroup, { label: strings.position }, h(MenuItemsChoice, {
                    value: dock,
                    choices: [
                        { value: 'left', label: strings.bottomLeft },
                        { value: 'center', label: strings.bottomCenter },
                        { value: 'right', label: strings.bottomRight },
                    ],
                    onSelect: (side) => { closeMenu(); callbacks.dock(side); },
                })),
                inPage && h(MenuGroup, { label: strings.size }, h(MenuItemsChoice, {
                    value: size,
                    choices: [
                        { value: 'small', label: strings.small },
                        { value: 'large', label: strings.large },
                    ],
                    onSelect: (name) => { closeMenu(); callbacks.size(name); },
                })),
                h(MenuGroup, { label: strings.preferences },
                    h(MenuItem, {
                        role: 'menuitemcheckbox', isSelected: rememberVisibility, icon: rememberVisibility ? icons.check : undefined,
                        onClick: command(callbacks.rememberVisibility), 'data-action': 'remember-visibility',
                    }, strings.rememberVisibility),
                    h(MenuItem, {
                        role: 'menuitemcheckbox', isSelected: followChanges, icon: followChanges ? icons.check : undefined,
                        onClick: command(callbacks.follow), 'data-action': 'follow',
                    }, strings.follow),
                ),
                inPage && h(MenuGroup, null, h(MenuItem, {
                    onClick: command(callbacks.reset), 'data-action': 'reset',
                }, strings.reset)),
                inPip && h(MenuGroup, null, h(MenuItem, {
                    onClick: command(callbacks.close), 'data-action': 'close',
                }, strings.closeLivePreview)),
            )),
            !inPip && h(Button, {
                className: 'aflpp-icon aflpp-mode', icon: icons[mode], label: modeLabel, showTooltip: true,
                onClick: callbacks.mode, 'data-action': 'mode',
            }),
            !inPip && h(Button, {
                className: 'aflpp-icon', icon: icons.close, label: strings.close, showTooltip: true,
                onClick: callbacks.close, 'data-action': 'close',
            }),
            createPortal(h(Toolbar, { className: 'aflpp-devices', label: strings.viewport, variant: 'unstyled' },
                ...['desktop', 'tablet', 'mobile'].map((name) => h(ToolbarButton, {
                    key: name, icon: icons[name], label: strings[name],
                    isPressed: device === name, 'data-viewport': name, onClick: () => callbacks.device(name),
                })),
            ), devicesContainer),
            // Keep every popover inside the panel's fullscreen/PiP document, not the editor body.
            h(Popover.Slot),
        );
    }

    function render() {
        if (state && root) flushSync(() => root.render(h(Controls)));
    }

    function closeMenu() {
        if (!open) return;
        open = false;
        render();
    }

    function focus(action) {
        if (state?.inPip && ['mode', 'refresh'].includes(action)) action = 'actions';
        panel.querySelector(`[data-action="${action}"]`)?.focus({ preventScroll: true });
    }

    return {
        update(next) { state = next; render(); },
        closeMenu,
        focus,
        // Dispose document-bound focus/resize hooks before adopting the panel into another window.
        beforeMove() {
            open = false;
            root?.unmount();
            root = null;
        },
        remount() {
            root = createRoot(container);
            render();
        },
    };
}
