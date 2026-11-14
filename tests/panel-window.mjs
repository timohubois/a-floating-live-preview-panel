import assert from 'node:assert/strict';
import { getEventListeners, setMaxListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import { sourceForVm } from './helpers/modules.mjs';
import { createPanelGeometry } from '../src/panel/geometry.js';
import { panelStrings, revisionStrings, blockEditorStrings } from './helpers/panel-strings.mjs';
import test from 'node:test';
import vm from 'node:vm';

const source = await sourceForVm(new URL('../src/panel/window.js', import.meta.url));

// Exercise the view's lifecycle and launcher label without starting requests or changing native controls.
function fixture(open = false, {
    layout, position, rememberPosition, preferences: savedPreferences, labels = {},
    width = 1440, height = 1000, direction = 'ltr', gutter = 20, scrollbar = 0, toolbarHeight = 32,
    nativeSaving = false, pip = false, pipApi, videoPip = false, stylesheets = [],
} = {}) {
    const nodes = new Map();
    const preferences = new Map(savedPreferences ?? [
        ['panelOpen', open], ['layout', layout], ['position', position], ['rememberPosition', rememberPosition],
    ]);
    const writes = [];
    const target = (element) => Object.assign(new EventTarget(), element, {
        fire(type, properties = {}) {
            const event = Object.assign(new Event(type, { cancelable: true }), {
                button: 0, pointerId: 1, clientX: 100, clientY: 100, ...properties,
            });
            this.dispatchEvent(event);
            return event;
        },
    });
    const document = target({ pictureInPictureEnabled: videoPip, getElementById: (id) => node(id) });
    function node(key) {
        if (nodes.has(key)) return nodes.get(key);
        const captured = new Set();
        const classes = new Set();
        const element = target({
            key, ownerDocument: document, style: { setProperty() {}, removeProperty() {} }, dataset: {}, textContent: '',
            classList: {
                add: (name) => classes.add(name), remove: (name) => classes.delete(name),
                toggle(name, value) { if (value) classes.add(name); else classes.delete(name); },
                contains: (name) => classes.has(name),
            },
            setAttribute() {}, removeAttribute() {}, replaceChildren() {},
            append(child) { this.lastElementChild = child; },
            prepend(child) { this.firstElementChild = child; },
            focus() { document.activeElement = this; },
            contains: (other) => other === element || other?.key?.startsWith(`${key} `),
            setPointerCapture: (pointer) => captured.add(pointer),
            hasPointerCapture: (pointer) => captured.has(pointer),
            releasePointerCapture: (pointer) => captured.delete(pointer),
            querySelector: (selector) => node(`${key} ${selector}`),
            querySelectorAll: (selector) => selector === '[data-resize-edge]' ? ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((edge) => {
                const handle = node(`${key} .aflpp-edge-${edge}`);
                handle.dataset.resizeEdge = edge;
                return handle;
            }) : [],
        });
        nodes.set(key, element);
        return element;
    }
    document.documentElement = node('html');
    Object.defineProperties(document.documentElement, {
        clientWidth: { get: () => window.innerWidth - scrollbar },
        clientHeight: { get: () => window.innerHeight },
    });
    document.documentElement.getBoundingClientRect = () => ({ left: direction === 'rtl' ? scrollbar : 0 });
    document.querySelector = (selector) => selector === '#wpbody-content > .wrap' ? node('wrap') : null;
    node('wrap').getBoundingClientRect = () => ({
        left: (direction === 'rtl' ? scrollbar + gutter : 180),
        right: (direction === 'rtl' ? scrollbar : 0) + window.innerWidth - scrollbar - (direction === 'rtl' ? 180 : gutter),
    });
    node('wpadminbar').getBoundingClientRect = () => ({ bottom: toolbarHeight });
    const styleNodes = stylesheets.map((style) => target({ ...style, cloneNode: () => target({ ...style }) }));
    document.querySelectorAll = (selector) => styleNodes.filter(({ id, href = '', rel, dataEmotion, dataWpHash }) => selector.split(', ').some((part) =>
        part === 'style[data-emotion]' ? dataEmotion !== undefined
            : part === 'style[data-wp-hash]' ? dataWpHash !== undefined
                : part.startsWith('#') ? id === part.slice(1) : rel === 'stylesheet' && href.includes('/load-styles.php')
    ));
    const copiedStyles = [];
    const detachedDocument = { documentElement: node('pip-html'), head: { append: (style) => copiedStyles.push(style) } };
    detachedDocument.body = { append: (panel) => { panel.ownerDocument = detachedDocument; } };
    document.body = { append: (panel) => { panel.ownerDocument = document; } };
    const detached = target({ document: detachedDocument, close() { this.fire('pagehide'); } });
    const requests = [];
    const launcherContainer = node('aflpp-toggle');
    const launcher = node('launcher-button');
    launcher.title = 'Live preview'; // Native Button's action label.
    launcherContainer.offsetWidth = 160;
    launcherContainer.offsetHeight = 40;
    const window = target({
        innerWidth: width, innerHeight: height, scrollX: 0, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
        getComputedStyle: () => ({ direction, cursor: 'ew-resize', getPropertyValue: () => '' }),
        wp: { data: {
            select: () => ({ get: (scope, key) => preferences.get(key) }),
            dispatch: () => ({ setDefaults() {}, set: (scope, key, value) => {
                preferences.set(key, value);
                writes.push({ key, value });
            } }),
        } },
    });
    setMaxListeners(0, window); // Browser windows have no Node listener warning limit.
    if (pip) window.documentPictureInPicture = { requestWindow: async (options) => { requests.push(options); return detached; } };
    if (pipApi !== undefined) window.documentPictureInPicture = pipApi;
    const strings = new Proxy({ title: 'Live preview', preview: 'Preview', loading: 'Loading preview…', ...labels }, {
        get: (target, key) => target[key] ?? String(key),
    });
    let actions;
    let state;
    const focusCalls = [];
    const retryCalls = [];
    const controls = { closeMenu() {}, focus(action) { focusCalls.push(action); }, beforeMove() {}, remount() {}, update(next) { state = next; } };
    const createControls = (panel, labels, callbacks) => { actions = callbacks; return controls; };
    const imports = {
        '@wordpress/data': window.wp.data,
        '@wordpress/preferences': { store: { name: 'core/preferences' } },
        './geometry.js': { createPanelGeometry },
        './controls.js': { createPreviewControls: createControls, createPreviewLauncher: () => launcher },
        './viewport.js': { createPreviewViewport: () => ({
            device: 'desktop', layout() {}, beforeMove() {}, afterMove() {},
        }) },
    };
    delete window.wp;
    const createPreviewPanel = vm.runInNewContext(`${source}\ncreatePreviewPanel`, { window, document, imports });
    const view = createPreviewPanel(strings, {
        nativeSaving, beforeMove() {}, afterMove() {},
        onOpen() { view.setVisible(true); }, onClose() { view.setVisible(false); }, onRetry(takeOver) { retryCalls.push(takeOver); },
    });
    const panel = node('aflpp-panel');
    return {
        view, launcher, launcherContainer, panel, node, actions, window, document, preferences, writes, detached, copiedStyles,
        requests, focusCalls, retryCalls,
        get state() { return state; },
        rect: () => Object.fromEntries(['left', 'top', 'width', 'height'].map((key) => [key, parseFloat(panel.style[key])])),
    };
}

for (const combined of [false, true]) {
    test(`PiP retains native control styles with ${combined ? 'concatenated' : 'standalone'} core CSS`, async () => {
        const core = combined
            ? { rel: 'stylesheet', href: '/wp-admin/load-styles.php?load%5Bchunk_0%5D=common,forms,wp-components' }
            : { id: 'wp-components-css', rel: 'stylesheet', href: '/wp-includes/css/dist/components/style.min.css' };
        const inline = { id: 'wp-components-inline-css' };
        const panel = { id: 'a-floating-live-preview-panel-css', rel: 'stylesheet', href: '/build/classic-editor.css' };
        const panelInline = { id: 'a-floating-live-preview-panel-inline-css' };
        const h = fixture(true, { pip: true, stylesheets: [
            core, inline, { id: 'unrelated-css', rel: 'stylesheet', href: '/unrelated.css' }, panel, panelInline,
        ] });
        assert.equal(h.state.canPip, true, 'Document PiP does not require video PiP support');
        await h.actions.popOut();
        assert.deepEqual(h.copiedStyles.map(({ id, href }) => ({ id, href })),
            [core, inline, panel, panelInline].map(({ id, href }) => ({ id, href })));
        assert.ok(h.copiedStyles.every((style) => getEventListeners(style, 'load').length === 1));
        assert.equal(h.panel.ownerDocument, h.detached.document);
        assert.equal(h.state.inPip, true);
        h.detached.close();
        assert.equal(h.panel.ownerDocument, h.document);
        assert.equal(h.state.mode, 'expand');
        assert.equal(h.writes.length, 0, 'PiP styling and document moves must not change layout preferences');
    });
}

for (const cssom of [false, true]) {
    test(`PiP copies runtime spinner styles and keyframes from ${cssom ? 'CSSOM-only' : 'text-backed'} stylesheets`, async () => {
        const rules = [
            '.native-spinner { color: #2271b1; overflow: visible; }',
            '.native-spinner path { fill: transparent; stroke: currentColor; animation: native-spin 1.4s linear infinite; }',
            '@keyframes native-spin { to { transform: rotate(360deg); } }',
        ];
        const runtime = {
            tagName: 'STYLE', dataEmotion: 'css', textContent: cssom ? '' : rules.join('\n'),
            sheet: { cssRules: rules.map((cssText) => ({ cssText })) },
        };
        const module = { tagName: 'STYLE', dataWpHash: 'native-module', textContent: '.native-module { margin: 0; }' };
        const h = fixture(true, { pip: true, stylesheets: [runtime, module, { tagName: 'STYLE', textContent: '.unrelated {}' }] });
        await h.actions.popOut();
        assert.equal(h.state.inPip, true);
        assert.deepEqual(h.copiedStyles.map(({ textContent }) => textContent), [rules.join('\n'), module.textContent]);
        assert.equal(runtime.textContent, cssom ? '' : rules.join('\n'), 'Never modify the editor stylesheet.');
        h.view.report('updating', 'loading', { hasPreview: true });
        assert.equal(h.state.busy, true, 'The copied spinner styles remain available for later refreshes.');
        h.detached.close();
        await h.actions.popOut();
        assert.deepEqual(h.copiedStyles.slice(2).map(({ textContent }) => textContent), [rules.join('\n'), module.textContent]);
    });
}

for (const scenario of [
    { name: 'no PiP API' },
    { name: 'video PiP only', videoPip: true },
    { name: 'null Document PiP API', pipApi: null },
    { name: 'incomplete Document PiP API', pipApi: {} },
    { name: 'non-callable requestWindow', pipApi: { requestWindow: true } },
]) {
    test(`PiP remains unavailable with ${scenario.name}`, async () => {
        const h = fixture(true, scenario);
        const before = h.rect();
        assert.equal(h.state.canPip, false);
        await h.actions.popOut();
        assert.equal(h.state.inPip, false);
        assert.equal(h.requests.length, 0);
        assert.deepEqual(h.rect(), before);
        assert.equal(h.writes.length, 0);
    });
}

test('PiP is transient and adds no navigation handling or automatic reopening', async () => {
    const h = fixture(true, { pip: true });
    await h.actions.popOut();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state.inPip, true);
    assert.equal(getEventListeners(h.window, 'beforeunload').length, 0);
    assert.equal(h.writes.length, 0);
    h.detached.close();
    const next = fixture(true, { pip: true });
    assert.equal(next.state.inPip, false);
    assert.equal(next.requests.length, 0, 'opening PiP always needs an explicit user action');
    assert.equal(next.writes.length, 0);
});

