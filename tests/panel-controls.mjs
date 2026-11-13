import assert from 'node:assert/strict';
import { icons } from '../src/panel/icons.js';
import { moreVertical } from '@wordpress/icons';
import { sourceForVm } from './helpers/modules.mjs';
import test from 'node:test';
import vm from 'node:vm';

const source = await sourceForVm(new URL('../src/panel/controls.js', import.meta.url));

// Verify our native-component contract without duplicating WordPress's React or menu implementation.
function fixture() {
    const mounts = [];
    const calls = [];
    const container = {};
    const h = (type, props, ...children) => ({ type, props: props || {}, children });
    const components = Object.fromEntries(['Button', 'DropdownMenu', 'MenuGroup', 'MenuItem', 'MenuItemsChoice', 'Notice', 'Placeholder', 'Spinner', 'Toolbar', 'ToolbarButton', 'SlotFillProvider'].map((name) => [name, name]));
    components.Popover = { Slot: 'Popover.Slot' };
    const element = {
        createElement: h, Fragment: 'Fragment', createPortal: (child, target) => h('Portal', { target }, child), flushSync: (callback) => callback(),
        createRoot(target) {
            const mount = { target, renders: 0, unmounts: 0, render(node) { this.tree = node.type(); this.renders++; }, unmount() { this.unmounts++; } };
            mounts.push(mount);
            return mount;
        },
    };
    const callbacks = Object.fromEntries(['refresh', 'retry', 'dismissNotice', 'mode', 'close', 'popOut', 'fullscreen', 'dock', 'size', 'reset', 'follow', 'rememberVisibility', 'device']
        .map((name) => [name, (...args) => calls.push({ name, args })]));
    const strings = new Proxy({ popOut: 'Pop out preview (PiP)' }, { get: (target, key) => target[key] ?? String(key) });
    const querySelector = (selector) => selector === '.aflpp-controls' ? container : {
        selector, focus() { calls.push({ name: 'focus', args: [selector] }); },
    };
    const panel = { querySelector, ownerDocument: { querySelector } };
    const imports = {
        '@wordpress/element': element,
        '@wordpress/components': components,
        './icons.js': { icons },
    };
    const createPreviewControls = vm.runInNewContext(`${source}\ncreatePreviewControls`, { imports });
    const controls = createPreviewControls(panel, strings, callbacks);
    const state = {
        inPage: true, inPip: false, movable: true, mode: 'expand', modeLabel: 'Expand preview', canRefresh: true,
        hasPreview: true, previewUrl: '/preview',
        canPip: true, canFullscreen: true, dock: 'center', size: 'small', rememberVisibility: true, followChanges: false, device: 'desktop',
    };
    controls.update(state);
    function nodes(type) {
        const result = [];
        function walk(node) {
            if (typeof node === 'function') return walk(node());
            if (!node || typeof node !== 'object') return;
            if (node.type === type) result.push(node);
            for (const child of node.children || []) walk(child);
        }
        walk(mounts.at(-1).tree);
        return result;
    }
    return { controls, state, mounts, calls, nodes, icons };
}

test('PiP uses the official window icon and shared label, not a fake shortcut', () => {
    const h = fixture();
    const item = h.nodes('MenuItem').find(({ props }) => props['data-action'] === 'pip');
    assert.equal(item.props.icon, h.icons.pip);
    assert.equal(item.props.suffix, undefined);
    assert.equal(item.props['aria-label'], 'Pop out preview (PiP)');
    assert.equal(item.children[0], 'Pop out preview (PiP)');
    assert.equal(item.props.shortcut, undefined);
    assert.equal(item.props['aria-keyshortcuts'], undefined);
    item.props.onClick();
    assert.equal(h.calls.at(-1).name, 'popOut');
});

test('position choices and preferences use native radio and checkbox components', () => {
    const h = fixture();
    const choices = h.nodes('MenuItemsChoice')[0];
    assert.equal(choices.props.value, 'center');
    assert.deepEqual(Array.from(choices.props.choices, ({ value }) => value), ['left', 'center', 'right']);
    choices.props.onSelect('left');
    assert.deepEqual(h.calls.at(-1), { name: 'dock', args: ['left'] });
    const toggles = h.nodes('MenuItem').filter(({ props }) => props.role === 'menuitemcheckbox');
    assert.equal(toggles.length, 2);
    assert.equal(toggles[0].props.isSelected, true);
    assert.equal(toggles[1].props.isSelected, false);
    assert.equal(h.nodes('Popover.Slot').length, 1);
});

