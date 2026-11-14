import assert from 'node:assert/strict';
import { icons } from '../src/panel/icons.js';
import { sourceForVm } from './helpers/modules.mjs';
import { panelStrings } from './helpers/panel-strings.mjs';
import test from 'node:test';
import vm from 'node:vm';

const source = await sourceForVm(new URL('../src/panel/controls.js', import.meta.url));

// Verify our native-component contract without duplicating WordPress's React or menu implementation.
function fixture({ nativeNotices = false, theme = false } = {}) {
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
    const callbacks = Object.fromEntries(['refresh', 'retry', 'dismissNotice', 'mode', 'close', 'popOut', 'fullscreen', 'dock', 'size', 'reset', 'follow', 'rememberVisibility', 'rememberPosition', 'device']
        .map((name) => [name, (...args) => calls.push({ name, args })]));
    const strings = panelStrings;
    const querySelector = (selector) => selector === '.aflpp-controls' ? container : {
        selector, focus() { calls.push({ name: 'focus', args: [selector] }); },
    };
    const body = {};
    function InlineNotices() {}
    function ThemeProvider() {}
    const records = new Map(), noticeWrites = [];
    const noticeActions = {
        createNotice(status, message, props) {
            records.set(`${props.context}/${props.id}`, { status, message, ...props });
            noticeWrites.push({ status, message, ...props });
        },
        removeNotice(id, context) { records.delete(`${context}/${id}`); },
    };
    const panel = { querySelector, ownerDocument: { querySelector, body, defaultView: { wp: { theme: theme ? { ThemeProvider } : {} } } } };
    const imports = {
        '@wordpress/element': element,
        '@wordpress/components': components,
        '@wordpress/data': { dispatch: () => noticeActions },
        '@wordpress/notices': { InlineNotices: nativeNotices ? InlineNotices : undefined, store: {} },
        './icons.js': { icons },
    };
    const createPreviewControls = vm.runInNewContext(`${source}\ncreatePreviewControls`, { imports });
    const controls = createPreviewControls(panel, strings, callbacks);
    const state = {
        inPage: true, inPip: false, movable: true, mode: 'expand', modeLabel: strings.expand, canRefresh: true,
        hasPreview: true, previewUrl: '/preview',
        canPip: true, canFullscreen: true, dock: 'center', size: 'small', rememberVisibility: true, rememberPosition: true, followChanges: false, device: 'desktop',
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
    return { controls, state, mounts, calls, nodes, icons, body, records, noticeWrites, InlineNotices, ThemeProvider };
}

test('header controls request native compact sizing in every window mode', () => {
    const h = fixture();
    for (const mode of ['in-page', 'fullscreen', 'PiP']) {
        h.controls.update({ ...h.state, inPage: mode === 'in-page', inPip: mode === 'PiP' });
        const buttons = h.nodes('Button').filter(({ props }) => props.className?.split(' ').includes('aflpp-icon'));
        assert.ok(buttons.length > 0, 'Refresh remains available in every mode.');
        for (const { props } of buttons) assert.equal(props.size, 'compact');
        assert.equal(h.nodes('DropdownMenu')[0].props.toggleProps.size, 'compact');
    }
});

test('the PiP menu action delegates to the window owner', () => {
    const h = fixture();
    h.nodes('MenuItem').find(({ props }) => props['data-action'] === 'pip').props.onClick();
    assert.equal(h.calls.at(-1).name, 'popOut');
});

test('native layout choices delegate selection and hide outside in-page mode', () => {
    const h = fixture();
    for (const [index, action, value, choices] of [
        [0, 'dock', 'center', ['left', 'center', 'right']],
        [1, 'size', 'small', ['small', 'large']],
    ]) {
        const control = h.nodes('MenuItemsChoice')[index];
        assert.equal(control.props.value, value);
        assert.deepEqual(Array.from(control.props.choices, ({ value }) => value), choices);
        control.props.onSelect(choices[0]);
        assert.deepEqual(h.calls.at(-1), { name: action, args: [choices[0]] });
    }
    h.controls.update({ ...h.state, inPage: false });
    assert.equal(h.nodes('MenuItemsChoice').length, 0);
});

test('in-page popovers escape the panel stacking context while fullscreen and PiP retain their slot', () => {
    const h = fixture();
    const slotPortal = () => h.nodes('Portal').find(({ children }) => children[0]?.type === 'Popover.Slot');
    assert.equal(slotPortal().props.target, h.body, 'use the native body overlay layer above the admin bar');
    for (const inPip of [false, true]) {
        h.controls.update({ ...h.state, inPage: false, inPip });
        assert.equal(slotPortal(), undefined, 'fullscreen and PiP popovers must not escape the panel');
        assert.equal(h.nodes('Popover.Slot').length, 1);
    }
    h.controls.update(h.state);
    assert.equal(slotPortal().props.target, h.body, 'return to the body overlay after leaving fullscreen or PiP');
});

test('viewport choices use native Toolbar buttons and pressed-state behavior', () => {
    const h = fixture();
    assert.equal(h.nodes('Toolbar')[0].props.label, 'Preview width');
    const buttons = h.nodes('ToolbarButton');
    assert.equal(buttons.length, 3);
    assert.deepEqual(buttons.map(({ props }) => props.isPressed), [true, false, false]);
    buttons[2].props.onClick();
    assert.deepEqual(h.calls.at(-1), { name: 'device', args: ['mobile'] });
});

for (const mode of ['in-page', 'fullscreen', 'PiP']) {
    test(`${mode} refresh stays visible and focusable while disabled during loading`, () => {
        const h = fixture();
        const state = { ...h.state, inPage: mode === 'in-page', inPip: mode === 'PiP' };
        h.controls.update(state);
        const refresh = () => h.nodes('Button').find(({ props }) => props['data-action'] === 'refresh');
        const portal = h.nodes('Portal').find(({ props }) => props.target.selector === '.aflpp-refresh-control');
        assert.equal(portal.children[0], refresh(), 'Keep refresh in the header in every window mode.');
        assert.equal(refresh().props.accessibleWhenDisabled, true);
        refresh().props.onClick();
        assert.equal(h.calls.at(-1).name, 'refresh');
        h.controls.update({ ...state, busy: true, canRefresh: false });
        assert.equal(refresh().props.icon.type, 'Spinner');
        assert.equal(refresh().props.label, 'Update preview');
        assert.equal(refresh().props.disabled, true);
        assert.equal(refresh().props.accessibleWhenDisabled, true, 'Use native aria-disabled behavior without disabling DOM focus.');
        h.controls.focus('refresh');
        assert.deepEqual(h.calls.at(-1), { name: 'focus', args: ['[data-action="refresh"]'] });
        h.controls.update({ ...state, busy: false });
        assert.equal(refresh().props.icon, h.icons.refresh);
        assert.equal(refresh().props.disabled, false);
        assert.equal(refresh().props.accessibleWhenDisabled, true);
    });
}

test('placeholder actions and loading use public components with no custom spinner or fake title button', () => {
    const h = fixture();
    h.controls.update({ ...h.state, hasPreview: false, empty: {
        heading: 'Loading', description: 'Preparing', note: 'Each tab keeps its edits', busy: true,
        retry: true, disabled: true, action: 'Switching',
    } });
    const placeholder = h.nodes('Placeholder')[0];
    assert.equal(placeholder.props.instructions, 'Preparing');
    assert.equal(placeholder.props.icon.type, 'Spinner');
    assert.equal(placeholder.props.label.type, 'h3', 'Nest the empty state below the panel heading.');
    assert.equal(placeholder.props.label.children[0], 'Loading');
    assert.equal(placeholder.props.label.props.tabIndex, -1, 'Keep programmatic focus without adding a Tab stop.');
    const retry = h.nodes('Button').find(({ props }) => props['data-action'] === 'retry');
    assert.equal(retry.props.disabled, true);
});

test('native notices keep unresolved failures persistent and dismiss only incidental window messages', () => {
    const h = fixture();
    h.controls.update({ ...h.state, notice: { heading: 'Failed', description: 'Previous frame', status: 'warning', dismissible: false, retry: true, action: 'Retry' } });
    let notice = h.nodes('Notice')[0];
    assert.equal(notice.props.isDismissible, false);
    assert.equal(notice.props.status, 'warning');
    assert.equal(notice.props.spokenMessage, '', 'The shell announces this state once.');
    assert.equal(notice.children[0], 'Failed. Previous frame', 'Render one plain message without a custom bold heading.');
    assert.equal(h.nodes('strong').length, 0);
    notice.props.actions[0].onClick();
    assert.equal(h.calls.at(-1).name, 'retry');
    h.controls.update({ ...h.state, notice: { heading: 'Pop-out failed', status: 'info', dismissible: true } });
    notice = h.nodes('Notice')[0];
    assert.equal(notice.props.isDismissible, true);
    notice.props.onRemove();
    assert.equal(h.calls.at(-1).name, 'dismissNotice');
});

test('inline notices stay scoped, quiet and stable across unrelated control updates', () => {
    const h = fixture({ nativeNotices: true, theme: true });
    const notice = { heading: 'Failed.', description: 'Previous frame', status: 'warning', dismissible: false, retry: true, action: 'Retry' };
    h.controls.update({ ...h.state, notice });
    const record = [...h.records.values()][0];
    assert.equal(record.context, 'a-floating-live-preview-panel', 'Never publish panel feedback in the global editor feed.');
    assert.equal(record.message, 'Failed. Previous frame', 'Do not duplicate existing punctuation.');
    assert.equal(record.speak, false, 'The shell owns announcements, including on core versions that use the notice store.');
    assert.equal(record.isDismissible, false);
    assert.equal(h.nodes('Notice').length, 0, 'Use the installed inline renderer when available.');
    assert.equal(h.nodes(h.InlineNotices)[0].props.context, record.context);
    assert.equal(h.nodes(h.ThemeProvider)[0].props.cornerRadius, 'none', 'Match the editor without changing other panel controls.');
    record.actions[0].onClick();
    assert.equal(h.calls.at(-1).name, 'retry');
    h.controls.update({ ...h.state, device: 'mobile', notice: { ...notice } });
    assert.equal(h.noticeWrites.length, 1, 'Do not recreate the same notice for geometry, menu or viewport updates.');
    h.controls.update(h.state);
    assert.equal(h.records.size, 0, 'Clear only our scoped feedback when the problem resolves.');
});

test('inline notices preserve dismissal, disabled actions and cleanup during document moves', () => {
    const h = fixture({ nativeNotices: true });
    const notice = { heading: 'Window operation failed', status: 'info', dismissible: true, retry: true, disabled: true, action: 'Retry' };
    const state = { ...h.state, notice };
    h.controls.update(state);
    let record = [...h.records.values()][0];
    assert.equal(record.actions[0].disabled, true);
    record.onDismiss();
    assert.equal(h.calls.at(-1).name, 'dismissNotice');
    h.controls.beforeMove();
    assert.equal(h.records.size, 0);
    h.controls.update({ ...state, inPage: false, inPip: true });
    assert.equal(h.records.size, 0, 'Do not recreate feedback while the React roots are detached.');
    h.controls.remount();
    record = [...h.records.values()][0];
    assert.equal(record.message, notice.heading);
    assert.equal(h.nodes(h.InlineNotices).length, 1);
    assert.equal(h.nodes(h.ThemeProvider).length, 0, 'Inline notices also work without an optional theme provider.');
    h.controls.update(h.state);
    assert.equal(h.records.size, 0);
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
    assert.equal(h.nodes('Button').some(({ props }) => props['data-action'] === 'refresh'), true);
    assert.equal(h.nodes('Button').some(({ props }) => props['data-action'] === 'mode'), false);
    assert.equal(h.nodes('DropdownMenu').length, 1);
});

test('PiP actions follow feature support and preview availability', () => {
    const h = fixture();
    const shortcut = () => h.nodes('Button').find(({ props }) => props['data-action'] === 'pop-out');
    const surface = h.nodes('div').find(({ props }) => props.className === 'aflpp-pip-surface');
    assert.equal(surface.children[0], shortcut(), 'Keep a backing surface separate from the native action Button.');
    assert.equal(shortcut().props.size, undefined);
    assert.equal(shortcut().props.isPressed, undefined, 'PiP is an action, not a selected viewport toggle.');
    shortcut().props.onClick();
    assert.equal(h.calls.at(-1).name, 'popOut');
    for (const next of [{ hasPreview: false }, { canPip: false }]) {
        h.controls.update({ ...h.state, ...next });
        assert.equal(shortcut(), undefined);
    }
    assert.equal(h.nodes('MenuItem').some(({ props }) => props['data-action'] === 'pip'), false);
    assert.equal(h.nodes('MenuItem').some(({ props }) => props['data-action'] === 'open-preview'), true);
});
