import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runChromiumTests } from './helpers/chromium.mjs';

async function browserTests(source) {
    const createPreviewScroll = new Function(`${source.replace('export function', 'function')}\nreturn createPreviewScroll;`)();
    const results = [];
    async function check(name, run) {
        const frames = [];
        const documentFor = async (content) => {
            const frame = document.createElement('iframe');
            frame.style.cssText = 'width:640px;height:320px;border:0';
            frames.push(frame);
            const loaded = new Promise((resolve) => { frame.onload = resolve; });
            frame.srcdoc = `<style>p{height:100px;margin:0}img{width:20px;height:20px}</style><main>${content}</main>`;
            document.body.append(frame);
            await loaded;
            return frame.contentDocument;
        };
        try { await run(createPreviewScroll(), documentFor); results.push({ name }); }
        catch (error) { results.push({ name, error: error.message }); }
        finally { frames.forEach((frame) => frame.remove()); }
    }
    const content = (text = 'Original paragraph', imageClass = 'lazyload') =>
        `<img class="${imageClass}" data-src="/avatar.jpg"><p>Unchanged introduction</p><p>Unchanged middle</p><p id="edited">${text}</p><p>End</p>`;
    const equal = (actual, expected, message) => { if (actual !== expected) throw new Error(message); };
    await check('edited block text wins over incidental lazy-loading classes', async (scrolling, doc) => {
        const previous = await doc(content());
        scrolling.restore(previous);
        previous.querySelector('img').className = 'lazyloaded';
        const next = await doc(content('Changed paragraph', 'ls-is-cached lazyloaded'));
        const target = scrolling.findTarget(previous, next);
        equal(target, next.querySelector('#edited'), 'Follow the edited paragraph, not the unchanged avatar.');
        scrolling.restore(next, target);
        if (next.defaultView.scrollY <= 0) throw new Error('Reveal the off-screen change.');
    });
    await check('content changes win over incidental ancestor presentation changes', async (scrolling, doc) => {
        const previous = await doc(content());
        scrolling.restore(previous);
        const next = await doc(content('Changed paragraph'));
        next.documentElement.style.scrollPaddingTop = '32px';
        equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'A runtime root style must not hide the actual content change.');
    });
    await check('presentation-only edits still reveal the changed element', async (scrolling, doc) => {
        const previous = await doc(content());
        const next = await doc(content());
        next.querySelector('#edited').classList.add('has-text-align-right');
        equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'Keep support for genuine block class/style changes.');
    });
    await check('normalized lazy media sources do not mask an edited image', async (scrolling, doc) => {
        const previous = await doc(content());
        const next = await doc(content());
        next.querySelector('img').setAttribute('src', '/avatar.jpg');
        equal(scrolling.findTarget(previous, next), null, 'Resolving the declared lazy source is not an edit.');
        const edited = await doc(content());
        edited.querySelector('img').setAttribute('data-src', '/changed.jpg');
        equal(scrolling.findTarget(previous, edited), edited.querySelector('img'), 'Actual image-source edits still count.');
    });
    await check('deletions reveal surviving content and unchanged documents preserve their position', async (scrolling, doc) => {
        const previous = await doc(content());
        const next = await doc(content());
        equal(scrolling.findTarget(previous, next), null, 'Unchanged output must not invent a target.');
        // Use a fresh document because snapshots are intentionally cached at load.
        const deleted = await doc(content().replace('<p id="edited">Original paragraph</p>', ''));
        equal(scrolling.findTarget(previous, deleted), deleted.querySelector('p:last-child'), 'Deletion lands on the next surviving content.');
        previous.defaultView.scrollTo(0, 60);
        scrolling.remember(previous);
        scrolling.restore(next);
        equal(next.defaultView.scrollY, 60, 'No target means retaining the last scroll position.');
    });
    return results;
}

test('preview scrolling follows edited content before incidental presentation changes in Chromium', async (t) => {
    const source = await readFile(new URL('../src/preview/scroll.js', import.meta.url), 'utf8');
    await runChromiumTests(t, { script: `(${browserTests.toString()})(${JSON.stringify(source)})`, count: 5 });
});
