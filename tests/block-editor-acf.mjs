import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { sourceForVm } from './helpers/modules.mjs';

const shared = await sourceForVm(new URL('../src/compatibility/acf.js', import.meta.url));
const source = await sourceForVm(new URL('../src/compatibility/block-editor-acf.js', import.meta.url));

function fixture() {
    let changes = 0, callback, disconnected = 0;
    const actions = new Map(), listeners = new Map(), watched = [], storeValues = new Map();
    const field = { isConnected: true, rows: [{ id: 'old-0' }, { id: 'old-1' }],
        contains(row) { return this.rows.includes(row); }, querySelectorAll() { return this.rows; } };
    const base = { entries: [['_acf_nonce', 'nonce'], ['_wpnonce', 'native-save-nonce']], querySelectorAll: () => [], contains: () => false };
    const normal = { entries: [
        ['acf[field_text]', 'Unsaved'], ['acf[field_empty]', ''],
        ['acf[field_rows][row-0][field_child]', 'Edited first row'],
        ['acf[field_rows][row-0][acf_reordered]', '1'],
        ['_acf_fields[group][]', 'field_text'], ['_acf_fields[group][]', 'field_rows'],
        ['action', 'editpost'], ['unrelated', 'Never forward'], ['acf[file]', new Blob(['not a saved attachment'])],
    ], fields: [field], querySelectorAll() { return this.fields; }, contains: (target) => target.inMetaBox };
    const side = { entries: [['acf[field_side]', 'Side field']], querySelectorAll: () => [], contains: () => false };
    const document = {
        querySelector(selector) {
            if (selector === '.metabox-base-form') return base;
            if (selector.includes('is-normal')) return normal;
            if (selector === '#metaboxes .metabox-location-side') return side;
            return null;
        },
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
    };
    const jq = { on() {}, off() {} };
    const window = {
        jQuery: () => jq,
        acf: {
            addAction: (name, fn) => actions.set(name, fn),
            removeAction: (name, fn) => { if (actions.get(name) === fn) actions.delete(name); },
            getFields: () => [{ get: () => 'field_text' }],
        },
        tinymce: { editors: [], on() {}, off() {}, triggerSave() { actions.get('change_field')?.(); } },
    };
    const context = { window, document, URLSearchParams,
        FormData: class { constructor(form) { return form.entries; } },
        MutationObserver: class {
            constructor(fn) { callback = fn; }
            observe(target) { watched.push(target); }
            disconnect() { disconnected++; }
        },
    };
    const initAcf = vm.runInNewContext(`${shared}\ninitAcf`, context);
    context.imports = {
        './acf.js': { initAcf },
        '@wordpress/data': { select: () => storeValues.size ? { getFieldValue: (key) => storeValues.get(key) } : undefined },
    };
    const adapter = vm.runInNewContext(`${source}\ncreateBlockEditorAcf`, context)(() => changes++);
    return { adapter, actions, listeners, normal, field, watched, storeValues,
        mutate: () => callback(),
        get changes() { return changes; }, get disconnected() { return disconnected; },
        input(inMetaBox = true) { listeners.get('input')?.({ target: { inMetaBox, closest: () => ({}) } }); },
    };
}

test('capture only native ACF meta-box values, retaining row deltas, empty values and signed field lists', () => {
    const h = fixture();
    const body = h.adapter.capture();
    assert.equal(body.get('_acf_nonce'), 'nonce');
    assert.equal(body.get('acf[field_text]'), 'Unsaved');
    assert.equal(body.get('acf[field_empty]'), '');
    assert.equal(body.get('acf[field_rows][row-0][acf_reordered]'), '1');
    assert.deepEqual(body.getAll('_acf_fields[group][]'), ['field_text', 'field_rows']);
    assert.equal(body.get('acf[field_side]'), 'Side field', 'unmounted native meta-box location is supported');
    for (const name of ['action', 'unrelated', '_wpnonce', 'acf[file]']) assert.equal(body.has(name), false);
    assert.equal(h.changes, 0, 'TinyMCE capture notifications cannot start another update');
});

test('only native meta-box input events trigger ACF updates; canvas and modal controls are excluded', () => {
    const h = fixture();
    h.input();
    assert.equal(h.changes, 1);
    h.input(false);
    assert.equal(h.changes, 1);
    h.actions.get('sortstop')();
    assert.equal(h.changes, 2);
});

test('observe opt-in datastore changes through ACF public selectors without editing Gutenberg state', () => {
    const h = fixture();
    h.adapter.observe();
    h.storeValues.set('field_text', 'API edit');
    h.adapter.observe();
    assert.equal(h.changes, 1);
    h.adapter.observe();
    assert.equal(h.changes, 1);
    h.storeValues.set('field_text', 'Next API edit');
    h.adapter.observe();
    assert.equal(h.changes, 2);
});

test('native post-save row replacement, not mutation timing or class removal, determines readiness', () => {
    const h = fixture();
    const originalRows = [...h.field.rows];
    h.adapter.saved();
    assert.equal(h.adapter.ready, false);
    assert.equal(h.watched[0], h.field);
    h.mutate();
    assert.equal(h.adapter.ready, false, 'incidental changes do not confirm reloaded data');
    h.field.rows = [originalRows[1], { id: 'new-0' }];
    h.mutate();
    assert.equal(h.adapter.ready, false, 'all stale rows must be replaced');
    h.field.rows = [{ id: 'new-0' }, { id: 'new-1' }];
    h.mutate();
    assert.equal(h.adapter.ready, true);
    assert.deepEqual(originalRows.map((row) => row.id), ['old-0', 'old-1'], 'never rewrite native row IDs or deltas');
});

test('native refresh to zero rows and initially empty repeaters remain usable', () => {
    const h = fixture();
    h.adapter.saved();
    h.field.rows = [];
    h.mutate();
    assert.equal(h.adapter.ready, true);
    h.adapter.saved();
    assert.equal(h.adapter.ready, true);
});

test('a field removed by ACF cannot leave preview permanently waiting', () => {
    const h = fixture();
    h.adapter.saved();
    h.field.isConnected = false;
    h.actions.get('remove')();
    assert.equal(h.adapter.ready, true);
});

test('destroy removes ACF hooks, native input listeners and the pending row observer', () => {
    const h = fixture();
    h.adapter.saved();
    h.adapter.destroy();
    assert.equal(h.actions.size, 0);
    assert.equal(h.listeners.size, 0);
    assert.ok(h.disconnected > 0);
});
