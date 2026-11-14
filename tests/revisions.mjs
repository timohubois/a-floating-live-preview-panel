import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { previewSourceForVm } from './helpers/modules.mjs';

const source = await previewSourceForVm(new URL('../src/revisions/preview.js', import.meta.url));
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const url = (id) => `http://site.local/?preview=true&aflpp_saved=1&aflpp_revision=${id}&aflpp_token=token-${id}`;
const revision = (id, address = url(id)) => ({
    id, get: (key) => ({ aflppPreviewUrl: address, dateShort: `Date ${id}`, author: { name: `Author ${id}` } })[key],
});

function fixture({ visible = true, selected = revision(11), isolated = false } = {}) {
    const timers = new Map(), listeners = new Map(), events = new Map(), reports = [], allFrames = [], scrolls = [];
    let options, nextTimer = 0, title = '', clears = 0, returned = 0;
    const children = [];
    const stage = {
        ownerDocument: {
            createElement() {
                const attributes = new Map();
                const frame = {
                    setAttribute: (name, value) => attributes.set(name, value),
                    removeAttribute: (name) => attributes.delete(name),
                    classList: { remove() {} },
                    remove() { const at = children.indexOf(frame); if (at !== -1) children.splice(at, 1); },
                };
                allFrames.push(frame);
                return frame;
            },
        },
        append: (frame) => children.push(frame),
    };
    const view = {
        stage, visible, followChanges: true,
        setVisible(value) { this.visible = value; },
        setTitle(value) { title = value; },
        report(text, state, detail) { reports.push({ text, state, ...detail }); },
        clearPreview() { children.splice(0); clears++; },
        returnToEditor() { returned++; },
    };
    const model = {
        get: (key) => key === 'to' ? selected : null,
        on: (event, callback) => listeners.set(event, callback),
        off: (event, callback) => { assert.equal(listeners.get(event), callback); listeners.delete(event); },
    };
    const context = {
        URL, console,
        window: { crossOriginIsolated: isolated, location: { origin: 'http://site.local' }, addEventListener: (event, callback) => events.set(event, callback) },
        setTimeout(callback, delay) { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
        clearTimeout: (id) => timers.delete(id),
        fetch() { throw new Error('Revision browsing must not fetch a write endpoint.'); },
    };
    const strings = {
        title: 'Revision preview', revisionLabel: '%1$s — %2$s', currentVersion: 'Current version',
        updating: 'Updating', current: 'Loaded', stale: 'Pending', unavailable: 'Unavailable',
        failed: 'Failed', browser: 'Same-origin required',
    };
    context.imports = {
        '../panel/window.js': { createPreviewPanel: (strings, callbacks) => {
            options = callbacks; title = callbacks.postTitle; return view;
        } },
        '../preview/scroll.js': { createPreviewScroll: () => ({
            remember: (doc) => scrolls.push(['remember', doc]),
            findTarget: (previous, next) => { scrolls.push(['find', previous, next]); return 'target'; },
            restore: (doc, target) => scrolls.push(['restore', doc, target]),
        }) },
    };
    const init = vm.runInNewContext(`${source}\ninitRevisionPreview`, context);
    init({ postId: 1, currentPreviewUrl: url(1), strings }, model);
    return {
        view, options, reports, children, allFrames, timers, scrolls, listeners,
        get title() { return title; }, get clears() { return clears; }, get returned() { return returned; },
        get last() { return reports.at(-1); },
        select(next) { selected = next; listeners.get('update:revisions')?.(); },
        async runTimers(delay = 250) {
            for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.callback(); }
            await flush();
        },
        async load(frame = allFrames.at(-1), marked = true) {
            frame.contentDocument = { querySelector: () => marked ? { content: new URL(frame.src).searchParams.get('aflpp_token') } : null };
            frame.onload?.(); await flush();
        },
        hide: (persisted = false) => events.get('pagehide')({ persisted }),
    };
}

test('revision browsing loads the native To source without editor APIs or Web Locks', async () => {
    const h = fixture();
    assert.equal(h.children.length, 1);
    assert.equal(h.children[0].src, url(11));
    await h.load();
    assert.equal(h.last.state, 'ready');
    assert.equal(h.last.hasPreview, true);
    assert.equal(h.last.previewUrl, url(11));
    assert.equal(h.title, 'Date 11 — Author 11');
    assert.equal(h.children[0].referrerPolicy, 'same-origin');
});

