import assert from 'node:assert/strict';
import { sourceForVm } from './helpers/modules.mjs';
import test from 'node:test';
import vm from 'node:vm';

const source = await sourceForVm(new URL('../assets/preview-panel/index.js', import.meta.url));

// Exercise the view's lifecycle and launcher label without starting requests or changing native controls.
function fixture(open = false, {
    layout, width = 1440, height = 1000, nativeSaving = false, pip = false, pipApi, videoPip = false, stylesheets = [],
} = {}) {
    const nodes = new Map();
    const preferences = new Map([['panelOpen', open], ['layout', layout]]);
    const writes = [];
    const target = (element) => Object.assign(element, {
        listeners: new Map(),
        addEventListener(type, callback) {
            const listeners = this.listeners.get(type) || [];
            listeners.push(callback);
            this.listeners.set(type, listeners);
        },
        fire(type, properties = {}) {
            const event = { button: 0, pointerId: 1, clientX: 100, clientY: 100, preventDefault() {}, ...properties };
            for (const callback of this.listeners.get(type) || []) callback(event);
        },
    });
    const document = target({ pictureInPictureEnabled: videoPip, getElementById: (id) => node(id) });
    function node(key) {
        if (nodes.has(key)) return nodes.get(key);
        const captured = new Set();
        const classes = new Set();
        const element = target({
            ownerDocument: document, style: { setProperty() {}, removeProperty() {} }, dataset: {}, textContent: '',
            classList: {
                add: (name) => classes.add(name), remove: (name) => classes.delete(name),
                toggle(name, value) { if (value) classes.add(name); else classes.delete(name); },
                contains: (name) => classes.has(name),
            },
            setAttribute() {}, removeAttribute() {}, replaceChildren() {}, focus() {},
            setPointerCapture: (pointer) => captured.add(pointer),
            hasPointerCapture: (pointer) => captured.has(pointer),
            releasePointerCapture: (pointer) => captured.delete(pointer),
            querySelector: (selector) => node(`${key} ${selector}`),
            querySelectorAll: (selector) => selector === '[data-edge]' ? ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'].map((edge) => {
                const handle = node(`${key} ${edge}`);
                handle.dataset.edge = edge;
                return handle;
            }) : [],
        });
        nodes.set(key, element);
        return element;
    }
    document.documentElement = node('html');
    const styleNodes = stylesheets.map((style) => target({ ...style, cloneNode: () => target({ ...style }) }));
    document.querySelectorAll = (selector) => styleNodes.filter(({ id, href = '', rel }) => selector.split(', ').some((part) =>
        part.startsWith('#') ? id === part.slice(1) : rel === 'stylesheet' && href.includes('/load-styles.php')
    ));
    const copiedStyles = [];
    const detachedDocument = { documentElement: node('pip-html'), head: { append: (style) => copiedStyles.push(style) } };
    detachedDocument.body = { append: (panel) => { panel.ownerDocument = detachedDocument; } };
    document.body = { append: (panel) => { panel.ownerDocument = document; } };
    const detached = target({ document: detachedDocument, close() { this.fire('pagehide'); } });
    const requests = [];
    const launcher = node('aflpp-toggle');
    launcher.title = 'Live preview'; // Server-rendered action label.
    const window = target({
        innerWidth: width, innerHeight: height, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
        getComputedStyle: () => ({ cursor: 'ew-resize', getPropertyValue: () => '' }),
        wp: { data: {
            select: () => ({ get: (scope, key) => preferences.get(key) }),
            dispatch: () => ({ setDefaults() {}, set: (scope, key, value) => {
                preferences.set(key, value);
                writes.push({ key, value });
            } }),
        } },
    });
    if (pip) window.documentPictureInPicture = { requestWindow: async (options) => { requests.push(options); return detached; } };
    if (pipApi !== undefined) window.documentPictureInPicture = pipApi;
    const strings = new Proxy({ title: 'Live preview', preview: 'Preview', loading: 'Loading preview…' }, {
        get: (target, key) => target[key] ?? String(key),
    });
    let actions;
    let state;
    const controls = { closeMenu() {}, focus() {}, beforeMove() {}, remount() {}, update(next) { state = next; } };
    const createControls = (panel, labels, callbacks) => { actions = callbacks; return controls; };
    const imports = {
        '@wordpress/data': window.wp.data,
        '@wordpress/preferences': { store: { name: 'core/preferences' } },
    };
    delete window.wp;
    const createPreviewPanel = vm.runInNewContext(`${source}\ncreatePreviewPanel`, { window, document, imports });
    const view = createPreviewPanel(strings, { nativeSaving, beforeMove() {}, afterMove() {} }, () => ({
        device: 'desktop', layout() {}, beforeMove() {}, afterMove() {},
    }), createControls);
    const panel = node('aflpp-panel');
    return {
        view, launcher, panel, node, actions, window, document, preferences, writes, detached, copiedStyles,
        requests,
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
        const panel = { id: 'a-floating-live-preview-panel-css', rel: 'stylesheet', href: '/assets/preview-panel/style.css' };
        const panelInline = { id: 'a-floating-live-preview-panel-inline-css' };
        const h = fixture(true, { pip: true, stylesheets: [
            core, inline, { id: 'unrelated-css', rel: 'stylesheet', href: '/unrelated.css' }, panel, panelInline,
        ] });
        assert.equal(h.state.canPip, true, 'Document PiP does not require video PiP support');
        await h.actions.popOut();
        assert.deepEqual(h.copiedStyles.map(({ id, href }) => ({ id, href })),
            [core, inline, panel, panelInline].map(({ id, href }) => ({ id, href })));
        assert.ok(h.copiedStyles.every((style) => style.listeners.has('load')));
        assert.equal(h.panel.ownerDocument, h.detached.document);
        assert.equal(h.state.inPip, true);
        h.detached.close();
        assert.equal(h.panel.ownerDocument, h.document);
        assert.equal(h.state.mode, 'expand');
        assert.equal(h.writes.length, 0, 'PiP styling and document moves must not change layout preferences');
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
    assert.equal(h.window.listeners.has('beforeunload'), false);
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

test('a native Save during startup does not override remembered panel visibility', () => {
    assert.equal(fixture(true, { nativeSaving: true }).view.visible, true);
    assert.equal(fixture(false, { nativeSaving: true }).view.visible, false);
});

test('closing a ready panel clears its frame without changing the launcher into a loading indicator', () => {
    const { view, launcher, panel } = fixture(true);
    view.report('Preview refreshed', 'ready', { hasPreview: true });
    view.setVisible(false);
    view.clearPreview();
    assert.equal(panel.hidden, true);
    assert.equal(launcher.hidden, false);
    assert.equal(launcher.title, 'Live preview');
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
        assert.equal(h.rect().left, dock === 'left' ? 16 : dock === 'center' ? 260 : 504);
        assert.equal(h.rect().top, 444);
        inside(h);
    });
}

