import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { sourceForVm, previewSourceForVm } from './helpers/modules.mjs';

async function browserTests(editorSource, initAcf, nativeSource) {
    const realJQuery = window.jQuery;
    const results = [];
    const equal = (actual, expected) => {
        if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
    };
    if (window.QTags) equal(typeof realJQuery?.fn?.jquery, 'string');
    window.BroadcastChannel = undefined;
    Object.defineProperty(navigator, 'locks', { value: { request: (name, options, run) => run({}) } });

    async function fixture(withAcf, withWordPress) {
        const form = document.createElement('form');
        form.id = 'post';
        form.innerHTML = '<input id="title" name="post_title"><textarea name="content"></textarea><textarea name="excerpt"></textarea><input name="unrelated"><input name="_acf_nonce" value="nonce"><div class="acf-field"><input name="acf[field_text]" value="ACF text"><input name="_acf_fields[field_rows]" value="rows"><div class="widget"></div></div>';
        document.body.append(form);
        const reports = [];
        const titles = [];
        const timers = new Map();
        const actions = new Map();
        const requests = [];
        const editorEvents = new Map();
        const editor = { on: (events, callback) => {
            for (const event of events.split(' ')) editorEvents.set(event, callback);
        } };
        let addEditor;
        let options;
        let finishNative;
        const original = { setTimeout, clearTimeout, fetch };
        let nextTimer = 0;
        window.setTimeout = (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; };
        window.clearTimeout = (id) => timers.delete(id);
        window.fetch = (url, request) => { requests.push(request); return new Promise(() => {}); };
        window.tinymce = {
            editors: [editor],
            on: (event, callback) => { addEditor = callback; },
            triggerSave: () => {
                editorEvents.get('SetContent')();
                if (withWordPress) window.jQuery(form.querySelector('[name="content"]')).trigger('change');
            },
        };
        const handlers = new Map();
        const jqueryListeners = [];
        delete window.jQuery;
        if (withAcf) window.acf = { addAction: (name, callback) => actions.set(name, callback) };
        if (withAcf || withWordPress) {
            // Use real WordPress assets when supplied; otherwise model only the jQuery event boundary.
            window.jQuery = realJQuery || ((target) => ({
                on(events, callback) {
                    if (!handlers.has(target)) handlers.set(target, []);
                    for (const event of events.split(' ')) {
                        const type = event.split('.')[0];
                        handlers.get(target).push({ type, callback });
                        const listener = (event) => callback({ type, target: event.target, originalEvent: event });
                        target.addEventListener(type, listener);
                        jqueryListeners.push({ target, type, listener });
                    }
                    return this;
                },
                trigger(type) {
                    for (let node = target; node; node = node.parentNode) {
                        for (const handler of handlers.get(node) || []) {
                            if (handler.type === type) handler.callback({ type, target });
                        }
                    }
                    return this;
                },
                off() { return this; },
            }));
        }
        const trigger = (type, target) => window.jQuery(target).trigger(type);
        let nativeEditor = { idle: new Promise((resolve) => { finishNative = resolve; }) };
        const view = {
            visible: true,
            report: (text, state, options) => reports.push({ state, ...options }),
            setTitle: (title) => titles.push(title),
            setVisible: (visible) => { view.visible = visible; },
            clearPreview() {},
            returnToEditor() {},
        };
        const config = { available: true, acfEnabled: withAcf, endpoint: '/preview', base: 'base', strings: {} };
        const createPanel = (strings, callbacks) => { options = callbacks; return view; };
        const createScroll = () => ({ remember() {} });
        const initPreview = new Function('imports', `${editorSource}\nreturn initLivePreview;`)({
            '../compatibility/acf.js': { initAcf },
            '../panel/window.js': { createPreviewPanel: createPanel },
            '../preview/scroll.js': { createPreviewScroll: createScroll },
        });
        if (withWordPress) {
            const idle = nativeEditor.idle;
            nativeEditor = new Function(`${nativeSource}\nreturn createNativeEditor;`)()(config, form);
            nativeEditor.idle = idle;
        }
        initPreview(config, nativeEditor);
        equal(reports.at(-1).state, 'loading');
        return {
            form, titles, timers, actions, editorEvents, trigger, nativeEditor,
            stale: () => reports.filter(({ state }) => state === 'stale').length,
            canRefresh: () => reports.at(-1).canRefresh,
            dispatch: (selector, type = 'input', bubbles = true) => form.querySelector(selector).dispatchEvent(new Event(type, { bubbles })),
            addEditor: (editor) => addEditor({ editor }),
            close: () => options.onClose(),
            async capture() { finishNative(); await Promise.resolve(); return requests[0].body; },
            async runTask() {
                for (const [id, timer] of [...timers]) if (timer.delay === 0) {
                    timers.delete(id);
                    await timer.callback();
                }
            },
            cleanup() {
                options.onClose();
                nativeEditor.destroy?.();
                if (window.jQuery) {
                    window.jQuery(document).off('.aflpp');
                    window.jQuery(form).off('.aflpp .aflppAcf');
                }
                for (const { target, type, listener } of jqueryListeners) target.removeEventListener(type, listener);
                Object.assign(window, original);
                form.remove();
            },
        };
    }
    async function check(name, run, withAcf = false, withWordPress = false) {
        let context;
        try {
            context = await fixture(withAcf, withWordPress);
            await run(context);
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { context?.cleanup(); }
    }

    await check('pending edits keep manual refresh disabled before and during a request', async (context) => {
        equal(context.canRefresh(), false);
        context.dispatch('[name="post_title"]');
        equal(context.canRefresh(), false);
        await context.capture();
        context.dispatch('[name="content"]');
        equal(context.canRefresh(), false);
        equal(context.timers.size, 1);
    });
    await check('core fields use native events without jQuery', (context) => {
        for (const name of ['post_title', 'content', 'excerpt']) {
            for (const type of ['input', 'change']) context.dispatch(`[name="${name}"]`, type);
        }
        equal(context.stale(), 6);
        equal(context.timers.size, 1);
        equal([...context.timers.values()][0].delay, 1000);
    });
    await check('non-bubbling native core changes are captured, as emitted by Quicktags', (context) => {
        context.dispatch('[name="content"]', 'change', false);
        context.dispatch('[name="excerpt"]', 'change', false);
        equal(context.stale(), 2);
        equal(context.timers.size, 1);
    });
    await check('WordPress jQuery-only core edits refresh and synchronize the title', (context) => {
        context.form.querySelector('#title').value = 'Programmatic title';
        for (const name of ['post_title', 'content', 'excerpt']) {
            for (const type of ['input', 'change']) context.trigger(type, context.form.querySelector(`[name="${name}"]`));
        }
        equal(context.stale(), 6);
        equal(context.titles.at(-1), 'Programmatic title');
        context.trigger('change', context.form.querySelector('[name="unrelated"]'));
        context.trigger('change', context.form.querySelector('[name="_acf_nonce"]'));
        equal(context.stale(), 6);
        equal(context.timers.size, 1);
    }, false, true);
    await check('WordPress and ACF bridges do not duplicate native core or ACF events', (context) => {
        context.dispatch('[name="content"]');
        context.dispatch('[name="content"]', 'change');
        context.dispatch('.acf-field input');
        context.dispatch('.acf-field input', 'change');
        equal(context.stale(), 4);
        equal(context.timers.size, 1);
    }, true, true);
    await check('the WordPress bridge leaves synthetic ACF edits to the ACF adapter', (context) => {
        context.trigger('change', context.form.querySelector('.acf-field input'));
        context.trigger('change', context.form.querySelector('.widget'));
        equal(context.stale(), 2);
    }, true, true);
    await check('jQuery-only titles still synchronize with the preview closed', (context) => {
        context.close();
        context.form.querySelector('#title').value = 'Closed preview title';
        context.trigger('change', context.form.querySelector('#title'));
        equal(context.titles.at(-1), 'Closed preview title');
        equal(context.stale(), 0);
        equal(context.timers.size, 0);
    }, false, true);
    if (window.QTags) await check('real WordPress Quicktags insertion schedules a refresh', (context) => {
        const textarea = context.form.querySelector('[name="content"]');
        textarea.id = 'content';
        window.wpActiveEditor = 'content';
        QTags.insertContent('<img src="/example.jpg">');
        equal(textarea.value, '<img src="/example.jpg">');
        equal(context.stale(), 1);
        equal(context.timers.size, 1);
    }, false, true);
    if (realJQuery) for (const native of [false, true]) {
        await check(`a later ${native ? 'native' : 'jQuery'} submit cancellation resumes preview change tracking`, async (context) => {
            context.nativeEditor.saving = true;
            const cancel = (event) => event.preventDefault();
            if (native) context.form.addEventListener('submit', cancel);
            else window.jQuery(context.form).on('submit.validation', cancel);
            try {
                const event = new Event('submit', { bubbles: true, cancelable: true });
                context.form.dispatchEvent(event);
                equal(event.defaultPrevented, true);
                await context.runTask();
                equal(context.nativeEditor.saving, false);
                equal(context.stale(), 1);
                context.dispatch('[name="content"]');
                equal(context.stale(), 2);
            } finally {
                if (native) context.form.removeEventListener('submit', cancel);
                else window.jQuery(context.form).off('.validation');
            }
        }, false, true);
    }
    await check('unrelated controls and ACF fields without integration do not refresh', (context) => {
        context.dispatch('[name="unrelated"]');
        context.dispatch('[name="_acf_nonce"]', 'change');
        context.dispatch('.acf-field input');
        equal(context.stale(), 0);
        equal(context.timers.size, 0);
    });
    await check('dynamically added core fields are covered by delegation', (context) => {
        const field = document.createElement('textarea');
        field.name = 'excerpt';
        context.form.append(field);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        equal(context.stale(), 1);
    });
    await check('title still updates while preview is stopped without scheduling a refresh', (context) => {
        context.close();
        context.form.querySelector('#title').value = 'New title';
        context.dispatch('#title');
        equal(context.titles.at(-1), 'New title');
        equal(context.stale(), 0);
        equal(context.timers.size, 0);
    });
    await check('TinyMCE input, undo, redo and content changes retain their existing hooks', (context) => {
        for (const event of ['input', 'change', 'undo', 'redo', 'SetContent']) context.editorEvents.get(event)();
        equal(context.stale(), 5);
        let registrations = 0;
        const editor = { on: () => registrations++ };
        context.addEditor(editor);
        context.addEditor(editor);
        equal(registrations, 1);
    });
    await check('native ACF events refresh once, including dynamically added fields', (context) => {
        context.dispatch('.acf-field input');
        context.dispatch('.acf-field input', 'change');
        const field = document.createElement('input');
        field.name = 'acf[field_added]';
        context.form.querySelector('.acf-field').append(field);
        field.dispatchEvent(new Event('change', { bubbles: true }));
        equal(context.stale(), 3);
    }, true);
    await check('ACF jQuery-only input and widget container changes retain their bridge', (context) => {
        context.trigger('input', context.form.querySelector('.acf-field input'));
        context.trigger('change', context.form.querySelector('.widget'));
        context.trigger('change', context.form.querySelector('.acf-field'));
        context.trigger('change', context.form.querySelector('[name="unrelated"]'));
        equal(context.stale(), 3);
        equal(context.timers.size, 1);
    }, true);
    await check('both native and jQuery-only ACF sorting events remain covered', (context) => {
        context.dispatch('.acf-field', 'sortupdate');
        context.trigger('sortupdate', context.form.querySelector('.acf-field'));
        equal(context.stale(), 2);
    }, true);
    await check('ACF row lifecycle and WYSIWYG hooks remain in the adapter', (context) => {
        for (const action of ['append', 'remove', 'sortstop', 'change_field']) context.actions.get(action)();
        equal(context.stale(), 4);
        let registrations = 0;
        context.actions.get('wysiwyg_tinymce_init')({ on: () => registrations++ });
        equal(registrations, 1);
    }, true);
    await check('capture still synchronizes TinyMCE and preserves the payload allowlist', async (context) => {
        context.form.querySelector('#title').value = 'Preview title';
        context.dispatch('#title');
        const data = await context.capture();
        equal(data.get('post_title'), 'Preview title');
        equal(data.get('acf[field_text]'), 'ACF text');
        equal(data.get('_acf_fields[field_rows]'), 'rows');
        equal(data.get('_acf_nonce'), 'nonce');
        equal(data.get('base'), 'base');
        equal(data.has('unrelated'), false);
        equal(context.stale(), 1);
    }, true, true);
    return results;
}

test('native editor events and ACF compatibility boundaries in Chromium', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'aflpp-events-'));
    try {
        const editorSource = await previewSourceForVm(new URL('../src/classic-editor/live-preview.js', import.meta.url));
        const nativeSource = await sourceForVm(new URL('../src/classic-editor/native-editor.js', import.meta.url));
        const acfSource = await readFile(new URL('../src/compatibility/acf.js', import.meta.url), 'utf8');
        const acfUrl = `data:text/javascript;base64,${Buffer.from(acfSource).toString('base64')}`;
        const wordpressScripts = process.env.WORDPRESS_ROOT ? await Promise.all([
            'wp-includes/js/jquery/jquery.js', 'wp-includes/js/quicktags.js',
        ].map(async (path) => {
            const source = await readFile(join(process.env.WORDPRESS_ROOT, path), 'utf8');
            return `<script src="data:text/javascript;base64,${Buffer.from(source).toString('base64')}"></script>`;
        })) : [];
        const page = join(directory, 'test.html');
        await writeFile(page, `<!doctype html><html><head><script>window.quicktagsL10n = new Proxy({}, { get: (target, key) => key });</script>${wordpressScripts.join('')}</head><body><script id="results" type="application/json">null</script><script type="module">
            import { initAcf } from ${JSON.stringify(acfUrl)};
            document.getElementById('results').textContent = JSON.stringify(await (${browserTests.toString().replace(/<\/script/gi, '<\\/script')})(${JSON.stringify(editorSource)}, initAcf, ${JSON.stringify(nativeSource)}));
        </script></body></html>`);
        const result = spawnSync(process.env.CHROMIUM_BIN || 'chromium', [
            '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking',
            `--user-data-dir=${join(directory, 'profile')}`, '--virtual-time-budget=10000',
            '--dump-dom', pathToFileURL(page).href,
        ], { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr);
        const output = result.stdout.match(/<script id="results" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
        assert.ok(output && output !== 'null', `Browser tests did not finish.\n${result.stderr}\n${result.stdout}`);
        const results = JSON.parse(output);
        assert.equal(results.length, process.env.WORDPRESS_ROOT ? 19 : 16);
        for (const result of results) await t.test(result.name, () => assert.equal(result.error, undefined, result.error));
    } finally { await rm(directory, { recursive: true, force: true }); }
});