for (const isolated of [false, true]) {
    test(`preview documents opt into matching isolation only for isolated editors: ${isolated}`, async () => {
        const h = fixture({ isolated });
        const address = new URL(h.children[0].src);
        assert.equal(address.searchParams.get('aflpp_isolated'), isolated ? '1' : null);
        assert.equal(address.searchParams.get('aflpp_token'), 'token-11');
        await h.load();
        assert.equal(h.last.state, 'ready');
        assert.equal(new URL(h.last.previewUrl).searchParams.get('aflpp_isolated'), isolated ? '1' : null);
    });
}

test('rapid slider changes cancel old loads, debounce and display only the latest revision', async () => {
    const h = fixture();
    const stale = h.children[0], oldLoad = stale.onload;
    h.select(revision(12)); h.select(revision(13)); h.select(revision(14));
    assert.equal(h.children.length, 0);
    oldLoad();
    assert.notEqual(h.last.state, 'ready');
    await h.runTimers();
    assert.equal(h.allFrames.length, 2);
    assert.equal(h.children[0].src, url(14));
    await h.load();
    assert.equal(h.title, 'Date 14 — Author 14');
    assert.equal(h.timers.size, 0);
});

test('changing only the From side or comparison mode does not reload the To preview', async () => {
    const h = fixture(); await h.load();
    h.select(revision(11));
    await h.runTimers();
    assert.equal(h.allFrames.length, 1);
});

test('previous preview retains its identity while loading and after a failed replacement', async () => {
    const h = fixture(); await h.load();
    h.select(revision(12)); await h.runTimers();
    assert.equal(h.title, 'Date 11 — Author 11');
    h.allFrames.at(-1).onerror(); await flush();
    assert.equal(h.last.state, 'error');
    assert.equal(h.last.hasPreview, true);
    assert.equal(h.title, 'Date 11 — Author 11');
    h.options.onRetry(); await h.load();
    assert.equal(h.title, 'Date 12 — Author 12');
    assert.ok(h.scrolls.some(([operation]) => operation === 'find'));
});

test('closing cancels pending loads; reopening uses the latest selection without touching visibility preferences', async () => {
    const h = fixture();
    h.options.onClose();
    assert.equal(h.view.visible, false);
    assert.equal(h.children.length, 0);
    assert.equal(h.timers.size, 0);
    h.select(revision(12)); await h.runTimers();
    assert.equal(h.allFrames.length, 1);
    h.options.onOpen(); await h.load();
    assert.equal(h.title, 'Date 12 — Author 12');
    assert.equal(h.view.visible, true);
});

test('remembered closed panels do not load until explicitly opened', async () => {
    const h = fixture({ visible: false });
    h.select(revision(12)); await h.runTimers();
    assert.equal(h.allFrames.length, 0);
    h.options.onOpen(); await h.load();
    assert.equal(h.last.previewUrl, url(12));
});

test('only the actual parent entry uses the current saved-post URL', async () => {
    const h = fixture({ selected: revision(1, null) }); await h.load();
    assert.equal(h.last.previewUrl, url(1));
    assert.equal(h.title, 'Current version — Date 1 — Author 1');
    h.select(revision(20, null)); await h.runTimers();
    assert.equal(h.children.length, 0);
    assert.equal(h.last.reason, 'unavailable');
    assert.equal(h.last.canRetry, false);
    assert.equal(h.last.canRefresh, false);
    assert.equal(h.last.previewUrl, null);
});

test('cross-origin URLs are rejected without creating a frame', async () => {
    const h = fixture({ selected: revision(11, 'https://other.example/?aflpp_token=token') }); await flush();
    assert.equal(h.allFrames.length, 0);
    assert.equal(h.last.reason, 'browser');
    assert.equal(h.last.canRetry, false);
});

test('PiP adoption reloads the selected source and does not reopen a closed panel', async () => {
    const h = fixture(); await h.load();
    h.options.beforeMove(); assert.equal(h.children.length, 0);
    h.options.afterMove(); await h.load();
    assert.equal(h.last.previewUrl, url(11));
    h.options.onClose(); h.options.afterMove();
    assert.equal(h.allFrames.length, 2);
});

test('browser-native and unmarked output loads without HTML scroll enhancement', async () => {
    const h = fixture(); await h.load(undefined, false);
    assert.equal(h.last.state, 'ready');
    assert.equal(h.scrolls.length, 0);
});

test('a timed-out frame can be retried without accepting its stale load', async () => {
    const h = fixture();
    await h.runTimers(30000);
    assert.equal(h.last.state, 'error');
    assert.equal(h.children.length, 0);
    h.options.onRetry(); await h.load();
    assert.equal(h.last.state, 'ready');
});

test('normal page exit detaches the native model listener, while bfcache preserves it', () => {
    const h = fixture();
    h.hide(true); assert.equal(h.listeners.size, 1);
    h.hide(false); assert.equal(h.listeners.size, 0);
    assert.equal(h.children.length, 0);
});