test('keyboard moving becomes a remembered custom position, while resizing preserves docking', () => {
    const h = fixture(true);
    h.node('aflpp-panel w').fire('keydown', { key: 'ArrowRight' });
    assert.equal(h.state.dock, 'right');
    assert.equal(h.rect().width, 470);
    assert.equal(h.rect().left + h.rect().width, 1424);
    h.node('aflpp-panel .aflpp-move').fire('keydown', { key: 'ArrowLeft' });
    assert.equal(h.state.dock, null);
    const reopened = fixture(true, { layout: h.preferences.get('layout') });
    assert.deepEqual(reopened.rect(), h.rect());
    assert.equal(reopened.state.dock, null);
});

test('pointer movement saves once on release, not during movement or a plain title click', () => {
    const h = fixture(true);
    const move = h.node('aflpp-panel .aflpp-move');
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
    layout({ dock: 'invalid' }), layout({ expanded: 'yes' }), [], 'invalid',
]) {
    test(`invalid saved layout falls back safely: ${JSON.stringify(invalid)}`, () => {
        const h = fixture(true, { layout: invalid });
        assert.equal(h.state.dock, 'right');
        assert.equal(h.state.mode, 'expand');
        assert.deepEqual(h.rect(), { left: 944, top: 644, width: 480, height: 340 });
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
    assert.deepEqual(h.rect(), { left: 944, top: 644, width: 480, height: 340 });
    assert.equal(h.state.mode, 'expand');
    assert.equal(h.preferences.get('layout').dock, 'right');
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
