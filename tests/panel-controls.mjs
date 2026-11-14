import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { icons } from '../src/panel/icons.js';
import { moreVertical } from '@wordpress/icons';
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


test('PHP supplies only the launcher mount and escaped labels, not a hand-written button', async () => {
    const template = await readFile(new URL('../views/panel.php', import.meta.url), 'utf8');
    const launcher = template.split('<section')[0];
    assert.match(launcher, /<div id="aflpp-toggle" class="aflpp-launcher" hidden/);
    assert.ok(launcher.includes('data-title="<?php echo esc_attr($title); ?>"'));
    assert.match(launcher, /data-move-help=/);
    assert.doesNotMatch(launcher, /<button|components-button|components-external-link/);
});

test('panel scopes its header and footer to a section labelled by its visible heading', async () => {
    const template = await readFile(new URL('../views/panel.php', import.meta.url), 'utf8');
    const panel = template.match(/<section\b[\s\S]*?<\/section>/)?.[0];
    assert.ok(panel, 'Keep the panel as its own section.');
    const section = panel.match(/^<section\b[^>]*>/)[0];
    assert.match(section, /aria-labelledby="aflpp-title"/);
    assert.doesNotMatch(section, /\baria-label=/);
    assert.ok(panel.includes('<h2 id="aflpp-title" class="aflpp-caption"><?php echo esc_html($title); ?></h2>'));
    assert.match(panel, /<header class="aflpp-header">[\s\S]*?class="aflpp-controls"[\s\S]*?<\/header>/);
    assert.match(panel, /<footer class="aflpp-devicebar" hidden>[\s\S]*?class="aflpp-device-controls"[\s\S]*?<\/footer>/);
});

for (const direction of ['ltr', 'rtl']) {
    test(`launcher renders a native WordPress secondary Button synchronously in ${direction}`, () => {
        const Button = Symbol('Native Button');
        const button = {};
        const container = { dir: direction, dataset: { title: 'Revision preview', moveHelp: 'Drag or use arrow keys.' } };
        let tree;
        let mounts = 0;
        const imports = {
            '@wordpress/components': { Button },
            '@wordpress/data': {},
            '@wordpress/notices': {},
            './icons.js': {},
            '@wordpress/element': {
                createElement: (type, props, ...children) => ({ type, props, children }),
                flushSync: (callback) => callback(),
                createRoot(target) {
                    assert.equal(target, container);
                    mounts++;
                    return { render(node) {
                        assert.equal(node.type, Button, 'Render the button directly, without a Card wrapper.');
                        tree = node;
                        tree.props.ref(button);
                    } };
                },
            },
        };
        const createLauncher = vm.runInNewContext(`${source}\ncreatePreviewLauncher`, { imports });
        assert.equal(createLauncher(container), button, 'Bind interactions to the actual native button after mounting.');
        assert.equal(mounts, 1);
        assert.equal(tree.type, Button);
        assert.equal(tree.props.variant, 'secondary');
        assert.equal(tree.props.className, undefined, 'The native component supplies its own components-button class.');
        assert.equal(tree.props.style, undefined);
        assert.equal(tree.props.label, 'Revision preview');
        assert.equal(tree.props.title, 'Revision preview');
        assert.equal(tree.props.description, container.dataset.moveHelp, 'Use the native accessible description.');
        assert.equal(tree.props['aria-controls'], 'aflpp-panel');
        assert.equal(tree.props['aria-expanded'], false);
        assert.equal(tree.props.hidden, undefined, 'Hide the entire surface through its mount, not just the button.');
        assert.equal(tree.props.href, undefined, 'This opens a panel, not an external page.');
        assert.equal(tree.props.icon, undefined, 'Do not imply that the preview opens externally.');
        assert.equal(tree.children.length, 1, 'Keep the launcher text-only, without a trailing icon.');
        assert.equal(tree.children[0].props.className, 'aflpp-launcher-label');
        assert.equal(tree.children[0].children[0], 'Revision preview');
    });
}

test('picture-in-picture keeps the browser feature name with a plain native tooltip and no fake shortcut', () => {
    const h = fixture();
    const item = h.nodes('MenuItem').find(({ props }) => props['data-action'] === 'pip');
    assert.equal(item.props.icon, undefined);
    assert.equal(item.props.suffix, undefined);
    assert.equal(item.props['aria-label'], 'Picture-in-picture');
    assert.equal(item.children[0], 'Picture-in-picture');
    assert.equal(item.props.label, 'Open the preview in a window that stays on top.');
    assert.equal(item.props.description, item.props.label);
    assert.equal(item.props.showTooltip, true);
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
    assert.equal(toggles.length, 3);
    assert.deepEqual(toggles.map(({ props }) => [props['data-action'], props.isSelected]), [
        ['remember-visibility', true], ['remember-position', true], ['follow', false],
    ]);
    assert.equal(h.nodes('Popover.Slot').length, 1);
});