test('rejected PiP leaves in-page geometry intact', async () => {
    const h = fixture(true, { pip: true });
    const before = h.rect();
    h.window.documentPictureInPicture.requestWindow = async () => { throw new Error('Rejected'); };
    await h.actions.popOut();
    assert.equal(h.state.inPip, false);
    assert.deepEqual(h.rect(), before);
    assert.equal(h.writes.length, 0);
});

test('an initially closed panel does not claim to load a preview on launcher hover', () => {
    const { view, launcher } = fixture();
    assert.equal(view.visible, false);
    assert.equal(launcher.title, 'Live preview');
});

test('launcher geometry and visibility apply to its floating surface while the native Button owns interactions', () => {
    const h = fixture();
    assert.equal(h.launcherContainer.hidden, false);
    assert.ok(parseFloat(h.launcherContainer.style.left) > 0);
    assert.equal(h.launcher.style.left, undefined, 'Do not position the Button separately from its floating surface.');
    for (const event of ['click', 'keydown', 'pointerdown']) {
        assert.equal(getEventListeners(h.launcher, event).length, 1);
        assert.equal(getEventListeners(h.launcherContainer, event).length, 0);
    }
    h.launcher.fire('click', { detail: 0 });
    assert.equal(h.launcherContainer.hidden, true, 'Do not leave an empty floating surface behind the open panel.');
    h.actions.close();
    assert.equal(h.launcherContainer.hidden, false);
    assert.equal(h.document.activeElement, h.launcher);
});

test('a native Save during startup does not override remembered panel visibility', () => {
    assert.equal(fixture(true, { nativeSaving: true }).view.visible, true);
    assert.equal(fixture(false, { nativeSaving: true }).view.visible, false);
});

