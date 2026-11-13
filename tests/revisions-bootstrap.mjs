import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { sourceForVm } from './helpers/modules.mjs';

const source = (await sourceForVm(new URL('../assets/revisions-bootstrap.js', import.meta.url)))
    .replaceAll('import(', 'importModule(');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

async function fixture({ available = true, configured = true } = {}) {
    const model = { get() {}, on() {}, off() {} };
    const calls = [], removed = [], notices = [], errors = [];
    const frame = () => {}, scroll = () => {};
    const nodes = new Map(['aflpp-panel', 'aflpp-toggle'].map((id) => [id, { remove: () => removed.push(id) }]));
    const config = { revisionsModule: 'revisions', scrollModule: 'scroll', strings: { bootFailed: 'Unavailable' } };
    let imports = 0;
    vm.runInNewContext(source, {
        window: {
            jQuery: (ready) => ready(),
            aFloatingLivePreviewPanel: configured ? config : null,
            wp: available ? { revisions: { view: { frame: { model } } } } : {},
        },
        document: {
            getElementById: (id) => id === 'wpbody-content' ? { prepend: (node) => notices.push(node) } : nodes.get(id),
            createElement: () => ({ children: [], setAttribute() {}, append(node) { this.children.push(node); } }),
        },
        console: { error: (...args) => errors.push(args) },
        imports: {
            './preview-panel/index.js': { createPreviewPanel() {} },
            './preview-panel/viewport.js': { createPreviewViewport() {} },
            './preview-panel/controls.js': { createPreviewControls() {} },
            './preview-frame.js': { createPreviewFrame: frame },
        },
        importModule: async (name) => {
            imports++;
            return name === 'revisions'
                ? { initRevisionsPreview: (...args) => calls.push(args) }
                : { createPreviewScroll: scroll };
        },
    });
    await flush();
    return { model, config, frame, scroll, calls, removed, notices, errors, imports };
}

test('revision bootstrap uses the existing native model and passes the shared frame implementation', async () => {
    const h = await fixture();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], h.config);
    assert.equal(h.calls[0][1], h.model);
    assert.equal(h.calls[0][3], h.scroll);
    assert.equal(h.calls[0][4], h.frame);
    assert.equal(h.removed.length, 0);
});

test('unsupported core selection APIs fail only the plugin panel, not native comparison or restore', async () => {
    const h = await fixture({ available: false });
    assert.equal(h.calls.length, 0);
    assert.deepEqual(h.removed, ['aflpp-panel', 'aflpp-toggle']);
    assert.equal(h.notices.length, 1);
    assert.equal(h.notices[0].children[0].textContent, 'Unavailable');
    assert.equal(h.errors.length, 1);
});

test('revision bootstrap is inert without screen configuration', async () => {
    const h = await fixture({ configured: false });
    assert.equal(h.imports, 0);
    assert.equal(h.calls.length, 0);
    assert.equal(h.notices.length, 0);
});