for (const inPage of [true, false]) {
    test(`layout remembering uses the existing native checkbox pattern ${inPage ? 'in-page' : 'outside in-page mode'}`, async () => {
        const labels = await readFile(new URL('../classes/Panel.php', import.meta.url), 'utf8');
        assert.match(labels, /'rememberPosition' => __\('Remember size and position', 'a-floating-live-preview-panel'\)/);
        const h = fixture();
        const toggle = () => h.nodes('MenuItem').find(({ props }) => props['data-action'] === 'remember-position');
        for (const rememberPosition of [true, false]) {
            h.controls.update({ ...h.state, inPage, rememberPosition });
            assert.equal(toggle().props.role, 'menuitemcheckbox');
            assert.equal(toggle().props.isSelected, rememberPosition);
            assert.equal(toggle().props.icon, rememberPosition ? h.icons.check : undefined);
            assert.equal(toggle().children[0], 'Remember size and position');
            toggle().props.onClick();
            assert.deepEqual(h.calls.at(-1), { name: 'rememberPosition', args: [] });
        }
    });
}

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

test('controls pass the official bundled icon elements directly to native components', () => {
    const h = fixture();
    const refresh = h.nodes('Button').find(({ props }) => props['data-action'] === 'refresh');
    assert.equal(refresh.props.icon, h.icons.refresh);
    assert.equal(h.nodes('Button').find(({ props }) => props['data-action'] === 'move').props.tooltipPosition, 'bottom', 'do not cover the upper resize corner');
    assert.equal(h.nodes('DropdownMenu')[0].props.icon, h.icons.more);
    assert.equal(h.nodes('Button').find(({ props }) => props['data-action'] === 'move').props.icon, h.icons.move);
    assert.equal(h.nodes('Button').some(({ props }) => props.icon === h.icons.resize), false);
    const icons = [...h.nodes('Button'), ...h.nodes('MenuItem')].map(({ props }) => props.icon).filter(Boolean);
    assert.ok(icons.length >= 6, 'cover header, PiP shortcut and preference icons');
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
    h.controls.update({ ...h.state, mode: 'compact', modeLabel: panelStrings.compact });
    assert.equal(modeIcon(), h.icons.compact);
    h.controls.update({ ...h.state, inPage: false, mode: 'compact', modeLabel: panelStrings.exitFullscreen });
    assert.equal(modeIcon(), h.icons.compact);
    assert.equal(modeIcon().props.style.fill, 'none');
});

test('the preview shortcut is icon-only, labelled and available only for a visible preview with PiP support', () => {
    const h = fixture();
    const shortcut = () => h.nodes('Button').find(({ props }) => props['data-action'] === 'pop-out');
    const surface = h.nodes('div').find(({ props }) => props.className === 'aflpp-pip-surface');
    assert.equal(surface.children[0], shortcut(), 'Keep a backing surface separate from the native action Button.');
    assert.equal(shortcut().props.size, undefined);
    assert.equal(shortcut().props.isPressed, undefined, 'PiP is an action, not a selected viewport toggle.');
    assert.equal(shortcut().props.icon, h.icons.pip);
    assert.equal(shortcut().props.label, 'Open the preview in a window that stays on top.');
    assert.equal(shortcut().props['aria-label'], 'Picture-in-picture');
    assert.equal(shortcut().props.description, shortcut().props.label);
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

test('PiP keeps header refresh without duplicating browser window controls or the menu action', () => {
    const h = fixture();
    h.controls.update({ ...h.state, inPage: false, inPip: true, canPip: false, canFullscreen: false });
    assert.deepEqual(h.nodes('Button').map(({ props }) => props['data-action']).filter(Boolean), ['refresh']);
    assert.equal(h.nodes('MenuItem').some(({ props }) => props['data-action'] === 'refresh'), false);
    const close = h.nodes('MenuItem').find(({ props }) => props['data-action'] === 'close');
    assert.equal(close.children[0], 'Close live preview');
    close.props.onClick();
    assert.equal(h.calls.at(-1).name, 'close');
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
