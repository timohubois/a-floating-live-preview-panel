import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runChromiumTests } from './helpers/chromium.mjs';

async function browserTests(source) {
    const createPreviewScroll = new Function(`${source.replace('export function', 'function')}\nreturn createPreviewScroll;`)();
    const results = [];
    // Model the PHP configuration; editor-extensions.php separately verifies the complete shipped policy.
    const defaults = ['script', 'style', 'noscript', 'template', 'link', 'meta', 'nav',
        '[role="navigation"]', '[aria-live]', 'input[type="hidden"]', 'table.xdebug-error'];
    async function check(name, run, excludedSelectors = defaults) {
        const frames = [];
        const documentFor = async (content, { captured = false, script = '', offset = 0 } = {}) => {
            const frame = document.createElement('iframe');
            frame.style.cssText = 'width:640px;height:320px;border:0';
            frames.push(frame);
            const loaded = new Promise((resolve) => { frame.onload = resolve; });
            let html = `<!doctype html><html><head><meta name="a-floating-live-preview-panel" content="source-token"><style>p{height:100px;margin:0}img{width:20px;height:20px}</style></head><body><main>${content}</main><script>${script}</script></body></html>`;
            if (captured) {
                // Model the PHP wire format; the PHP fixture separately verifies the actual buffer/HTML API.
                const source = new DOMParser().parseFromString(html, 'text/html');
                for (const node of source.querySelectorAll('*')) {
                    if (!['base', 'head', 'link', 'meta', 'script', 'style', 'title'].includes(node.localName)) {
                        node.setAttribute('data-aflpp-node', String(++offset));
                    }
                }
                const original = `<!doctype html>${source.documentElement.outerHTML}`;
                source.querySelector('meta').setAttribute('data-aflpp-source', JSON.stringify(original));
                html = `<!doctype html>${source.documentElement.outerHTML}`;
            }
            frame.srcdoc = html;
            document.body.append(frame);
            await loaded;
            return frame.contentDocument;
        };
        try { await run(createPreviewScroll(excludedSelectors), documentFor); results.push({ name }); }
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
    const section = (heading, text = 'Repeated paragraph') => `<section><h2>${heading}</h2><p>${text}</p></section>`;
    await check('nested section insertion follows the new section, not a reused wrapper', async (scrolling, doc) => {
        const previous = await doc(section('First') + section('Last'));
        const next = await doc(section('First') + section('Inserted') + section('Last'));
        equal(scrolling.findTarget(previous, next), next.querySelectorAll('section')[1], 'Unchanged surrounding sections identify the complete insertion.');
    });
    await check('nested section deletion follows the surviving section boundary', async (scrolling, doc) => {
        const previous = await doc(section('First') + section('Removed') + section('Last'));
        const next = await doc(section('First') + section('Last'));
        equal(scrolling.findTarget(previous, next), next.querySelectorAll('section')[1], 'A deletion should not be mistaken for an edit to the surviving heading.');
    });
    await check('deleting the last section follows the preceding section, not its last descendant', async (scrolling, doc) => {
        const previous = await doc(section('First') + section('Removed'));
        const next = await doc(section('First'));
        equal(scrolling.findTarget(previous, next), next.querySelector('section'), 'Keep the deletion fallback at the sibling section level.');
    });
    await check('deleting the only nested child stays within its surviving container', async (scrolling, doc) => {
        const previous = await doc('<section><p>Removed</p></section>' + section('Unrelated'));
        const next = await doc('<section></section>' + section('Unrelated'));
        equal(scrolling.findTarget(previous, next), next.querySelector('section'), 'Do not jump into unrelated content outside the emptied section.');
    });
    await check('reordering sections without an identifiable edited section preserves position', async (scrolling, doc) => {
        const previous = await doc(section('First') + section('Second') + section('Third'));
        const next = await doc(section('Second') + section('Third') + section('First'));
        equal(scrolling.findTarget(previous, next), null, 'The output alone cannot identify which of the reordered sections the user moved.');
        previous.defaultView.scrollTo(0, 100);
        scrolling.remember(previous);
        scrolling.restore(next);
        equal(next.defaultView.scrollY, 100, 'An ambiguous reorder must not reset the reader position.');
    });
    await check('repeated paragraphs are matched within their unchanged section context', async (scrolling, doc) => {
        const previous = await doc(section('First') + section('Second') + section('Third'));
        const next = await doc(section('First') + section('Second', 'Edited paragraph') + section('Third'));
        equal(scrolling.findTarget(previous, next), next.querySelectorAll('section p')[1], 'Repeated text in other sections must not capture the edit.');
    });
    await check('indistinguishable repeated insertions do not invent an insertion position', async (scrolling, doc) => {
        const previous = await doc(section('Repeated') + section('Repeated'));
        const next = await doc(section('Repeated') + section('Repeated') + section('Repeated'));
        equal(scrolling.findTarget(previous, next), null, 'Identical output cannot distinguish an insertion at the start, middle or end.');
    });
    await check('indistinguishable repeated deletions do not invent a deletion position', async (scrolling, doc) => {
        const previous = await doc(section('Repeated') + section('Repeated') + section('Repeated'));
        const next = await doc(section('Repeated') + section('Repeated'));
        equal(scrolling.findTarget(previous, next), null, 'Do not assume that the last identical section was deleted.');
    });
    await check('unchanged separators locate insertions and deletions of otherwise repeated sections', async (scrolling, doc) => {
        const previous = await doc(section('Repeated') + section('Separator') + section('Last'));
        const inserted = await doc(section('Repeated') + section('Separator') + section('Repeated') + section('Last'));
        equal(scrolling.findTarget(previous, inserted), inserted.querySelectorAll('section')[2], 'Separated repeats still have an identifiable insertion boundary.');
        const deleted = await doc(section('Repeated') + section('Separator') + section('Last'));
        equal(scrolling.findTarget(inserted, deleted), deleted.querySelectorAll('section')[2], 'Separated repeats still have an identifiable deletion boundary.');
    });
    await check('separate visible text changes are ambiguous rather than following the first one', async (scrolling, doc) => {
        const previous = await doc(section('Status', 'Generated value 1') + section('Middle') + section('Article', 'Original text'));
        const next = await doc(section('Status', 'Generated value 2') + section('Middle') + section('Article', 'Edited text'));
        equal(scrolling.findTarget(previous, next), null, 'Without editor-to-output mapping, either visible change could be unrelated runtime output.');
    });
    await check('an insertion and a separate edit remain separate across unchanged sections', async (scrolling, doc) => {
        const previous = await doc(section('First') + section('Middle') + section('Last', 'Original text'));
        const next = await doc(section('Inserted') + section('First') + section('Middle') + section('Last', 'Edited text'));
        equal(scrolling.findTarget(previous, next), null, 'Align unchanged sections rather than treating the whole remainder as one replacement.');
    });
    await check('hidden runtime text does not mask the visible edit', async (scrolling, doc) => {
        const previous = await doc('<div hidden>Generated value 1</div>' + content());
        const next = await doc('<div hidden>Generated value 2</div>' + content('Changed paragraph'));
        equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'A hidden change must not promote the entire main element to a target.');
    });
    await check('hidden-only changes fall back to their nearest visible container', async (scrolling, doc) => {
        const previous = await doc('<div hidden>Generated value 1</div>' + content());
        const next = await doc('<div hidden>Generated value 2</div>' + content());
        equal(scrolling.findTarget(previous, next), next.querySelector('main'), 'When only hidden content changed, use its visible context rather than widget-specific knowledge.');
    });
    for (const captured of [false, true]) {
        const mode = captured ? 'captured source' : 'DOM fallback';
        await check(`${mode}: hidden edits reveal the nearest visible container without opening the widget`, async (scrolling, doc) => {
            const markup = (text) => `${content()}<section id="context"><button data-action="toggle">Open article</button>
                <div hidden><div><p>${text}</p></div></div><p>Visible context</p></section>`;
            const previous = await doc(markup('Before'), { captured });
            const next = await doc(markup('After'), { captured });
            const container = next.querySelector('#context');
            const original = container.outerHTML;
            let clicks = 0;
            container.querySelector('button').addEventListener('click', () => { clicks++; });
            const target = scrolling.findTarget(previous, next);
            equal(target, container, 'No ID, ARIA relationship or theme attribute is required.');
            scrolling.restore(next, target);
            equal(container.outerHTML, original, 'Leave widget markup and hidden state unchanged.');
            equal(clicks, 0, 'Do not simulate interaction to force the region open.');
            if (next.defaultView.scrollY <= 0) throw new Error('Reveal the offscreen container.');
        });
        await check(`${mode}: control attributes and duplicate widget IDs do not determine the container fallback`, async (scrolling, doc) => {
            const markup = (text) => `<section id="context"><button aria-controls="panel">One</button><button aria-controls="panel">Two</button>
                <div id="panel" hidden><p>${text}</p></div><div id="panel" hidden>Unchanged duplicate</div></section>`;
            const previous = await doc(markup('Before'), { captured });
            const next = await doc(markup('After'), { captured });
            equal(scrolling.findTarget(previous, next), next.querySelector('#context'), 'Follow the changed node ancestry, not a relationship lookup.');
        });
        await check(`${mode}: direct visible edits take precedence over hidden-container fallbacks`, async (scrolling, doc) => {
            const noise = (text) => `<section><h2>Unchanged status</h2><div hidden>${text}</div></section>`;
            const previous = await doc(noise('Generated before') + content(), { captured });
            const next = await doc(noise('Generated after') + content('Changed paragraph'), { captured });
            equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'A hidden change must not compete with an identifiable visible edit.');
        });
        await check(`${mode}: hidden insertions and deletions do not compete with a direct visible edit`, async (scrolling, doc) => {
            const previous = await doc('<div hidden>Generated value</div>' + content(), { captured });
            const deleted = await doc(content('Changed paragraph'), { captured });
            equal(scrolling.findTarget(previous, deleted), deleted.querySelector('#edited'), 'A hidden deletion must not promote an unchanged neighboring paragraph.');
            const inserted = await doc('<div hidden>Generated again</div>' + content('Changed again'), { captured });
            equal(scrolling.findTarget(deleted, inserted), inserted.querySelector('#edited'), 'A hidden insertion must remain a lower-priority container fallback.');
        });
        await check(`${mode}: separate hidden changes with different visible containers preserve position`, async (scrolling, doc) => {
            const region = (heading, text) => `<section><h2>${heading}</h2><div hidden><p>${text}</p></div></section>`;
            const previous = await doc(region('First', 'Before one') + section('Middle') + region('Last', 'Before two'), { captured });
            const next = await doc(region('First', 'After one') + section('Middle') + region('Last', 'After two'), { captured });
            equal(scrolling.findTarget(previous, next), null, 'Do not guess between competing container fallbacks.');
        });
        await check(`${mode}: hidden insertions and deletions use their local visible container`, async (scrolling, doc) => {
            const markup = (inside) => `<section id="context"><h2>Context</h2><div hidden>${inside}</div></section>`;
            const previous = await doc(markup(''), { captured });
            const inserted = await doc(markup('<p>Inserted text</p>'), { captured });
            equal(scrolling.findTarget(previous, inserted), inserted.querySelector('#context'), 'A hidden insertion still has visible context.');
            const deleted = await doc(markup(''), { captured });
            equal(scrolling.findTarget(inserted, deleted), deleted.querySelector('#context'), 'A hidden deletion stays within the surviving local context.');
        });
    }
    await check('boxless inserted wrappers reveal their visible content instead of main', async (scrolling, doc) => {
        const previous = await doc(section('First') + section('Last'));
        const next = await doc(section('First') + '<section style="display:contents"><h2>Inserted</h2><p>New content</p></section>' + section('Last'));
        equal(scrolling.findTarget(previous, next), next.querySelectorAll('section')[1].querySelector('h2'), 'A display:contents wrapper can be followed through its own visible descendants.');
    });
    await check('inserted empty layout elements are still detectable', async (scrolling, doc) => {
        const previous = await doc(section('First') + section('Last'));
        const next = await doc(section('First') + '<div style="height:80px"></div>' + section('Last'));
        equal(scrolling.findTarget(previous, next), next.querySelector('main > div'), 'Structure-only edits do not require text or media.');
    });
    await check('independent presentation changes are also ambiguous', async (scrolling, doc) => {
        const previous = await doc(section('First') + section('Middle') + section('Last'));
        const next = await doc(section('First') + section('Middle') + section('Last'));
        next.querySelector('section').className = 'runtime-ready';
        next.querySelectorAll('section')[2].className = 'has-text-align-right';
        equal(scrolling.findTarget(previous, next), null, 'Do not guess which of multiple presentation-only changes came from the editor.');
    });
    for (const captured of [false, true]) {
        const mode = captured ? 'captured source' : 'DOM fallback';
        const diagnostic = (value) => `<table class="xdebug-error xe-warning"><tr><th>Warning: missing asset</th></tr>${
            Array.from({ length: 6 }, (_, index) => `<tr><td>${index}</td><td>${value}-${index}</td></tr>`).join('')
        }</table>`;
        await check(`${mode}: Xdebug timings do not veto the edited paragraph`, async (scrolling, doc) => {
            const previous = await doc(content() + diagnostic('0.1234'), { captured });
            const next = await doc(content('Changed paragraph') + diagnostic('0.5678'), { captured });
            const warning = next.querySelector('table.xdebug-error');
            const html = warning.outerHTML;
            const target = scrolling.findTarget(previous, next);
            equal(target, next.querySelector('#edited'), 'Per-request diagnostic rows are not a second author edit.');
            scrolling.restore(next, target);
            equal(warning.outerHTML, html, 'Comparison must not suppress or rewrite the warning.');
            if (!warning.getClientRects().length) throw new Error('Leave the diagnostic output visible.');
        });
        await check(`${mode}: diagnostic-only changes preserve positioning`, async (scrolling, doc) => {
            const previous = await doc(content() + diagnostic('0.1234'), { captured });
            const next = await doc(content() + diagnostic('0.5678'), { captured });
            previous.defaultView.scrollTo(0, 60);
            scrolling.remember(previous);
            const target = scrolling.findTarget(previous, next);
            equal(target, null, 'A changing warning is not content to follow.');
            scrolling.restore(next, target);
            equal(next.defaultView.scrollY, 60, 'Keep the reader position for diagnostic-only updates.');
        });
        await check(`${mode}: diagnostic noise does not hide a presentation-only edit`, async (scrolling, doc) => {
            const previous = await doc(content() + diagnostic('0.1234'), { captured });
            const next = await doc(content().replace('id="edited"', 'id="edited" class="has-text-align-right"')
                + diagnostic('0.5678'), { captured });
            equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'Exclude diagnostics before deciding whether content or presentation changed.');
        });
        await check(`${mode}: ordinary table edits still count and retain ambiguity`, async (scrolling, doc) => {
            const table = (value) => `<table class="article-data xe-warning"><tr><td>${value}</td></tr><tr><td>Unchanged row</td></tr></table>`;
            const previous = await doc(content() + table('Original value'), { captured });
            const next = await doc(content() + table('Edited value'), { captured });
            equal(scrolling.findTarget(previous, next), next.querySelector('td'), 'Normal data tables, even with a warning class, are author content.');
            const separate = await doc(content('Changed paragraph') + table('Edited value'), { captured });
            equal(scrolling.findTarget(previous, separate), null, 'Two genuine edits must not become a guessed target.');
        });
    }
    for (const captured of [false, true]) {
        const mode = captured ? 'captured source' : 'DOM fallback';
        await check(`${mode}: configured exclusions cover complete runtime subtrees`, async (scrolling, doc) => {
            const runtime = (value) => `<section data-vendor-runtime><p>${value} one</p><p>${value} two</p></section>`;
            const previous = await doc(content() + runtime('Before'), { captured });
            const next = await doc(content('Changed paragraph') + runtime('After'), { captured });
            equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'A configured runtime region must not compete with the author edit.');
            equal(next.querySelector('[data-vendor-runtime]').textContent, 'After oneAfter two', 'Exclusions must leave rendered output intact.');
        }, [...defaults, '[data-vendor-runtime]']);
        await check(`${mode}: replacement policies do not restore built-in navigation exclusions`, async (scrolling, doc) => {
            const previous = await doc('<nav><p id="edited">Before</p></nav><aside class="runtime"><p>Noise one</p></aside>', { captured });
            const next = await doc('<nav><p id="edited">After</p></nav><aside class="runtime"><p>Noise two</p></aside>', { captured });
            equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'Use the complete configured policy, not additional exclusions merged with hidden defaults.');
        }, ['.runtime']);
        await check(`${mode}: an empty policy deliberately removes every exclusion`, async (scrolling, doc) => {
            const previous = await doc('<nav><p id="edited">Before</p></nav>', { captured });
            const next = await doc('<nav><p id="edited">After</p></nav>', { captured });
            equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'Empty lists must not be replaced with defaults or passed as invalid empty CSS.');
        }, []);
        await check(`${mode}: callers may remove the shipped Xdebug exclusion`, async (scrolling, doc) => {
            const table = (text) => `<table class="xdebug-error"><tr><td>${text}</td></tr></table>`;
            const previous = await doc(content() + table('Before'), { captured });
            const next = await doc(content() + table('After'), { captured });
            equal(scrolling.findTarget(previous, next), next.querySelector('td'), 'Xdebug is default configuration, not a special case in the matcher.');
        }, defaults.filter((selector) => selector !== 'table.xdebug-error'));
        await check(`${mode}: invalid selectors do not disable valid exclusions or scrolling`, async (scrolling, doc) => {
            const previous = await doc(content() + '<nav><p>Before</p></nav>', { captured });
            const next = await doc(content('Changed paragraph') + '<nav><p>After</p></nav>', { captured });
            const target = scrolling.findTarget(previous, next);
            equal(target, next.querySelector('#edited'), 'Reject malformed contributions without losing the valid policy.');
            scrolling.restore(next, target);
            if (next.defaultView.scrollY <= 0) throw new Error('Invalid selectors must not prevent revealing the change.');
        }, ['nav', '[broken', null, 42, '', '  ']);
    }
    await check('long pages retain section context for a late nested edit', async (scrolling, doc) => {
        const sections = Array.from({ length: 1500 }, (_, index) => section(`Section ${index}`));
        const previous = await doc(sections.join(''));
        sections[1490] = section('Section 1490', 'Edited near the end');
        const next = await doc(sections.join(''));
        equal(scrolling.findTarget(previous, next), next.querySelectorAll('section p')[1490], 'Long pages must not lose the late edit among repeated paragraphs.');
    });
    await check('captured source excludes script initialization text and class noise', async (scrolling, doc) => {
        const previous = await doc(section('Status', 'Server status') + content(), {
            captured: true, script: `document.querySelector('section p').textContent = 'Runtime status 1'; document.body.className = 'runtime-one';`,
        });
        const next = await doc(section('Status', 'Server status') + content('Changed paragraph'), {
            captured: true, script: `document.querySelector('section p').textContent = 'Runtime status 2'; document.body.className = 'runtime-two';`,
        });
        equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'Compare response content rather than initialization mutations already present at load.');
    });
    await check('unchanged captured source ignores runtime-only changes and response-local marker numbering', async (scrolling, doc) => {
        const previous = await doc(content(), { captured: true, script: `document.querySelector('#edited').textContent = 'Runtime 1';` });
        const next = await doc(content(), { captured: true, offset: 20, script: `document.querySelector('#edited').textContent = 'Runtime 2';` });
        equal(scrolling.findTarget(previous, next), null, 'Neither runtime output nor annotation IDs are editor changes.');
    });
    await check('source-only presentation edits remain detectable despite unrelated runtime styles', async (scrolling, doc) => {
        const previous = await doc(content(), { captured: true });
        const next = await doc(content().replace('id="edited"', 'id="edited" class="has-text-align-right"'), {
            captured: true, script: `document.body.style.backgroundColor = 'red';`,
        });
        equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'The actual response class change takes precedence over initialization styling.');
    });
    await check('source identities locate live elements moved and wrapped by scripts', async (scrolling, doc) => {
        const previous = await doc(content(), { captured: true });
        const next = await doc(content('Changed paragraph'), {
            captured: true, script: `const wrapper = document.createElement('aside'); document.body.prepend(wrapper); wrapper.append(document.querySelector('#edited'));`,
        });
        equal(scrolling.findTarget(previous, next), next.querySelector('aside > #edited'), 'Do not depend on a live child-index path surviving theme initialization.');
    });
    await check('source elements replaced without their identities do not invent a live target', async (scrolling, doc) => {
        const previous = await doc(content(), { captured: true });
        const next = await doc(content('Changed paragraph'), {
            captured: true, script: `document.querySelector('#edited').outerHTML = '<p id="replacement">Script-generated replacement</p>';`,
        });
        equal(scrolling.findTarget(previous, next), null, 'A missing source element must not promote an unrelated ancestor.');
    });
    await check('cloned source identities are ambiguous instead of selecting the first clone', async (scrolling, doc) => {
        const previous = await doc(content(), { captured: true });
        const next = await doc(content('Changed paragraph'), {
            captured: true, script: `const node = document.querySelector('#edited'); node.after(node.cloneNode(true));`,
        });
        equal(scrolling.findTarget(previous, next), null, 'Multiple live copies cannot identify which instance should be revealed.');
    });
    await check('capture availability changes establish a new baseline without mixed-source comparisons', async (scrolling, doc) => {
        const captured = await doc(content(), { captured: true });
        const fallback = await doc(content('Changed paragraph'));
        equal(scrolling.findTarget(captured, fallback), null, 'Do not compare old source HTML against a new live DOM.');
        const capturedAgain = await doc(content('Another change'), { captured: true });
        equal(scrolling.findTarget(fallback, capturedAgain), null, 'Do not compare an old live DOM against new source HTML.');
        const next = await doc(content('Final change'), { captured: true });
        equal(scrolling.findTarget(capturedAgain, next), next.querySelector('#edited'), 'Following resumes once both snapshots use the same representation.');
    });
    await check('malformed or mismatched source data uses the existing DOM fallback', async (scrolling, doc) => {
        const previous = await doc(content());
        for (const payload of ['invalid JSON', JSON.stringify({ html: 'wrong shape' }), JSON.stringify('<main>Missing authorization marker</main>')]) {
            const next = await doc(content('Changed paragraph'));
            next.querySelector('meta').setAttribute('data-aflpp-source', payload);
            equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'Invalid source data must not break an otherwise usable HTML preview.');
        }
    });
    await check('long captured pages retain live identity mapping for a late nested edit', async (scrolling, doc) => {
        const sections = Array.from({ length: 1500 }, (_, index) => section(`Section ${index}`));
        const previous = await doc(sections.join(''), { captured: true });
        sections[1490] = section('Section 1490', 'Edited near the end');
        const next = await doc(sections.join(''), { captured: true });
        equal(scrolling.findTarget(previous, next), next.querySelectorAll('section p')[1490], 'Source parsing and live lookup must work on long pages too.');
    });
    await check('large captured pages retain clean-source comparison instead of reverting to runtime noise', async (scrolling, doc) => {
        const padding = `<!--${' '.repeat(4 * 1024 * 1024)}-->`;
        const previous = await doc(padding + content(), {
            captured: true, script: 'document.querySelector("p").textContent = "Runtime before";',
        });
        scrolling.restore(previous);
        const next = await doc(padding + content('Changed paragraph'), {
            captured: true, script: 'document.querySelector("p").textContent = "Runtime after";',
        });
        equal(scrolling.findTarget(previous, next), next.querySelector('#edited'), 'Payload size must not silently reintroduce frontend initialization noise.');
    });
    await check('reading captured snapshots never executes their scripts a second time', async (scrolling, doc) => {
        window.aflppSourceScriptRuns = 0;
        const script = 'parent.aflppSourceScriptRuns += 1;';
        const previous = await doc(content(), { captured: true, script });
        const next = await doc(content('Changed paragraph'), { captured: true, script });
        equal(window.aflppSourceScriptRuns, 2, 'Normal iframe initialization still executes once per page.');
        const target = scrolling.findTarget(previous, next);
        scrolling.restore(next, target);
        equal(window.aflppSourceScriptRuns, 2, 'Parsing and caching the source must not execute it.');
        delete window.aflppSourceScriptRuns;
    });
    return results;
}

test('preview scrolling matches changed sections conservatively in Chromium', async (t) => {
    const source = await readFile(new URL('../src/preview/scroll.js', import.meta.url), 'utf8');
    await runChromiumTests(t, { script: `(${browserTests.toString()})(${JSON.stringify(source)})`, count: 63 });
});
