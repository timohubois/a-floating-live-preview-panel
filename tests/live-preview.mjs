import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import vm from 'node:vm';
import { BroadcastChannel, locks } from 'node:worker_threads';
import { sourceForVm } from './helpers/modules.mjs';

const source = await sourceForVm(new URL('../src/preview/live-preview.js', import.meta.url));
const settle = () => new Promise(setImmediate);
let nextSite = 0;

// Use native lock queues and cross-context messages; only the panel and frame are fakes.
function fixture(t) {
    const endpoint = `/ownership-test-${process.pid}-${++nextSite}`;
    return ({ site = endpoint, userId = 1, broadcast = true, pending = false, error, hasPreview = false } = {}) => {
        const write = Promise.withResolvers(), started = Promise.withResolvers();
        const reports = [], timers = new Map();
        const frames = { loads: 0, cancels: 0, clears: 0, hasPreview,
            load() { this.loads++; }, cancel() { this.cancels++; }, clear() { this.clears++; },
        };
        let callbacks, channel, exit, writes = 0;
        const view = { visible: true, setTitle() {}, returnToEditor() {},
            setVisible(value) { this.visible = value; },
            report(text, state, details) { reports.push({ text, state, ...details }); },
        };
        const session = vm.runInNewContext(`"use strict";\n${source}\ncreateLivePreview`, {
            AbortController, navigator: { locks },
            window: { isSecureContext: true, addEventListener: (name, callback) => { exit = callback; },
                BroadcastChannel: broadcast ? class extends BroadcastChannel {
                    constructor(name) { super(name); channel = this; }
                } : undefined,
            },
            setTimeout(callback, delay) { timers.set(callback, delay); return callback; },
            clearTimeout: (callback) => timers.delete(callback),
            imports: {
                '../panel/window.js': { createPreviewPanel: (strings, options) => { callbacks = options; return view; } },
                '../preview/scroll.js': { createPreviewScroll: () => ({}) },
                '../preview/frame.js': { createPreviewFrame: () => frames },
            },
        })({ endpoint: site, postId: 12, userId, available: true, strings: {} }, {
            idle: Promise.resolve(), saving: false,
            preparePreview() {
                writes++; started.resolve();
                return write.promise.then((result) => {
                    if (error) throw error;
                    return result;
                });
            },
        });
        if (!pending) write.resolve({ url: '/preview' });
        t.after(async () => {
            callbacks.onClose();
            write.resolve({ url: '/preview' });
            exit?.({ persisted: false });
            await session.pending;
            await settle();
        });
        return { session, callbacks, channel, reports, timers, frames, started: started.promise,
            release: () => write.resolve({ url: '/preview' }), get writes() { return writes; },
        };
    };
}

for (const hasPreview of [false, true]) {
    test(`an edit lock pauses ${hasPreview ? 'a retained preview' : 'an initial preview'} until WordPress takeover reloads the editor`, { timeout: 5000 }, async (t) => {
        const open = fixture(t);
        const error = Object.assign(new Error('Take over editing to continue.'), { code: 'aflpp_post_locked' });
        const h = open({ error, hasPreview });
        h.session.start(); await h.started; await h.session.pending; await settle();
        const report = h.reports.at(-1);
        assert.equal(report.state, 'paused');
        assert.equal(report.reason, 'post-locked');
        assert.equal(report.text, error.message);
        assert.equal(report.canRetry, false);
        assert.equal(report.canRefresh, false);
        assert.equal(report.hasPreview, hasPreview);
        assert.ok(h.frames.cancels > 0);
        assert.equal(h.frames.clears, 0, 'Keep the last good frame instead of clearing it.');
        h.session.changed();
        assert.equal(h.timers.size, 0, 'Edits must not keep retrying while WordPress holds the lock.');
        assert.equal(h.writes, 1);

        const other = open({ userId: 2 });
        other.session.start(); await other.started;
        assert.equal(other.writes, 1, 'Pausing must release local preview ownership.');
        other.callbacks.onClose(); await other.session.pending; await settle();

        h.callbacks.onClose(); // The old document is discarded by WordPress’s native takeover navigation.
        const reloaded = open();
        reloaded.session.start(); await reloaded.started; await reloaded.session.pending;
        assert.equal(reloaded.writes, 1, 'The reloaded editor must start its open preview without a manual retry.');
        assert.equal(reloaded.frames.loads, 1);
        assert.equal(h.writes, 1, 'The previous locked session must remain stopped.');
    });
}

for (const broadcast of [false, true]) {
    test(`a refused lock never starts writes, with messaging=${broadcast}`, { timeout: 5000 }, async (t) => {
        const open = fixture(t), owner = open(), other = open({ broadcast });
        owner.session.start(); await owner.started;
        other.session.start(); await settle();
        assert.equal(other.writes, 0);
        assert.equal(other.reports.at(-1).reason, broadcast ? 'other-tab' : 'manual');
    });
}

test('users contend for the same post, while separate sites do not', { timeout: 5000 }, async (t) => {
    const open = fixture(t), owner = open(), otherUser = open({ userId: 2 }), otherSite = open({ site: '/another-site' });
    owner.session.start(); await owner.started;
    otherUser.session.start(); otherSite.session.start(); await otherSite.started;
    assert.equal(otherUser.writes, 0);
    assert.equal(otherSite.writes, 1);
});

for (const takeover of [false, true]) {
    test(`${takeover ? 'cooperative handover' : 'closing'} retains ownership until the write drains`, { timeout: 5000 }, async (t) => {
        const open = fixture(t), owner = open({ broadcast: takeover, pending: true }), other = open();
        owner.session.start(); await owner.started;
        other.session.start(); await settle();
        const message = takeover ? once(owner.channel, 'message') : Promise.resolve();
        other.callbacks.onRetry(true);
        if (!takeover) owner.callbacks.onClose();
        await message; await settle();
        assert.equal(other.writes, 0, 'A second tab must not write while the old PHP operation is pending.');
        if (takeover) assert.equal(owner.reports.at(-1).reason, 'handed-off');
        owner.release(); await other.started;
        assert.equal(other.writes, 1);
        assert.equal(owner.writes, 1, 'The previous owner must not resume after handover.');
    });
}

for (const cancel of ['close', 'timeout']) {
    test(`${cancel} cancels a queued takeover without stealing or writing later`, { timeout: 5000 }, async (t) => {
        const open = fixture(t), owner = open({ broadcast: false }), other = open();
        owner.session.start(); await owner.started;
        other.callbacks.onRetry(true); other.callbacks.onRetry(true); await settle();
        assert.equal((await locks.query()).pending.length, 1, 'Repeated clicks queue only one takeover.');
        if (cancel === 'close') other.callbacks.onClose();
        else [...other.timers].find(([, delay]) => delay === 15000)[0]();
        await settle();
        assert.equal(other.timers.size, 0, 'Cancellation must finish and clear its timeout.');
        assert.equal(owner.writes, 1, 'Cancelling must leave the current owner alone.');
        if (cancel === 'timeout') assert.equal(other.reports.at(-1).reason, 'busy');
        owner.callbacks.onClose(); await settle();
        const next = open(); next.session.start(); await next.started;
        assert.equal(other.writes, 0, 'An obsolete request must never acquire ownership later.');
    });
}