test('size presets offer native single-choice controls without dragging and stay out of PiP/fullscreen', () => {
    const h = fixture();
    const sizes = h.nodes('MenuItemsChoice')[1];
    assert.equal(sizes.props.value, 'small');
    assert.deepEqual(Array.from(sizes.props.choices, ({ value }) => value), ['small', 'large']);
    sizes.props.onSelect('large');
    assert.deepEqual(h.calls.at(-1), { name: 'size', args: ['large'] });
    h.controls.update({ ...h.state, inPage: false });
    assert.equal(h.nodes('MenuItemsChoice').length, 0);
});

test('viewport choices use native Toolbar buttons and pressed-state behavior', () => {
    const h = fixture();
    assert.equal(h.nodes('Toolbar')[0].props.label, 'viewport');
    const buttons = h.nodes('ToolbarButton');
    assert.equal(buttons.length, 3);
    assert.deepEqual(buttons.map(({ props }) => props.isPressed), [true, false, false]);
    buttons[2].props.onClick();
    assert.deepEqual(h.calls.at(-1), { name: 'device', args: ['mobile'] });
});

test('the refresh button communicates background activity and restores its icon when ready', () => {
    const h = fixture();
    const refresh = () => h.nodes('Button').find(({ props }) => props['data-action'] === 'refresh');
    h.controls.update({ ...h.state, busy: true, canRefresh: false });
    assert.equal(refresh().props.icon.type, 'Spinner');
    assert.equal(refresh().props.label, 'refresh');
    assert.equal(refresh().props.disabled, true);
    h.controls.update({ ...h.state, busy: false });
    assert.equal(refresh().props.icon, h.icons.refresh);
    assert.equal(refresh().props.disabled, false);
});

test('placeholder actions and loading use public components with no custom spinner or fake title button', () => {
    const h = fixture();
    h.controls.update({ ...h.state, hasPreview: false, empty: {
        heading: 'Loading', description: 'Preparing', note: 'Each tab keeps its edits', busy: true,
        retry: true, disabled: true, action: 'Switching',
    } });
    const placeholder = h.nodes('Placeholder')[0];
    assert.equal(placeholder.props.instructions, 'Preparing');
    assert.equal(placeholder.props.icon.type, 'Spinner');
    const retry = h.nodes('Button').find(({ props }) => props['data-action'] === 'retry');
    assert.equal(retry.props.disabled, true);
    assert.equal(retry.props.variant, 'primary');
    assert.equal(h.nodes('Button').find(({ props }) => props['data-action'] === 'move').props.icon, h.icons.move);
});

test('native notices keep unresolved failures persistent and dismiss only incidental window messages', () => {
    const h = fixture();
    h.controls.update({ ...h.state, notice: { heading: 'Failed', description: 'Previous frame', status: 'warning', dismissible: false, retry: true, action: 'Retry' } });
    let notice = h.nodes('Notice')[0];
    assert.equal(notice.props.isDismissible, false);
    assert.equal(notice.props.status, 'warning');
    assert.equal(notice.props.spokenMessage, '', 'The shell announces this state once.');
    notice.props.actions[0].onClick();
    assert.equal(h.calls.at(-1).name, 'retry');
    h.controls.update({ ...h.state, notice: { heading: 'Pop-out failed', status: 'info', dismissible: true } });
    notice = h.nodes('Notice')[0];
    assert.equal(notice.props.isDismissible, true);
    notice.props.onRemove();
    assert.equal(h.calls.at(-1).name, 'dismissNotice');
});

test('document moves unmount old native hooks before creating the next root', () => {
    const h = fixture();
    const original = h.mounts[0];
    h.controls.beforeMove();
    assert.equal(original.unmounts, 1);
    h.controls.update({ ...h.state, inPage: false, inPip: true, canPip: false });
    assert.equal(original.renders, 1, 'state updates while detached must not render into the old root');
    h.controls.remount();
    assert.equal(h.mounts.length, 2);
    assert.equal(h.nodes('Button').some(({ props }) => props['data-action'] === 'mode'), false);
    assert.equal(h.nodes('DropdownMenu').length, 1);
});

