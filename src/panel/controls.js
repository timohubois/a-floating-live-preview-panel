import { createElement as h, createPortal, createRoot, flushSync, Fragment } from '@wordpress/element';
import {
    Button, DropdownMenu, MenuGroup, MenuItem, MenuItemsChoice, Notice, Placeholder,
    Popover, SlotFillProvider, Spinner, Toolbar, ToolbarButton,
} from '@wordpress/components';
import { icons } from './icons.js';

// Public WordPress UI only. The shell owns geometry, recovery decisions and preview state.
export function createPreviewControls(panel, strings, callbacks) {
    const container = panel.querySelector('.aflpp-controls');
    const refreshContainer = panel.querySelector('.aflpp-refresh-control');
    const moveContainer = panel.querySelector('.aflpp-move-control');
    const devicesContainer = panel.querySelector('.aflpp-device-controls');
    const pipContainer = panel.querySelector('.aflpp-pip-control');
    const emptyContainer = panel.querySelector('.aflpp-empty');
    const feedbackContainer = panel.querySelector('.aflpp-feedback');
    const launcherContainer = panel.ownerDocument.querySelector('#aflpp-toggle .aflpp-launcher-icon');
    let root = createRoot(container);
    let state;
    let open = false;

    function Controls() {
        const {
            inPage, inPip, mode, modeLabel, movable, busy, canRefresh, hasPreview, previewUrl,
            canPip, canFullscreen, dock, size, rememberVisibility, followChanges, device, empty, notice,
        } = state;
        const command = (action) => () => { closeMenu(); action(); };
        return h(SlotFillProvider, null,
            createPortal(icons.pip, launcherContainer),
            createPortal(movable && inPage && h(Button, {
                className: 'aflpp-icon aflpp-move', icon: icons.move, label: strings.move, showTooltip: true, tooltipPosition: 'bottom',
                'data-action': 'move',
            }), moveContainer),
            createPortal(h(Button, {
                className: 'aflpp-icon', icon: busy ? h(Spinner) : icons.refresh,
                label: strings.refresh, showTooltip: true,
                // Loading must not move focus from Refresh to the panel's fallback action.
                accessibleWhenDisabled: true, disabled: !canRefresh, onClick: callbacks.refresh, 'data-action': 'refresh',
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
            createPortal(empty && h(Placeholder, {
                className: 'aflpp-placeholder', icon: empty.busy ? h(Spinner) : icons[empty.icon],
                label: h('h2', { className: 'aflpp-empty-title', tabIndex: -1, 'data-action': 'empty-title' }, empty.heading),
                instructions: empty.description,
            },
            empty.retry && h(Button, {
                key: 'retry', variant: 'primary', disabled: empty.disabled, onClick: callbacks.retry, 'data-action': 'retry',
            }, empty.action),
            empty.previewUrl && h(Button, {
                key: 'link', variant: 'secondary', href: empty.previewUrl, target: '_blank',
                rel: 'noopener noreferrer', referrerPolicy: 'no-referrer',
            }, strings.openPreview),
            empty.close && h(Button, { key: 'close', variant: 'secondary', onClick: callbacks.close, 'data-action': 'close' }, strings.close),
            empty.note && h('p', { className: 'aflpp-empty-note' }, empty.note),
            ), emptyContainer),
            createPortal(notice && h(Notice, {
                status: notice.status, isDismissible: notice.dismissible, onRemove: callbacks.dismissNotice,
                // The shell's status region announces state changes once, including window-operation failures.
                spokenMessage: '', politeness: 'polite',
                actions: [
                    ...(notice.retry ? [{ label: notice.action, disabled: notice.disabled, onClick: callbacks.retry }] : []),
                    ...(notice.close ? [{ label: strings.close, onClick: callbacks.close }] : []),
                ],
            }, h('p', null, h('strong', null, notice.heading)), notice.description && h('p', null, notice.description)), feedbackContainer),
            // Escape the panel's stacking context in-page; fullscreen/PiP must stay inside the panel.
            inPage ? createPortal(h(Popover.Slot), panel.ownerDocument.body) : h(Popover.Slot),
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
        if (state?.inPip && action === 'mode') action = 'actions';
        panel.querySelector(`[data-action="${action}"]`)?.focus({ preventScroll: true });
    }

    return {
        update(next) { state = next; render(); },
        closeMenu,
        focus,
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