test('closing a ready panel clears its frame without changing the launcher into a loading indicator', () => {
    const { view, launcher, launcherContainer, panel } = fixture(true);
    view.report(panelStrings.current, 'ready', { hasPreview: true });
    view.setVisible(false);
    view.clearPreview();
    assert.equal(panel.hidden, true);
    assert.equal(launcherContainer.hidden, false);
    assert.equal(launcher.title, 'Live preview');
});

test('pending, loading, ready and problem states keep refresh activity and accessible status in sync', () => {
    const h = fixture(true);
    const status = h.node('aflpp-panel [role="status"]');
    h.view.report('Loading preview…', 'loading', { hasPreview: false });
    assert.equal(status.textContent, 'Loading preview…');
    h.view.report(panelStrings.stale, 'stale', { hasPreview: true });
    assert.equal(status.textContent, 'Waiting to update preview…');
    assert.equal(h.state.busy, true, 'Show activity while changes wait for the debounced refresh.');
    assert.equal(h.state.canRefresh, false);
    assert.equal(h.state.empty, null, 'Keep the previous frame visible.');
    assert.equal(h.state.notice, null);
    h.view.report('Updating preview…', 'loading', { hasPreview: true });
    assert.equal(status.textContent, 'Updating preview…');
    assert.equal(h.state.busy, true);
    h.view.report(panelStrings.current, 'ready', { hasPreview: true, canRefresh: true });
    assert.equal(status.textContent, 'Preview updated');
    assert.equal(h.state.busy, false);
    h.view.report('Could not refresh', 'error', { hasPreview: true, canRetry: true });
    assert.match(status.textContent, /Could not refresh/);
    assert.equal(h.state.busy, false, 'A failed refresh must not leave the spinner running.');
    assert.equal(h.state.notice.heading, 'Could not refresh');
});

test('hidden-panel drain and error messages do not replace the launcher action label', () => {
    const { view, launcher } = fixture();
    view.report('Finishing preview before continuing…');
    assert.equal(launcher.title, 'Live preview');
    view.report('Reload the editor', 'error', { reason: 'reload', canRetry: false });
    assert.equal(launcher.title, 'Live preview');
});