test('controls pass the official bundled icon elements directly to native components', () => {
    const h = fixture();
    const refresh = h.nodes('Button').find(({ props }) => props['data-action'] === 'refresh');
    assert.equal(refresh.props.icon, h.icons.refresh);
    assert.equal(h.nodes('Button').find(({ props }) => props['data-action'] === 'move').props.tooltipPosition, 'bottom', 'do not cover the upper resize corner');
    assert.equal(h.nodes('DropdownMenu')[0].props.icon, h.icons.more);
    const portalIcon = (selector) => h.nodes('Portal').find(({ props }) => props.target.selector === selector).children[0];
    assert.equal(portalIcon('#aflpp-toggle .aflpp-launcher-icon'), h.icons.pip);
    assert.equal(h.nodes('Button').find(({ props }) => props['data-action'] === 'move').props.icon, h.icons.move);
    assert.equal(h.nodes('Button').some(({ props }) => props.icon === h.icons.resize), false);
    const icons = [...h.nodes('Button'), ...h.nodes('MenuItem')].map(({ props }) => props.icon).filter(Boolean);
    assert.ok(icons.length >= 7, 'cover header, viewport and preference icons');
    for (const icon of icons) {
        assert.ok(Object.values(h.icons).includes(icon), 'do not reconstruct or modify the library icons');
        assert.equal(icon.props.style.fill, 'none', 'official inline paint must override native-button SVG fill');
        assert.equal(icon.props.stroke, 'currentColor');
        assert.equal(Number(icon.props.strokeWidth), 1.5);
    }
});

test('expanded and fullscreen controls retain the official compact icon', () => {
    const h = fixture();
    const modeIcon = () => h.nodes('Button').find(({ props }) => props['data-action'] === 'mode').props.icon;
    assert.equal(modeIcon(), h.icons.expand);
    h.controls.update({ ...h.state, mode: 'compact', modeLabel: 'Make preview compact' });
    assert.equal(modeIcon(), h.icons.compact);
    h.controls.update({ ...h.state, inPage: false, mode: 'compact', modeLabel: 'Exit fullscreen' });
    assert.equal(modeIcon(), h.icons.compact);
    assert.equal(modeIcon().props.style.fill, 'none');
});

test('the preview shortcut is icon-only, labelled and available only for a visible preview with PiP support', () => {
    const h = fixture();
    const shortcut = () => h.nodes('Button').find(({ props }) => props['data-action'] === 'pop-out');
    assert.equal(shortcut().props.icon, h.icons.pip);
    assert.equal(shortcut().props.label, 'Pop out preview (PiP)');
    assert.equal(shortcut().props['aria-label'], 'Pop out preview (PiP)');
    assert.equal(shortcut().props.showTooltip, true);
    assert.equal(shortcut().children.length, 0, 'no visible PiP text');
    shortcut().props.onClick();
    assert.equal(h.calls.at(-1).name, 'popOut');
    for (const next of [{ hasPreview: false }, { canPip: false }]) {
        h.controls.update({ ...h.state, ...next });
        assert.equal(shortcut(), undefined);
    }
});

test('unsupported PiP hides both the shortcut and its menu action', () => {
    const h = fixture();
    h.controls.update({ ...h.state, canPip: false });
    assert.equal(h.nodes('Button').some(({ props }) => props['data-action'] === 'pop-out'), false);
    assert.equal(h.nodes('MenuItem').some(({ props }) => props['data-action'] === 'pip'), false);
    assert.equal(h.nodes('MenuItem').some(({ props }) => props['data-action'] === 'open-preview'), true);
});

test('PiP relies on browser window controls and keeps Refresh and Close live preview in its menu', () => {
    const h = fixture();
    h.controls.update({ ...h.state, inPage: false, inPip: true, canPip: false, canFullscreen: false });
    assert.equal(h.nodes('Button').filter(({ props }) => props['data-action']).length, 0, 'no duplicate window or refresh buttons');
    const refresh = h.nodes('MenuItem').find(({ props }) => props['data-action'] === 'refresh');
    assert.equal(refresh.props.disabled, false);
    refresh.props.onClick();
    assert.equal(h.calls.at(-1).name, 'refresh');
    const close = h.nodes('MenuItem').find(({ props }) => props['data-action'] === 'close');
    assert.equal(close.children[0], 'closeLivePreview');
    close.props.onClick();
    assert.equal(h.calls.at(-1).name, 'close');
    h.controls.update({ ...h.state, inPage: false, inPip: true, canPip: false, canRefresh: false });
    assert.equal(h.nodes('MenuItem').find(({ props }) => props['data-action'] === 'refresh').props.disabled, true);
    h.controls.focus('mode');
    assert.deepEqual(h.calls.at(-1), { name: 'focus', args: ['[data-action="actions"]'] });
});

test('the official vertical actions icon preserves all three filled dots and their three stroke paths', () => {
    const h = fixture();
    const icon = h.nodes('DropdownMenu')[0].props.icon;
    assert.equal(icon, moreVertical);
    assert.equal(icon.props.style.fill, 'none');
    assert.equal(icon.props.stroke, 'currentColor');
    const paths = icon.props.children;
    assert.equal(paths.length, 6);
    assert.equal(paths.filter(({ props }) => props.fill === 'currentColor' && props.stroke === 'none').length, 3);
    assert.equal(paths.filter(({ props }) => props.stroke === undefined).length, 3);
});
