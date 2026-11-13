import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// Exercise real DOM/layout without adding a build step or browser automation dependency.
async function browserTests(createPreviewScroll) {
    const results = [];
    async function check(name, run) {
        try {
            await run();
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { document.querySelectorAll('iframe').forEach((frame) => frame.remove()); }
    }
    function equal(actual, expected) {
        if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
    }
    async function fixture(markup) {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'width: 1000px; height: 600px; border: 0';
        const loaded = new Promise((resolve) => { frame.onload = resolve; });
        frame.srcdoc = `<!doctype html><html><head><style>body { margin: 0; } p { min-height: 24px; } img { width: 100px; height: 100px; }</style></head><body>${markup}</body></html>`;
        document.body.append(frame);
        await loaded;
        return frame.contentDocument;
    }
    async function compare(before, after, expected, mutate) {
        const previous = await fixture(before);
        const next = await fixture(after);
        const scrolling = createPreviewScroll();
        scrolling.restore(previous);
        mutate?.(previous);
        equal(scrolling.findTarget(previous, next)?.id ?? null, expected);
    }
    const content = '<p id="copy">Same content</p>';
    const layout = (attributes) => `<main><section id="layout" ${attributes}>${content}</section></main>`;

    await check('unchanged content does not scroll', () => compare(layout(''), layout(''), null));
    await check('text edits target the changed text', () => compare(
        `<main>${content}</main>`, '<main><p id="copy">Edited content</p></main>', 'copy'
    ));
    await check('media edits target the changed image', () => compare(
        '<main><img id="image" data-src="/before.jpg"></main>',
        '<main><img id="image" data-src="/after.jpg"></main>', 'image'
    ));
    await check('arbitrary data attributes on wrappers are detected', () => compare(
        layout('data-placement="left"'), layout('data-placement="right"'), 'layout'
    ));
    await check('wrapper classes are detected', () => compare(
        layout('class="columns-left"'), layout('class="columns-right"'), 'layout'
    ));
    await check('inline layout styles are detected', () => compare(
        layout('style="display: grid; direction: ltr"'), layout('style="display: grid; direction: rtl"'), 'layout'
    ));
    await check('CSS custom properties are detected', () => compare(
        layout('style="--columns: 2"'), layout('style="--columns: 3"'), 'layout'
    ));
    await check('style priorities are detected', () => compare(
        layout('style="color: red"'), layout('style="color: red !important"'), 'layout'
    ));
    await check('native visibility attributes are detected', () => compare(
        '<main><section id="layout"><p id="copy">Same content</p></section></main>',
        '<main><section id="layout"><p id="copy" hidden>Same content</p></section></main>', 'layout'
    ));
    await check('custom elements need no theme-specific integration', () => compare(
        `<main><content-layout id="layout" data-layout="split">${content}</content-layout></main>`,
        `<main><content-layout id="layout" data-layout="stacked">${content}</content-layout></main>`, 'layout'
    ));
    await check('link destinations are detected', () => compare(
        '<main><a id="link" href="/before">Read more</a></main>',
        '<main><a id="link" href="/after">Read more</a></main>', 'link'
    ));
    await check('image alt text is detected', () => compare(
        '<main><img id="image" alt="Before"></main>', '<main><img id="image" alt="After"></main>', 'image'
    ));
    await check('class order is immaterial', () => compare(
        layout('class="grid wide"'), layout('class="wide grid"'), null
    ));
    await check('attribute order is immaterial', () => compare(
        layout('data-layout="grid" data-align="left"'), layout('data-align="left" data-layout="grid"'), null
    ));
    await check('style declaration order is immaterial', () => compare(
        layout('style="display: grid; color: red"'), layout('style="color: red; display: grid"'), null
    ));
    await check('empty style and class attributes are immaterial', () => compare(
        layout(''), layout('style="" class=""'), null
    ));
    await check('generated IDs and security attributes are ignored', () => compare(
        `<main><section id="generated-before" nonce="before" data-request-token="before">${content}</section></main>`,
        `<main><section id="generated-after" nonce="after" data-request-token="after">${content}</section></main>`, null
    ));
    await check('hidden form fields are ignored', () => compare(
        `<main><input type="hidden" name="nonce" value="before">${content}</main>`,
        `<main><input type="hidden" name="nonce" value="after" data-state="new">${content}</main>`, null
    ));
    await check('scripts, styles, navigation and live regions are ignored', () => compare(
        `<main><script>const value = 1;</script><style>.before { color: red; }</style><nav>Before</nav><div aria-live="polite">Before</div>${content}</main>`,
        `<main><script>const value = 2;</script><style>.after { color: blue; }</style><nav>After</nav><div aria-live="polite">After</div>${content}</main>`, null
    ));
    await check('frontend mutations after load do not replace the comparison baseline', () => compare(
        layout('class="initial" data-state="initial" style="color: red"'),
        layout('class="initial" data-state="initial" style="color: red"'), null,
        (doc) => {
            const node = doc.getElementById('layout');
            node.className = 'animated scrolled';
            node.dataset.state = 'running';
            node.style.color = 'blue';
            doc.getElementById('copy').textContent = 'Runtime output';
        }
    ));
    await check('runtime state does not hide a later editor layout change', () => compare(
        layout('class="initial" data-layout="left"'), layout('class="initial" data-layout="right"'), 'layout',
        (doc) => { doc.getElementById('layout').classList.add('animated'); }
    ));
    await check('lazy media URLs are compared by their declared source', () => compare(
        '<main><img id="image" data-src="/photo.jpg" src="placeholder.jpg"></main>',
        '<main><img id="image" data-src="/photo.jpg" src="photo.jpg"></main>', null
    ));
    await check('inserted content is detected', () => compare(
        `<main>${content}</main>`, `<main><p id="added">Added</p>${content}</main>`, 'added'
    ));
    await check('deletions target the next surviving content', () => compare(
        `<main><p>Removed</p>${content}</main>`, `<main>${content}</main>`, 'copy'
    ));
    await check('trailing deletions target the preceding content', () => compare(
        `<main>${content}<p>Removed</p></main>`, `<main>${content}</main>`, 'copy'
    ));
    await check('new structural wrappers are detected', () => compare(
        `<main>${content}</main>`, layout(''), 'layout'
    ));
    await check('reparenting is detected even when element order stays the same', () => compare(
        `<main><section><p>First</p></section>${content}</main>`,
        `<main><section><p>First</p>${content}</section></main>`, 'copy'
    ));
    await check('SVG presentation attributes are detected', () => compare(
        '<main><svg width="100" height="100"><path id="shape" d="M0 0L10 10"></path></svg></main>',
        '<main><svg width="100" height="100"><path id="shape" d="M0 0L20 20"></path></svg></main>', 'shape'
    ));
    await check('article fallback supports layout changes', () => compare(
        `<article id="layout" class="wide">${content}</article>`,
        `<article id="layout" class="narrow">${content}</article>`, 'layout'
    ));
    await check('ancestor presentation changes target the main content', () => compare(
        `<div data-layout="wide"><main id="main">${content}</main></div>`,
        `<div data-layout="narrow"><main id="main">${content}</main></div>`, 'main'
    ));
    await check('unrelated content outside main is ignored', () => compare(
        `<header>Before</header><main>${content}</main>`, `<header>After</header><main>${content}</main>`, null
    ));
    await check('manual position is restored without a change target', async () => {
        const markup = '<main style="height: 3000px">Same content</main>';
        const previous = await fixture(markup);
        const next = await fixture(markup);
        const scrolling = createPreviewScroll();
        scrolling.restore(previous);
        previous.defaultView.scrollTo(0, 700);
        scrolling.remember(previous);
        scrolling.restore(next);
        equal(next.defaultView.scrollY, 700);
    });
    await check('layout changes are actually revealed without leaving temporary styles', async () => {
        const markup = (side) => `<main><div style="height: 2000px"></div><section id="layout" data-side="${side}">${content}</section><div style="height: 2000px"></div></main>`;
        const previous = await fixture(markup('left'));
        const next = await fixture(markup('right'));
        const scrolling = createPreviewScroll();
        scrolling.restore(previous);
        const target = scrolling.findTarget(previous, next);
        equal(target?.id, 'layout');
        scrolling.restore(next, target);
        const box = target.getBoundingClientRect();
        equal(box.top >= 0 && box.bottom <= next.documentElement.clientHeight, true);
        equal(target.getAttribute('style'), null);
    });
    return results;
}

test('theme-independent scroll-to-changes detection in Chromium', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'aflpp-scroll-'));
    try {
        const source = await readFile(new URL('../assets/preview-scroll.js', import.meta.url), 'utf8');
        const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
        const page = join(directory, 'test.html');
        await writeFile(page, `<!doctype html><html><body><script id="results" type="application/json">null</script><script type="module">
            import { createPreviewScroll } from ${JSON.stringify(moduleUrl)};
            document.getElementById('results').textContent = JSON.stringify(await (${browserTests.toString().replace(/<\/script/gi, '<\\/script')})(createPreviewScroll));
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
        assert.equal(results.length, 33);
        for (const result of results) await t.test(result.name, () => assert.equal(result.error, undefined, result.error));
    } finally { await rm(directory, { recursive: true, force: true }); }
});