const layout = (overrides = {}) => ({
    bounds: { x: 150, y: 180, width: 560, height: 420 }, dock: null, expanded: false, ...overrides,
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const inside = (h) => {
    const { left, top, width, height } = h.rect();
    assert.ok(left >= 0 && top >= 0 && width > 0 && height > 0);
    assert.ok(left + width <= h.window.innerWidth && top + height <= h.window.innerHeight);
};

test('compact geometry is restored without writing preferences on load', () => {
    const h = fixture(true, { layout: layout() });
    assert.deepEqual(h.rect(), { left: 150, top: 180, width: 560, height: 420 });
    assert.equal(h.state.dock, null);
    assert.equal(h.writes.length, 0);
});

test('remembering size and position defaults to on with a small compact bottom-right panel', () => {
    const h = fixture(true);
    assert.equal(h.state.rememberPosition, true);
    assert.equal(h.state.size, 'small');
    assert.equal(h.state.dock, 'right');
    assert.equal(h.state.mode, 'expand');
    assert.equal(h.writes.length, 0);
});

for (const position of ['left', 'center', 'right']) {
    test(`${position} preset persists while remembering is off, without persisting manual layout changes`, () => {
        const h = fixture(true, { rememberPosition: false });
        h.actions.dock(position);
        assert.equal(h.preferences.get('position'), position);
        h.actions.size('large');
        h.node('aflpp-panel .aflpp-resize').fire('keydown', { key: 'ArrowUp' });
        const move = h.node('aflpp-panel .aflpp-move-control');
        move.fire('keydown', { key: position === 'left' ? 'ArrowRight' : 'ArrowLeft' });
        move.fire('pointerdown');
        move.fire('pointermove', { clientY: 80 });
        move.fire('pointerup');
        assert.equal(h.state.dock, null);
        assert.equal(h.preferences.get('position'), position, 'Dragging must not erase the preferred preset.');
        h.actions.mode();
        const current = h.rect();
        h.actions.close();
        h.launcher.fire('click', { detail: 0 });
        assert.deepEqual(h.rect(), current, 'Closing and reopening without navigation keeps the current layout.');
        assert.equal(h.state.mode, 'compact');
        assert.equal(h.writes.some(({ key }) => key === 'layout'), false);

        const reopened = fixture(true, { preferences: h.preferences, width: 1000, height: 800 });
        assert.equal(reopened.state.rememberPosition, false);
        assert.equal(reopened.state.dock, position);
        assert.equal(reopened.state.mode, 'expand');
        assert.equal(reopened.state.size, 'small');
        assert.deepEqual(reopened.rect(), {
            left: position === 'left' ? 20 : position === 'center' ? 260 : 500,
            top: 440, width: 480, height: 340,
        });
        assert.equal(reopened.writes.length, 0);
    });

    for (const custom of [false, true]) {
        test(`${position} preset is inherited from an older ${custom ? 'dragged' : 'docked'} layout when remembering is disabled`, () => {
            const h = fixture(true, { layout: layout({ dock: custom ? null : position, anchor: position, expanded: true }) });
            const before = h.rect();
            h.actions.rememberPosition();
            assert.deepEqual(h.rect(), before, 'Disabling must not move, resize or collapse the current panel.');
            assert.equal(h.state.mode, 'compact');
            assert.equal(h.state.rememberPosition, false);
            assert.equal(h.preferences.get('layout'), undefined);
            assert.equal(h.preferences.get('position'), position);
            const reopened = fixture(true, { preferences: h.preferences });
            assert.equal(reopened.state.dock, position);
            assert.equal(reopened.state.size, 'small');
            assert.equal(reopened.state.mode, 'expand');
        });
    }
}

test('re-enabling remembers the current layout rather than restoring an older one', () => {
    const h = fixture(true, { rememberPosition: false, position: 'left', layout: layout({ expanded: true }) });
    assert.equal(h.state.dock, 'left', 'Disabled remembering ignores stale saved geometry.');
    assert.equal(h.state.size, 'small');
    assert.equal(h.state.mode, 'expand');
    h.actions.size('large');
    h.node('aflpp-panel .aflpp-move-control').fire('keydown', { key: 'ArrowRight', shiftKey: true });
    const compact = h.rect();
    h.actions.mode();
    const expanded = h.rect();
    h.actions.rememberPosition();
    assert.deepEqual(h.rect(), expanded, 'Re-enabling must not change the current presentation.');
    assert.equal(h.state.rememberPosition, true);
    assert.equal(h.preferences.get('layout').dock, null);
    assert.equal(h.preferences.get('layout').anchor, 'left');
    assert.equal(h.preferences.get('layout').expanded, true);
    const reopened = fixture(true, { preferences: h.preferences });
    assert.equal(reopened.state.mode, 'compact');
    reopened.actions.mode();
    assert.deepEqual(reopened.rect(), compact);
});

test('toggling layout remembering preserves preferred bounds during temporary viewport fitting and other preferences', () => {
    const saved = layout();
    const preferences = new Map([
        ['panelOpen', true], ['rememberVisibility', false], ['viewport', 'mobile'], ['scrollToChanges', false], ['layout', saved],
    ]);
    const h = fixture(true, { preferences, width: 390, height: 400 });
    const fitted = h.rect();
    h.actions.rememberPosition();
    h.actions.rememberPosition();
    assert.deepEqual(h.rect(), fitted);
    assert.deepEqual(plain(h.preferences.get('layout').bounds), saved.bounds, 'Save preferred bounds, not the smaller fitted rectangle.');
    for (const key of ['panelOpen', 'rememberVisibility', 'viewport', 'scrollToChanges']) {
        assert.equal(h.preferences.get(key), preferences.get(key));
        assert.equal(h.writes.some((write) => write.key === key), false);
    }
    h.window.innerWidth = 1440;
    h.window.innerHeight = 1000;
    h.window.fire('resize');
    assert.deepEqual(h.rect(), { left: 150, top: 180, width: 560, height: 420 });
});

test('moving the closed launcher with remembering off keeps its preset for the next load', () => {
    const h = fixture(true, { rememberPosition: false });
    h.actions.dock('center');
    h.actions.close();
    h.launcher.fire('pointerdown');
    h.launcher.fire('pointermove', { clientX: 60, clientY: 80 });
    h.launcher.fire('pointerup');
    assert.equal(h.state.dock, null);
    const moved = h.rect();
    h.launcher.fire('click', { detail: 0 });
    assert.deepEqual(h.rect(), moved);
    assert.equal(h.preferences.get('layout'), undefined);
    const reopened = fixture(true, { preferences: h.preferences });
    assert.equal(reopened.state.dock, 'center');
    assert.equal(reopened.rect().left, 480);
});

for (const rememberPosition of [false, true]) {
    test(`reset saves the default preset without ${rememberPosition ? 'disabling' : 'enabling'} layout remembering`, () => {
        const h = fixture(true, { rememberPosition });
        h.actions.dock('left');
        h.actions.size('large');
        h.actions.mode();
        h.actions.reset();
        assert.deepEqual(h.rect(), { left: 940, top: 640, width: 480, height: 340 });
        assert.equal(h.state.rememberPosition, rememberPosition);
        assert.equal(h.preferences.get('position'), 'right');
        assert.equal(!!h.preferences.get('layout'), rememberPosition);
        const reopened = fixture(true, { preferences: h.preferences });
        assert.deepEqual(reopened.rect(), h.rect());
        assert.equal(reopened.state.rememberPosition, rememberPosition);
    });
}

for (const position of ['invalid', false, [], {}]) {
    test(`invalid position preference falls back safely: ${JSON.stringify(position)}`, () => {
        const h = fixture(true, { rememberPosition: false, position });
        assert.equal(h.state.dock, 'right');
        assert.equal(h.state.size, 'small');
        assert.equal(h.writes.length, 0);
    });
}

test('an invalid saved layout falls back to the preferred static position', () => {
    const h = fixture(true, { position: 'left', layout: layout({ expanded: 'invalid' }) });
    assert.equal(h.state.dock, 'left');
    assert.equal(h.state.size, 'small');
    assert.equal(h.state.mode, 'expand');
    assert.equal(h.writes.length, 0);
});

test('expanded mode survives reload and returns to the saved compact geometry', () => {
    const h = fixture(true, { layout: layout({ expanded: true }) });
    assert.equal(h.state.mode, 'compact');
    inside(h);
    h.actions.mode();
    assert.deepEqual(h.rect(), { left: 150, top: 180, width: 560, height: 420 });
    h.actions.mode();
    const reopened = fixture(true, { layout: h.preferences.get('layout') });
    assert.equal(reopened.state.mode, 'compact');
    reopened.actions.mode();
    assert.deepEqual(reopened.rect(), { left: 150, top: 180, width: 560, height: 420 });
});

for (const dock of ['left', 'center', 'right']) {
    test(`${dock} docking persists, tracks window size and survives expand/compact`, () => {
        const h = fixture(true);
        h.actions.dock(dock);
        assert.equal(h.preferences.get('layout').dock, dock);
        h.actions.mode();
        h.actions.mode();
        assert.equal(h.state.dock, dock);
        h.window.innerWidth = 1000;
        h.window.innerHeight = 800;
        const writes = h.writes.length;
        h.window.fire('resize');
        assert.equal(h.writes.length, writes, 'automatic fitting must not overwrite user choices');
        assert.equal(h.rect().left, dock === 'left' ? 20 : dock === 'center' ? 260 : 500);
        assert.equal(h.rect().top, 440);
        inside(h);
        const reopened = fixture(true, { preferences: h.preferences, width: 1000, height: 800 });
        assert.equal(reopened.state.dock, dock);
        assert.deepEqual(reopened.rect(), h.rect(), 'Restore responsive docking, not coordinates from the previous window.');
        assert.equal(reopened.writes.length, 0);
    });
}

test('keyboard moving becomes a remembered custom position, while resizing preserves docking', () => {
    const h = fixture(true);
    h.node('aflpp-panel .aflpp-resize').fire('keydown', { key: 'ArrowRight' });
    assert.equal(h.state.dock, 'right');
    assert.equal(h.rect().width, 470);
    assert.equal(h.rect().left + h.rect().width, 1420);
    h.node('aflpp-panel .aflpp-move-control').fire('keydown', { key: 'ArrowLeft' });
    assert.equal(h.state.dock, null);
    const reopened = fixture(true, { layout: h.preferences.get('layout') });
    assert.deepEqual(reopened.rect(), h.rect());
    assert.equal(reopened.state.dock, null);
});

test('pointer movement saves once on release, not during movement or a plain title click', () => {
    const h = fixture(true);
    const move = h.node('aflpp-panel .aflpp-move-control');
    move.fire('pointerdown');
    move.fire('pointerup');
    assert.equal(h.writes.length, 0);
    assert.equal(h.state.dock, 'right');
    move.fire('pointerdown');
    move.fire('pointermove', { clientX: 70, clientY: 80 });
    assert.equal(h.writes.length, 0);
    move.fire('pointerup');
    assert.equal(h.writes.length, 1);
    assert.equal(h.state.dock, null);
    assert.deepEqual(plain(h.preferences.get('layout').bounds), {
        x: h.rect().left, y: h.rect().top, width: h.rect().width, height: h.rect().height,
    });
});

for (const [edge, dx, dy, expected] of [
    ['n', 0, -20, { x: 150, y: 160, width: 560, height: 440 }],
    ['ne', 20, -20, { x: 150, y: 160, width: 580, height: 440 }],
    ['e', 20, 0, { x: 150, y: 180, width: 580, height: 420 }],
    ['se', 20, 20, { x: 150, y: 180, width: 580, height: 440 }],
    ['s', 0, 20, { x: 150, y: 180, width: 560, height: 440 }],
    ['sw', -20, 20, { x: 130, y: 180, width: 580, height: 440 }],
    ['w', -20, 0, { x: 130, y: 180, width: 580, height: 420 }],
    ['nw', -20, -20, { x: 130, y: 160, width: 580, height: 440 }],
]) test(`${edge} free border follows pointer input without changing untouched axes`, () => {
    const h = fixture(true, { layout: layout({ anchor: 'right' }) });
    const handle = h.node(`aflpp-panel .aflpp-edge-${edge}`);
    assert.equal(handle.hidden, false);
    assert.equal(getEventListeners(handle, 'keydown').length, 0);
    handle.fire('pointerdown');
    handle.fire('pointermove', { clientX: 100 + dx, clientY: 100 + dy });
    handle.fire('pointerup');
    assert.deepEqual(plain(h.preferences.get('layout').bounds), expected);
    assert.equal(h.state.dock, null);
});

for (const [dock, usable] of [[null, ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']], ['left', ['n', 'ne', 'e']], ['center', ['n', 'ne', 'e', 'w', 'nw']], ['right', ['n', 'w', 'nw']]]) {
    test(`${dock || 'free'} layout exposes only pointer edges that can move with its anchor`, () => {
        const h = fixture(true, { layout: layout({ dock }) });
        for (const edge of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
            assert.equal(h.node(`aflpp-panel .aflpp-edge-${edge}`).hidden, !usable.includes(edge));
        }
        h.actions.mode();
        for (const edge of usable) assert.equal(h.node(`aflpp-panel .aflpp-edge-${edge}`).hidden, true);
        assert.equal(h.state.movable, false);
    });
}

test('no-frame and retained-frame recovery use native UI models without weakening retry or handover guards', () => {
    const h = fixture(true);
    assert.equal(h.state.empty.busy, true);
    h.view.report('Failed', 'error', { canRetry: true });
    assert.equal(h.state.empty.retry, true);
    assert.equal(h.state.empty.close, false);
    h.actions.retry();
    assert.deepEqual(h.retryCalls, [false]);
    h.view.report('Waiting', 'handover', { canTakeOver: true });
    assert.equal(h.state.empty.busy, true);
    assert.equal(h.state.empty.disabled, true);
    h.actions.retry();
    assert.deepEqual(h.retryCalls, [false]);
    h.view.report('Other tab', 'conflict', { canTakeOver: true });
    h.actions.retry();
    assert.deepEqual(h.retryCalls, [false, true]);
    h.view.report('Expired', 'error', { hasPreview: true, canRetry: false, reason: 'reload' });
    assert.equal(h.state.empty, null);
    assert.equal(h.state.notice.status, 'error');
    assert.equal(h.state.notice.dismissible, false);
    assert.equal(h.state.notice.retry, false);
    assert.equal(h.state.notice.close, false);
    h.actions.retry();
    assert.deepEqual(h.retryCalls, [false, true]);
    h.actions.dismissNotice();
    assert.equal(h.state.notice.status, 'error', 'A window-notice callback cannot dismiss an unresolved preview problem.');
    h.view.report('Write failed', 'error', { hasPreview: true, canRetry: true });
    assert.equal(h.state.notice.status, 'warning');
    assert.equal(h.state.notice.retry, true);
    assert.equal(h.state.notice.dismissible, false);
    h.view.report('Refreshing');
    assert.equal(h.state.notice, null);
});

for (const hasPreview of [false, true]) {
    test(`paused editor capture visibly explains how to resume with a ${hasPreview ? 'retained frame' : 'placeholder'}`, () => {
        const h = fixture(true);
        const message = 'Return to editing this post to resume its live preview.';
        h.view.report(message, 'paused', { hasPreview, canRetry: false });
        assert.equal(h.state.busy, false);
        assert.equal(h.state.canRefresh, false);
        const content = hasPreview ? h.state.notice : h.state.empty;
        assert.equal(content.heading, 'pausedTitle');
        assert.equal(content.description, message);
        assert.equal(content.retry, false);
        if (hasPreview) {
            assert.equal(h.state.empty, null);
            assert.equal(h.state.notice.status, 'info');
            assert.equal(h.state.notice.dismissible, false);
            assert.equal(h.node('aflpp-panel .aflpp-feedback').hidden, false);
        } else {
            assert.equal(h.state.empty.busy, false);
            assert.equal(h.state.empty.icon, 'info');
        }
        h.view.report('Refreshed', 'ready', { hasPreview: true, canRefresh: true });
        assert.equal(h.state.notice, null);
        assert.equal(h.state.canRefresh, true);
    });
}

// Exercise complete messages, not just individual strings: server errors must not repeat the reload warning.
const reloadDetails = [panelStrings.nativePreviewAcf, panelStrings.nativePreviewFailed, blockEditorStrings.nativeSaveFailed];
for (const path of ['classes/Preview/LivePreview.php', 'classes/Compatibility/Acf.php']) {
    const php = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    for (const [, code, message] of php.matchAll(/new WP_Error\(\s*'(aflpp_[^']+)',\s*__\(\s*'([^']+)'/g)) {
        if (['aflpp_invalid_nonce', 'aflpp_preview_conflict', 'aflpp_source_changed', 'aflpp_acf_unavailable'].includes(code)) {
            reloadDetails.push(message);
        }
    }
}
assert.equal(reloadDetails.length, 7, 'Cover every plugin-owned error that requires reloading.');
for (const hasPreview of [false, true]) {
    test(`reload errors explain how to keep changes once with ${hasPreview ? 'a retained preview' : 'no preview'}`, () => {
        const h = fixture(true, { labels: panelStrings });
        for (const message of reloadDetails) {
            assert.equal(typeof message, 'string');
            h.view.report(message, 'error', { hasPreview, reason: 'reload', canRetry: false });
            const content = hasPreview ? h.state.notice : h.state.empty;
            const text = `${content.heading} ${content.description}`;
            assert.ok(text.includes(message));
            assert.equal((text.match(/Copy any changes you want to keep/g) || []).length, 1);
            assert.equal((text.match(/reload the editor/gi) || []).length, 1);
            assert.match(text, /Copy any changes you want to keep\. Then reload the editor before saving again\./);
            assert.equal(content.retry, false);
            assert.equal(content.close, !hasPreview, 'Keep the existing close action for errors without a preview.');
        }
    });
}

test('uncertain saves do not claim failure or success, and ACF recovery identifies what WordPress already saved', () => {
    assert.equal(blockEditorStrings.nativeSaveFailed, 'We couldn’t check whether WordPress saved your latest changes.');
    assert.equal(panelStrings.nativePreviewAcf, 'WordPress Preview saved changes in your repeating fields to the post.');
    assert.doesNotMatch(panelStrings.nativePreviewAcf, /all changes|all edits|reload/i);
});

test('revision help explains read-only previews without live-editor browser requirements', () => {
    const h = fixture(true, { labels: revisionStrings });
    assert.equal(h.state.empty.description, 'Showing this saved version won’t change your post.');
    h.view.report(revisionStrings.browser, 'error', { reason: 'browser', canRetry: false });
    assert.equal(h.state.empty.description, 'Ask your site admin to make WordPress and the preview use the same website address.');
    assert.doesNotMatch(h.state.empty.description, /Web Locks|secure|same-origin/i);
    h.view.report(revisionStrings.unavailable, 'error', { reason: 'unavailable', canRetry: false });
    assert.match(h.state.empty.description, /Choose another version, or reload this page/);
});

test('update failures explain a retained preview without claiming the post was saved', () => {
    const h = fixture(true, { labels: panelStrings });
    h.view.report(panelStrings.failed, 'error', { hasPreview: true });
    assert.equal(h.state.notice.heading, 'Couldn’t update preview');
    assert.equal(h.state.notice.description, 'Showing the last preview.');
    assert.equal(h.state.notice.retry, true);
    assert.equal(h.state.notice.action, 'Try again');
});

test('ordinary updates and native saving never replace a retained frame with a placeholder or success notice', () => {
    const h = fixture(true);
    for (const [text, state] of [['updating', 'loading'], ['saving', 'loading'], ['stale', 'stale'], ['current', 'ready']]) {
        h.view.report(text, state, { hasPreview: true });
        assert.equal(h.state.empty, null);
        assert.equal(h.state.notice, null);
    }
});

for (const expanded of [false, true]) {
    for (const [width, height] of [[390, 600], [240, 150], [20, 30]]) {
        test(`saved ${expanded ? 'expanded' : 'compact'} layouts stay inside a ${width}×${height} window`, () => {
            const h = fixture(true, { width, height, layout: layout({
                bounds: { x: 5000, y: -400, width: 1800, height: 1200 }, expanded,
            }) });
            inside(h);
            assert.equal(h.writes.length, 0);
        });
    }
}

for (const invalid of [
    { ...layout(), bounds: { x: '100', y: 100, width: 500, height: 300 } },
    { ...layout(), bounds: { x: NaN, y: 100, width: 500, height: 300 } },
    { ...layout(), bounds: { x: 100, y: 100, width: -5, height: 300 } },
    layout({ dock: 'invalid' }), layout({ expanded: 'yes' }), layout({ anchor: 'invalid' }), [], 'invalid',
]) {
    test(`invalid saved layout falls back safely: ${JSON.stringify(invalid)}`, () => {
        const h = fixture(true, { layout: invalid });
        assert.equal(h.state.dock, 'right');
        assert.equal(h.state.mode, 'expand');
        assert.deepEqual(h.rect(), { left: 940, top: 640, width: 480, height: 340 });
    });
}

test('temporary viewport fitting does not lose the preferred custom size or position', () => {
    const h = fixture(true, { layout: layout() });
    h.window.innerWidth = 390;
    h.window.innerHeight = 400;
    h.window.fire('resize');
    inside(h);
    h.window.innerWidth = 1440;
    h.window.innerHeight = 1000;
    h.window.fire('resize');
    assert.deepEqual(h.rect(), { left: 150, top: 180, width: 560, height: 420 });
    assert.equal(h.writes.length, 0);
});

test('reset restores compact default size and bottom-right position', () => {
    const h = fixture(true, { layout: layout({ expanded: true }) });
    h.actions.reset();
    assert.deepEqual(h.rect(), { left: 940, top: 640, width: 480, height: 340 });
    assert.equal(h.state.mode, 'expand');
    assert.equal(h.preferences.get('layout').dock, 'right');
});

for (const dock of ['left', 'center', 'right']) {
    test(`${dock} launcher shares the compact panel anchor after closing and moving away from its dock`, () => {
        const h = fixture(true);
        h.actions.dock(dock);
        h.actions.close();
        const factor = dock === 'left' ? 0 : dock === 'center' ? 0.5 : 1;
        const before = h.rect();
        assert.equal(parseFloat(h.launcherContainer.style.left), before.left + before.width * factor);
        assert.equal(parseFloat(h.launcherContainer.style.top), before.top + before.height);
        assert.equal(h.launcherContainer.style.transform, `translate(${-100 * factor}%, -100%)`);
        const dx = dock === 'left' ? 60 : -60;
        h.launcher.fire('pointerdown');
        h.launcher.fire('pointermove', { clientX: 100 + dx, clientY: 60 });
        h.launcher.fire('pointerup');
        const moved = h.rect();
        assert.equal(moved.left, before.left + dx);
        assert.equal(moved.top, before.top - 40);
        assert.equal(h.state.dock, null);
        assert.equal(h.preferences.get('layout').anchor, dock);
        assert.deepEqual([moved.width, moved.height], [before.width, before.height]);
        const reopened = fixture(false, { layout: h.preferences.get('layout') });
        assert.equal(reopened.launcherContainer.style.left, h.launcherContainer.style.left);
        assert.equal(reopened.launcherContainer.style.transform, h.launcherContainer.style.transform);
    });

    test(`${dock} resize grip follows the pointer while preserving the bottom anchor and docking`, () => {
        const h = fixture(true);
        h.actions.dock(dock);
        const before = h.rect();
        const grip = h.node('aflpp-panel .aflpp-resize');
        const dx = dock === 'left' ? 50 : -50;
        grip.fire('pointerdown');
        grip.fire('pointermove', { clientX: 100 + dx, clientY: 40 });
        grip.fire('pointerup');
        const after = h.rect();
        assert.equal(after.width, before.width + (dock === 'center' ? 100 : 50));
        assert.equal(after.height, before.height + 60);
        assert.equal(after.top, before.top - 60);
        assert.equal(after.top + after.height, before.top + before.height);
        assert.equal(dock === 'left' ? after.left + after.width : after.left,
            (dock === 'left' ? before.left + before.width : before.left) + dx);
        assert.equal(h.state.dock, dock);
    });
}

test('launcher dragging suppresses only its generated pointer click, not later keyboard activation', () => {
    const h = fixture(false);
    h.launcher.fire('pointerdown');
    h.launcher.fire('pointermove', { clientX: 50, clientY: 70 });
    h.launcher.fire('pointerup');
    assert.equal(h.launcher.fire('click', { detail: 1 }).defaultPrevented, true);
    assert.equal(h.view.visible, false);
    h.launcher.fire('click', { detail: 0 });
    assert.equal(h.view.visible, true);
    assert.equal(h.focusCalls.at(-1), 'actions');
});

test('a launcher click or sub-threshold movement opens normally without changing the layout', () => {
    const h = fixture(false);
    h.launcher.fire('pointerdown');
    h.launcher.fire('pointermove', { clientX: 101, clientY: 101 });
    h.launcher.fire('pointerup');
    h.launcher.fire('click', { detail: 1 });
    assert.equal(h.view.visible, true);
    assert.equal(h.preferences.get('layout'), undefined);
    assert.equal(h.state.dock, 'right');
    assert.deepEqual(h.focusCalls, [], 'Pointer opening must not force a focus ring onto Preview actions.');
});

test('the closed launcher can move an expanded panel without overwriting compact size or expanded mode', () => {
    const h = fixture(false, { layout: layout({ expanded: true }) });
    h.launcher.fire('keydown', { key: 'ArrowLeft', shiftKey: true });
    const saved = h.preferences.get('layout');
    assert.equal(saved.bounds.x, 110);
    assert.equal(saved.bounds.width, 560);
    assert.equal(saved.bounds.height, 420);
    assert.equal(saved.expanded, true);
});

test('moving in a small viewport never replaces the preferred size with the temporary fitted size', () => {
    const h = fixture(false, { layout: layout(), width: 390, height: 400 });
    h.launcher.fire('keydown', { key: 'ArrowLeft' });
    assert.equal(h.preferences.get('layout').bounds.width, 560);
    assert.equal(h.preferences.get('layout').bounds.height, 420);
    h.view.setVisible(true);
    h.node('aflpp-panel .aflpp-move-control').fire('keydown', { key: 'ArrowUp' });
    assert.equal(h.preferences.get('layout').bounds.width, 560);
    assert.equal(h.preferences.get('layout').bounds.height, 420);
});

for (const anchor of ['left', 'center', 'right']) {
    test(`${anchor} vertical resizing preserves the preferred horizontal geometry in a narrow viewport`, () => {
        const saved = layout({ anchor });
        const h = fixture(true, { layout: saved, width: 390, height: 800 });
        h.node('aflpp-panel .aflpp-resize').fire('keydown', { key: 'ArrowUp' });
        const { bounds } = h.preferences.get('layout');
        assert.equal(bounds.x, saved.bounds.x);
        assert.equal(bounds.width, saved.bounds.width);
        assert.equal(bounds.height, saved.bounds.height + 10);
        h.window.innerWidth = 1440;
        h.window.fire('resize');
        assert.equal(h.rect().left, saved.bounds.x);
    });

    test(`${anchor} horizontal resizing preserves the preferred vertical geometry in a short viewport`, () => {
        const saved = layout({ anchor });
        const h = fixture(true, { layout: saved, height: 400 });
        h.node('aflpp-panel .aflpp-resize').fire('keydown', { key: anchor === 'left' ? 'ArrowRight' : 'ArrowLeft' });
        const { bounds } = h.preferences.get('layout');
        assert.equal(bounds.y, saved.bounds.y);
        assert.equal(bounds.height, saved.bounds.height);
        assert.equal(bounds.width, saved.bounds.width + (anchor === 'center' ? 20 : 10));
        h.window.innerHeight = 1000;
        h.window.fire('resize');
        assert.equal(h.rect().top, saved.bounds.y);
    });

    test(`${anchor} returning a fitted resize to its origin restores all preferred bounds`, () => {
        const saved = layout({ anchor });
        const h = fixture(true, { layout: saved, width: 390, height: 400 });
        const before = h.rect();
        const grip = h.node('aflpp-panel .aflpp-resize');
        grip.fire('pointerdown');
        grip.fire('pointermove', { clientX: 120, clientY: 120 });
        grip.fire('pointermove', { clientX: 100, clientY: 100 });
        grip.fire('pointerup');
        assert.deepEqual(h.rect(), before);
        assert.deepEqual(plain(h.preferences.get('layout').bounds), saved.bounds);
        const reopened = fixture(true, { layout: h.preferences.get('layout') });
        assert.deepEqual(reopened.rect(), { left: 150, top: 180, width: 560, height: 420 });
    });
}

for (const direction of ['ltr', 'rtl']) for (const anchor of ['left', 'center', 'right']) {
    test(`${direction} ${anchor} anchor retains physical free-corner pointer resizing`, () => {
        const h = fixture(true, { layout: layout({ dock: anchor, anchor }), direction });
        const before = h.rect();
        const grip = h.node(`aflpp-panel .aflpp-edge-${anchor === 'left' ? 'ne' : 'nw'}`);
        const dx = anchor === 'left' ? 30 : -30;
        grip.fire('pointerdown');
        grip.fire('pointermove', { clientX: 100 + dx, clientY: 80 });
        grip.fire('pointerup');
        assert.equal(h.rect().width, before.width + (anchor === 'center' ? 60 : 30));
        assert.equal(h.rect().height, before.height + 20);
        assert.equal(h.rect().top + h.rect().height, before.top + before.height);
    });
}

for (const size of ['small', 'large']) {
    test(`the remembered ${size} preset remains selectable while expanded and restores compact mode`, () => {
        const h = fixture(true);
        h.actions.size(size);
        assert.equal(h.state.size, size);
        h.actions.mode();
        assert.equal(h.state.size, undefined, 'An expanded panel must not mark a compact preset selected.');
        h.actions.size(size);
        assert.equal(h.state.size, size);
        assert.equal(h.state.mode, 'expand');
    });
}

for (const event of ['pointercancel', 'lostpointercapture', 'blur']) {
    test(`${event} ends launcher dragging and saves its completed movement only once`, () => {
        const h = fixture(false);
        h.launcher.fire('pointerdown');
        h.launcher.fire('pointermove', { clientX: 60, clientY: 70 });
        (event === 'blur' ? h.window : h.launcher).fire(event);
        h.launcher.fire('pointerup');
        assert.equal(h.writes.length, 1);
        assert.equal(h.launcher.hasPointerCapture(1), false);
        assert.equal(h.document.documentElement.classList.contains('aflpp-window-dragging'), false);
        assert.equal(h.panel.classList.contains('aflpp-dragging'), false);
    });
}

test('returning a resize drag to its origin restores both original preferred dimensions', () => {
    const h = fixture(true);
    const before = h.rect();
    const grip = h.node('aflpp-panel .aflpp-resize');
    grip.fire('pointerdown');
    grip.fire('pointermove', { clientX: 30, clientY: 20 });
    grip.fire('pointermove', { clientX: 100, clientY: 100 });
    grip.fire('pointerup');
    assert.deepEqual(h.rect(), before);
});

test('size presets preserve docking and preferred dimensions on small viewports and exit expanded mode', () => {
    const h = fixture(true, { width: 390, height: 400 });
    h.actions.dock('left');
    h.actions.mode();
    h.actions.size('large');
    assert.equal(h.state.mode, 'expand');
    assert.equal(h.state.dock, 'left');
    assert.equal(h.state.size, 'large');
    assert.equal(h.preferences.get('layout').bounds.width, 640);
    assert.equal(h.preferences.get('layout').bounds.height, 440);
    inside(h);
    const writes = h.writes.length;
    h.actions.size('__proto__');
    assert.equal(h.writes.length, writes);
    h.actions.size('small');
    assert.equal(h.state.size, 'small');
    assert.equal(h.preferences.get('layout').bounds.width, 480);
    assert.equal(h.preferences.get('layout').bounds.height, 340);
});

test('keyboard opening focuses actions and closing focuses the launcher, without automatic focus on load or visibility changes', () => {
    const h = fixture(false);
    assert.deepEqual(h.focusCalls, []);
    h.view.setVisible(true);
    h.view.setVisible(false);
    assert.deepEqual(h.focusCalls, []);
    h.launcher.fire('click', { detail: 0 });
    assert.deepEqual(h.focusCalls, ['actions']);
    h.actions.close();
    assert.equal(h.document.activeElement, h.launcher);
    assert.equal(h.view.visible, false);
});

test('the single resize grip hides in expanded, fullscreen and PiP modes', async () => {
    const h = fixture(true, { pip: true });
    const grip = h.node('aflpp-panel .aflpp-resize');
    assert.equal(grip.hidden, false);
    h.actions.mode();
    assert.equal(grip.hidden, true);
    h.actions.mode();
    h.document.fullscreenElement = h.panel;
    h.document.fire('fullscreenchange');
    assert.equal(grip.hidden, true);
    h.document.fullscreenElement = null;
    h.document.fire('fullscreenchange');
    await h.actions.popOut();
    assert.equal(grip.hidden, true);
    h.detached.close();
    assert.equal(grip.hidden, false);
});

for (const direction of ['ltr', 'rtl']) for (const gutter of [12, 20, 28]) {
    test(`${direction} docking matches the editor's ${gutter}px gutter, excluding the scrollbar`, () => {
        const h = fixture(false, { direction, gutter, scrollbar: 15 });
        const width = h.document.documentElement.clientWidth;
        assert.equal(parseFloat(h.launcherContainer.style.left), width - gutter);
        assert.equal(parseFloat(h.launcherContainer.style.top), h.window.innerHeight - gutter);
        h.view.setVisible(true);
        assert.equal(h.rect().left + h.rect().width, width - gutter);
        assert.equal(h.rect().top + h.rect().height, h.window.innerHeight - gutter);
        h.actions.dock('left');
        assert.equal(h.rect().left, gutter);
        h.actions.mode();
        assert.equal(h.rect().top, 32 + gutter);
        assert.equal(h.rect().left, gutter);
        inside(h);
    });
}

for (const anchor of ['left', 'center', 'right']) for (const keyboard of [false, true]) {
    test(`${anchor} launcher reaches the top-left independently of its panel using ${keyboard ? 'keys' : 'dragging'}`, () => {
        const h = fixture(false, { layout: layout({ dock: anchor, anchor }) });
        if (keyboard) {
            for (let i = 0; i < 40; i++) {
                h.launcher.fire('keydown', { key: 'ArrowLeft', shiftKey: true });
                h.launcher.fire('keydown', { key: 'ArrowUp', shiftKey: true });
            }
        } else {
            h.launcher.fire('pointerdown');
            h.launcher.fire('pointermove', { clientX: -2000, clientY: -2000 });
            h.launcher.fire('pointerup');
        }
        const factor = anchor === 'left' ? 0 : anchor === 'center' ? 0.5 : 1;
        assert.equal(parseFloat(h.launcherContainer.style.left), h.launcherContainer.offsetWidth * factor);
        assert.equal(parseFloat(h.launcherContainer.style.top), 32 + h.launcherContainer.offsetHeight);
        const saved = h.preferences.get('layout');
        assert.equal(saved.bounds.width, 560);
        assert.equal(saved.bounds.height, 420);
        assert.equal(saved.dock, null);
        h.launcher.fire('click', { detail: 0 });
        assert.equal(h.rect().left, 0);
        assert.equal(h.rect().top, 32);
        inside(h);
        h.actions.close();
        assert.equal(parseFloat(h.launcherContainer.style.left), h.launcherContainer.offsetWidth * factor);
        assert.equal(parseFloat(h.launcherContainer.style.top), 32 + h.launcherContainer.offsetHeight);
        const reopened = fixture(false, { layout: saved });
        assert.equal(reopened.launcherContainer.style.left, h.launcherContainer.style.left);
        assert.equal(reopened.launcherContainer.style.top, h.launcherContainer.style.top);
    });
}

for (const launcher of [false, true]) {
    test(`the ${launcher ? 'launcher' : 'panel'} can use the full layout viewport below the actual admin bar`, () => {
        const h = fixture(!launcher, { toolbarHeight: 46, scrollbar: 15 });
        const control = launcher ? h.launcher : h.node('aflpp-panel .aflpp-move-control');
        control.fire('pointerdown');
        control.fire('pointermove', { clientX: -2000, clientY: -2000 });
        control.fire('pointerup');
        assert.equal(launcher ? parseFloat(h.launcherContainer.style.left) - h.launcherContainer.offsetWidth : h.rect().left, 0);
        assert.equal(launcher ? parseFloat(h.launcherContainer.style.top) - h.launcherContainer.offsetHeight : h.rect().top, 46);
        control.fire('pointerdown');
        control.fire('pointermove', { clientX: 3000, clientY: 3000 });
        control.fire('pointerup');
        assert.equal(launcher ? parseFloat(h.launcherContainer.style.left) : h.rect().left + h.rect().width, 1425);
        assert.equal(launcher ? parseFloat(h.launcherContainer.style.top) : h.rect().top + h.rect().height, 1000);
    });
}

test('scrolling the mobile admin bar into view temporarily fits a free launcher without rewriting its corner', () => {
    const h = fixture(false, { toolbarHeight: 0 });
    h.launcher.fire('pointerdown');
    h.launcher.fire('pointermove', { clientX: -2000, clientY: -2000 });
    h.launcher.fire('pointerup');
    const writes = h.writes.length;
    h.node('wpadminbar').getBoundingClientRect = () => ({ bottom: 46 });
    h.window.fire('scroll');
    assert.equal(parseFloat(h.launcherContainer.style.top), 46 + h.launcherContainer.offsetHeight);
    h.node('wpadminbar').getBoundingClientRect = () => ({ bottom: -200 });
    h.window.fire('scroll');
    assert.equal(parseFloat(h.launcherContainer.style.top), h.launcherContainer.offsetHeight);
    assert.equal(h.writes.length, writes);
});

test('fullscreen state is not stored or restored as expanded mode', () => {
    const h = fixture(true, { layout: layout() });
    h.document.fullscreenElement = h.panel;
    h.document.fire('fullscreenchange');
    assert.equal(h.state.inPage, false);
    assert.equal(h.state.mode, 'compact');
    assert.equal(h.writes.length, 0);
    const reopened = fixture(true, { layout: h.preferences.get('layout') });
    assert.equal(reopened.state.mode, 'expand');
    assert.equal(reopened.state.inPage, true);
});
