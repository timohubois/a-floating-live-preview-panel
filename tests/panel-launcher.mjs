import assert from 'node:assert/strict';
import { sourceForVm } from './helpers/modules.mjs';
import test from 'node:test';
import vm from 'node:vm';

const source = await sourceForVm(new URL('../assets/preview-panel/index.js', import.meta.url));

// Exercise the view's lifecycle and launcher label without starting requests or changing native controls.
function fixture(open = false, {
    layout, width = 1440, height = 1000, direction = 'ltr', nativeSaving = false, pip = false, pipApi, videoPip = false, stylesheets = [],
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
            const event = {
                button: 0, pointerId: 1, clientX: 100, clientY: 100,
                preventDefault() { this.defaultPrevented = true; }, ...properties,
            };
            for (const callback of this.listeners.get(type) || []) callback(event);
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
        getComputedStyle: () => ({ direction, cursor: 'ew-resize', getPropertyValue: () => '' }),
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
    const focusCalls = [];
    const retryCalls = [];
    const controls = { closeMenu() {}, focus(action) { focusCalls.push(action); }, beforeMove() {}, remount() {}, update(next) { state = next; } };
    const createControls = (panel, labels, callbacks) => { actions = callbacks; return controls; };
    const imports = {
        '@wordpress/data': window.wp.data,
        '@wordpress/preferences': { store: { name: 'core/preferences' } },
    };
    delete window.wp;
    const createPreviewPanel = vm.runInNewContext(`${source}\ncreatePreviewPanel`, { window, document, imports });
    const view = createPreviewPanel(strings, {
        nativeSaving, beforeMove() {}, afterMove() {},
        onOpen() { view.setVisible(true); }, onClose() { view.setVisible(false); }, onRetry(takeOver) { retryCalls.push(takeOver); },
    }, () => ({
        device: 'desktop', layout() {}, beforeMove() {}, afterMove() {},
    }), createControls);
    const panel = node('aflpp-panel');
    return {
        view, launcher, panel, node, actions, window, document, preferences, writes, detached, copiedStyles,
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

test('pending, loading, ready and problem states keep refresh activity and accessible status in sync', () => {
    const h = fixture(true);
    const status = h.node('aflpp-panel [role="status"]');
    h.view.report('Loading preview…', 'loading', { hasPreview: false });
    assert.equal(status.textContent, 'Loading preview…');
    h.view.report('Changes pending…', 'stale', { hasPreview: true });
    assert.equal(status.textContent, 'Changes pending…');
    assert.equal(h.state.busy, true, 'Show activity while changes wait for the debounced refresh.');
    assert.equal(h.state.canRefresh, false);
    assert.equal(h.state.empty, null, 'Keep the previous frame visible.');
    assert.equal(h.state.notice, null);
    h.view.report('Updating preview…', 'loading', { hasPreview: true });
    assert.equal(status.textContent, 'Updating preview…');
    assert.equal(h.state.busy, true);
    h.view.report('Preview refreshed', 'ready', { hasPreview: true, canRefresh: true });
    assert.equal(status.textContent, 'Preview refreshed');
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
    h.node('aflpp-panel .aflpp-resize').fire('keydown', { key: 'ArrowRight' });
    assert.equal(h.state.dock, 'right');
    assert.equal(h.rect().width, 470);
    assert.equal(h.rect().left + h.rect().width, 1424);
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
    assert.equal(handle.listeners.has('keydown'), false);
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

for (const dock of ['left', 'center', 'right']) {
    test(`${dock} launcher shares the compact panel anchor after closing and moving away from its dock`, () => {
        const h = fixture(true);
        h.actions.dock(dock);
        h.actions.close();
        const factor = dock === 'left' ? 0 : dock === 'center' ? 0.5 : 1;
        const before = h.rect();
        assert.equal(parseFloat(h.launcher.style.left), before.left + before.width * factor);
        assert.equal(parseFloat(h.launcher.style.top), before.top + before.height);
        assert.equal(h.launcher.style.transform, `translate(${-100 * factor}%, -100%)`);
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
        assert.equal(reopened.launcher.style.left, h.launcher.style.left);
        assert.equal(reopened.launcher.style.transform, h.launcher.style.transform);
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

test('explicit opening focuses actions and closing focuses the launcher, without automatic focus on load or visibility changes', () => {
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
