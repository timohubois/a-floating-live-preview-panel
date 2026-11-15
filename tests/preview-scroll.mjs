import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runChromiumTests } from './helpers/chromium.mjs';

async function browserTests(source) {
    const { createPreviewScroll, createPreviewComparison, visibleTarget } = new Function(
        `${source.replace('export function', 'function')}\nreturn { createPreviewScroll, createPreviewComparison, visibleTarget };`,
    )();
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
        const comparison = createPreviewComparison(excludedSelectors), scrolling = createPreviewScroll();
        // Exercise the same composition as frame.js without exposing comparison state through scrolling.
        const frame = {
            comparison, scrolling, capture: comparison.capture, remember: scrolling.remember,
            findTarget(previous, next, values) {
                comparison.capture(previous);
                comparison.capture(next, values);
                return visibleTarget(comparison.findChange(previous, next));
            },
            restore(doc, element, values) {
                comparison.capture(doc, values);
                scrolling.restore(doc, element);
            },
        };
        try { await run(frame, documentFor); results.push({ name }); }
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
    // All author evidence is tied to the actual before/after submissions, not the latest UI state.
    const hints = (value, type = 'text') => ({ field: { type, value } });
    for (const captured of [false, true]) {
        const mode = captured ? 'collaborative captured source' : 'collaborative DOM';
        const options = { captured };
        const clock = (value) => `<aside><p>Request time ${value}</p></aside>`;
        const follow = (scrolling, before, after, oldValues, newValues) => {
            scrolling.capture(before, oldValues);
            return scrolling.findTarget(before, after, newValues);
        };
        await check(`${mode}: a paired input transition outranks changing diagnostics without their exclusion`, async (scrolling, doc) => {
            const table = (value) => `<table class="xdebug-error"><tr><td>${value}</td></tr></table>`;
            const before = await doc(content('Hello') + table('0.123'), options);
            const after = await doc(content('Welcome') + table('0.456'), options);
            equal(follow(scrolling, before, after, hints('Hello'), hints('Welcome')), after.querySelector('#edited'), 'Combine author intent with output differences, without vendor-specific matching.');
        }, defaults.filter((selector) => selector !== 'table.xdebug-error'));
        await check(`${mode}: unchanged input values are not author evidence`, async (scrolling, doc) => {
            const before = await doc(content('Hello') + clock(1), options);
            const after = await doc(content('Welcome') + clock(2), options);
            equal(follow(scrolling, before, after, hints('Welcome'), hints('Welcome')), null, 'Do not use every payload value as a search term.');
        });
        await check(`${mode}: repeated paired transitions retain ambiguity`, async (scrolling, doc) => {
            const before = await doc(section('One', 'Hello') + section('Separator') + section('Two', 'Hello'), options);
            const after = await doc(section('One', 'Welcome') + section('Separator') + section('Two', 'Welcome'), options);
            equal(follow(scrolling, before, after, hints('Hello'), hints('Welcome')), null, 'Exact input text is not proof of a unique output location.');
        });
        await check(`${mode}: whole-field HTML intent narrows to the edited paragraph`, async (scrolling, doc) => {
            const old = '<p>Introduction</p><p id="edited">Original paragraph</p><p>Conclusion</p>';
            const next = old.replace('Original', 'Changed');
            const before = await doc(old + clock(1), options), after = await doc(next + clock(2), options);
            equal(follow(scrolling, before, after, hints(old, 'html'), hints(next, 'html')), after.querySelector('#edited'), 'Do not scroll to the whole article because the submitted value contains it.');
        });
        await check(`${mode}: entities and inline markup normalize into useful text evidence`, async (scrolling, doc) => {
            const old = '<p>Tom &amp; <strong>bright</strong> friends</p>', next = old.replace('bright', 'cheerful');
            const before = await doc(old + clock(1), options), after = await doc(next + clock(2), options);
            equal(follow(scrolling, before, after, hints(old, 'html'), hints(next, 'html')), after.querySelector('strong'), 'Markup and entity serialization must not block the transition.');
        });
        await check(`${mode}: conditional output does not require a literal checkbox match`, async (scrolling, doc) => {
            const before = await doc(section('First') + section('Last'), options);
            const after = await doc(section('First') + section('Conditional') + section('Last'), options);
            equal(follow(scrolling, before, after, hints(false, 'value'), hints(true, 'value')), after.querySelectorAll('section')[1], 'Structural evidence remains usable without a text match.');
        });
        await check(`${mode}: strong hidden author intent outranks unrelated visible output`, async (scrolling, doc) => {
            const region = (text) => `<section id="context"><h2>Closed widget</h2><div hidden><p>${text}</p></div></section>`;
            const before = await doc(region('Hello') + clock(1), options), after = await doc(region('Welcome') + clock(2), options);
            equal(follow(scrolling, before, after, hints('Hello'), hints('Welcome')), after.querySelector('#context'), 'Identify first, then use visible ancestry; never open the widget.');
            equal(after.querySelector('[hidden]').hidden, true, 'Preserve native hidden state.');
        });
        await check(`${mode}: authored class intent can outrank unrelated content differences`, async (scrolling, doc) => {
            const old = '<p class="has-text-align-left">Article</p>', next = old.replace('left', 'right');
            const before = await doc(old + clock(1), options), after = await doc(next + clock(2), options);
            equal(follow(scrolling, before, after, hints(old, 'html'), hints(next, 'html')), after.querySelector('p'), 'Input evidence can strengthen presentation changes, not only text changes.');
        });
        await check(`${mode}: authored ARIA labels survive generated identity churn`, async (scrolling, doc) => {
            const region = (id, label) => `<button aria-controls="${id}" aria-label="${label}">Open</button><div id="${id}">Panel</div>`;
            const before = await doc(region('uuid-one', 'Read article'), options), after = await doc(region('uuid-two', 'Read story'), options);
            equal(follow(scrolling, before, after, hints('Read article'), hints('Read story')), after.querySelector('button'), 'Do not ignore all accessibility attributes.');
        });
        await check(`${mode}: meaningful ARIA remains evidence without editor hints`, async (scrolling, doc) => {
            const region = (id, label) => `<button aria-controls="${id}" aria-label="${label}">Open</button><div id="${id}">Panel</div>`;
            const before = await doc(region('uuid-one', 'Read article'), options), after = await doc(region('uuid-two', 'Read story'), options);
            equal(scrolling.findTarget(before, after), after.querySelector('button'), 'Revision-like callers still detect an unambiguous label change.');
        });
        await check(`${mode}: authored accessibility state changes are not blanket-normalized`, async (scrolling, doc) => {
            const before = await doc('<button aria-expanded="false">Open</button>', options);
            const after = await doc('<button aria-expanded="true">Open</button>', options);
            equal(scrolling.findTarget(before, after), after.querySelector('button'), 'An actual response ARIA-state change is eligible.');
        });
        await check(`${mode}: authored ID transitions remain eligible`, async (scrolling, doc) => {
            const before = await doc('<p id="old-anchor">Article</p>', options), after = await doc('<p id="new-anchor">Article</p>', options);
            equal(follow(scrolling, before, after, hints('old-anchor'), hints('new-anchor')), after.querySelector('p'), 'Generated-reference normalization must not discard an explicitly authored ID.');
        });
        await check(`${mode}: formatting-only HTML changes have input evidence`, async (scrolling, doc) => {
            const old = '<p><strong>Hello</strong></p>', next = '<p><em>Hello</em></p>';
            const before = await doc(old + clock(1), options), after = await doc(next + clock(2), options);
            equal(follow(scrolling, before, after, hints(old, 'html'), hints(next, 'html')), after.querySelector('em'), 'Identical text does not mean an unchanged editor value.');
        });
        await check(`${mode}: changed media markup strengthens the actual image candidate`, async (scrolling, doc) => {
            const old = '<img src="/before.jpg">', next = '<img src="/after.jpg">';
            const before = await doc(old + clock(1), options), after = await doc(next + clock(2), options);
            equal(follow(scrolling, before, after, hints(old, 'html'), hints(next, 'html')), after.querySelector('img'), 'Do not search attachment IDs as visible text.');
        });
        await check(`${mode}: unrelated substrings are not exact word transitions`, async (scrolling, doc) => {
            const before = await doc(content('catapult') + clock(1), options), after = await doc(content('dogmatic') + clock(2), options);
            equal(follow(scrolling, before, after, hints('cat'), hints('dog')), null, 'A substring inside another word is weak evidence, not confirmation.');
        });
        await check(`${mode}: newly submitted textual fields can support an insertion`, async (scrolling, doc) => {
            const before = await doc(section('First') + section('Last') + clock(1), options);
            const after = await doc(section('First') + section('Added text') + section('Last') + clock(2), options);
            equal(follow(scrolling, before, after, {}, hints('Added text')), after.querySelectorAll('section')[1], 'New repeater fields need not exist in the previous submission.');
        });
        for (const noiseFirst of [false, true]) {
            await check(`${mode}: insertion evidence stays with its matching sibling, noise first=${noiseFirst}`, async (scrolling, doc) => {
                const before = await doc(section('First') + section('Last'), options);
                const noise = '<aside id="noise"><p>Runtime advertisement</p></aside>';
                const authored = '<section id="authored"><p>Added text</p></section>';
                const after = await doc(section('First') + (noiseFirst ? noise + authored : authored + noise) + section('Last'), options);
                equal(follow(scrolling, before, after, {}, hints('Added text')), after.querySelector('#authored'), 'Only the added sibling containing the submitted value has input support.');
            });
        }
        for (const hidden of [false, true]) {
            await check(`${mode}: equally supported inserted siblings remain ambiguous, hidden first=${hidden}`, async (scrolling, doc) => {
                const before = await doc(section('First') + section('Last'), options);
                const copies = `<section id="one" ${hidden ? 'hidden' : ''}><p>Added text</p></section><section id="two"><p>Added text</p></section>`;
                const after = await doc(section('First') + copies + section('Last'), options);
                scrolling.capture(before, {});
                scrolling.capture(after, hints('Added text'));
                equal(scrolling.comparison.findChange(before, after), null, 'Neither sibling order nor visibility establishes which authored copy to follow.');
            });
        }
        await check(`${mode}: a grouped insertion without literal hints retains its first local target`, async (scrolling, doc) => {
            const before = await doc(section('First') + section('Last'), options);
            const after = await doc(section('First') + section('Added one') + section('Added two') + section('Last'), options);
            equal(follow(scrolling, before, after, hints(false, 'value'), hints(true, 'value')), after.querySelectorAll('section')[1], 'Do not turn one unsupported insertion range into competing sibling candidates.');
        });
        await check(`${mode}: removed textual fields can support a deletion boundary`, async (scrolling, doc) => {
            const before = await doc(section('First') + section('Removed text') + section('Last') + clock(1), options);
            const after = await doc(section('First') + section('Last') + clock(2), options);
            equal(follow(scrolling, before, after, hints('Removed text'), {}), after.querySelectorAll('section')[1], 'Keep the local surviving boundary for a confirmed deletion.');
        });
        await check(`${mode}: ancestor text noise does not broaden the confirmed leaf target`, async (scrolling, doc) => {
            const before = await doc('<div>Request 1<p id="edited">Hello</p></div>', options);
            const after = await doc('<div>Request 2<p id="edited">Welcome</p></div>', options);
            equal(follow(scrolling, before, after, hints('Hello'), hints('Welcome')), after.querySelector('#edited'), 'Keep the smallest candidate explaining the same input transition.');
        });
    }
    await check('live DOM evidence confirms script-rendered content even when source text is unchanged', async (scrolling, doc) => {
        const before = await doc('<p id="edited">Placeholder</p><p>Clock 1</p>', { captured: true, script: "document.querySelector('#edited').textContent = 'Hello';" });
        const after = await doc('<p id="edited">Placeholder</p><p>Clock 2</p>', { captured: true, script: "document.querySelector('#edited').textContent = 'Welcome';" });
        scrolling.capture(before, hints('Hello'));
        equal(scrolling.findTarget(before, after, hints('Welcome')), after.querySelector('#edited'), 'Capture is not a gate excluding browser-rendered author output.');
    });
    await check('unchanged input hints do not legitimize runtime-only DOM mutations', async (scrolling, doc) => {
        const before = await doc(content(), { captured: true, script: "document.querySelector('#edited').textContent = 'Hello';" });
        const after = await doc(content(), { captured: true, script: "document.querySelector('#edited').textContent = 'Welcome';" });
        scrolling.capture(before, hints('Welcome'));
        equal(scrolling.findTarget(before, after, hints('Welcome')), null, 'A stable field is not evidence for a changing runtime widget.');
    });
    await check('input and live DOM can identify a genuinely replaced source node', async (scrolling, doc) => {
        const before = await doc('<p>Hello</p>', { captured: true });
        const after = await doc('<p>Welcome</p>', { captured: true, script: "document.querySelector('p').outerHTML = '<p id=\"replacement\">Welcome</p>';" });
        scrolling.capture(before, hints('Hello'));
        equal(scrolling.findTarget(before, after, hints('Welcome')), after.querySelector('#replacement'), 'Independent author/DOM correspondence may identify a replacement without guessing a source path.');
    });
    await check('cloned source identities plus repeated input matches still preserve position', async (scrolling, doc) => {
        const before = await doc(content('Hello'), { captured: true });
        const after = await doc(content('Welcome'), { captured: true, script: "const p = document.querySelector('#edited'); p.after(p.cloneNode(true));" });
        scrolling.capture(before, hints('Hello'));
        equal(scrolling.findTarget(before, after, hints('Welcome')), null, 'Do not turn exact text into invented certainty between live clones.');
    });
    await check('correlated source and DOM agreement is not an extra vote breaking a real text tie', async (scrolling, doc) => {
        const before = await doc('<p id="one">Hello</p><p id="two">Placeholder</p>', { captured: true, script: "document.querySelector('#two').textContent = 'Hello';" });
        const after = await doc('<p id="one">Welcome</p><p id="two">Placeholder</p>', { captured: true, script: "document.querySelector('#two').textContent = 'Welcome';" });
        scrolling.capture(before, hints('Hello'));
        equal(scrolling.findTarget(before, after, hints('Welcome')), null, 'Repeated output remains ambiguous even when one copy is server-rendered.');
    });
    await check('capture transitions may use independently paired DOM and input evidence', async (scrolling, doc) => {
        const before = await doc(content('Hello'), { captured: true });
        const after = await doc(content('Welcome'));
        scrolling.capture(before, hints('Hello'));
        equal(scrolling.findTarget(before, after, hints('Welcome')), after.querySelector('#edited'), 'Compare DOM to DOM, never captured HTML to DOM, across availability changes.');
    });
    await check('source-only author evidence remains useful when scripts transform its text', async (scrolling, doc) => {
        const script = "document.querySelector('#edited').textContent = 'Transformed output';";
        const before = await doc(content('Hello'), { captured: true, script });
        const after = await doc(content('Welcome'), { captured: true, script });
        scrolling.capture(before, hints('Hello'));
        equal(scrolling.findTarget(before, after, hints('Welcome')), after.querySelector('#edited'), 'DOM agreement is corroboration, not a requirement.');
    });
    await check('a unique transition inside an otherwise unaligned region can identify its live node', async (scrolling, doc) => {
        const before = await doc('<section><p>Hello</p><p>Other before</p></section>', { captured: true });
        const after = await doc('<section><h2>Other after</h2><p id="edited">Welcome</p><div>New structure</div></section>', { captured: true });
        scrolling.capture(before, hints('Hello'));
        equal(scrolling.findTarget(before, after, hints('Welcome')), after.querySelector('#edited'), 'Keep ambiguous rendered regions available for collaborative evidence.');
    });
    for (const captured of [false, true]) {
        const mode = captured ? 'captured' : 'DOM';
        await check(`${mode}: adding and removing an authored attribute can strengthen a candidate`, async (scrolling, doc) => {
            const old = '<p>Article</p>', next = '<p class="has-text-align-right">Article</p>';
            const before = await doc(old + '<p>Clock 1</p>', { captured });
            const after = await doc(next + '<p>Clock 2</p>', { captured });
            scrolling.capture(before, hints(old, 'html'));
            equal(scrolling.findTarget(before, after, hints(next, 'html')), after.querySelector('p'), 'An absent old attribute is a real state, not missing evidence.');
            const removed = await doc(old + '<p>Clock 3</p>', { captured });
            equal(scrolling.findTarget(after, removed, hints(old, 'html')), removed.querySelector('p'), 'Removing a value is eligible too.');
        });
        await check(`${mode}: wrapping existing text with formatting retains author evidence`, async (scrolling, doc) => {
            const old = '<p>Hello</p>', next = '<p><strong>Hello</strong></p>';
            const before = await doc(old + '<p>Clock 1</p>', { captured });
            const after = await doc(next + '<p>Clock 2</p>', { captured });
            scrolling.capture(before, hints(old, 'html'));
            equal(scrolling.findTarget(before, after, hints(next, 'html')), after.querySelector('p'), 'Changing the text-node structure can be the actual formatting edit.');
        });
        await check(`${mode}: filling an existing empty element still has author evidence`, async (scrolling, doc) => {
            const before = await doc('<p id="edited"></p><p>Clock 1</p>', { captured });
            const after = await doc('<p id="edited">Welcome</p><p>Clock 2</p>', { captured });
            scrolling.capture(before, hints(''));
            equal(scrolling.findTarget(before, after, hints('Welcome')), after.querySelector('#edited'), 'An empty old value need not be an insertion.');
        });
        await check(`${mode}: snapshots freeze their own submission values`, async (scrolling, doc) => {
            const before = await doc(content('Hello') + '<p>Clock 1</p>', { captured });
            const after = await doc(content('Welcome') + '<p>Clock 2</p>', { captured });
            const oldValues = hints('Hello');
            scrolling.capture(before, oldValues);
            oldValues.field.value = 'Welcome';
            equal(scrolling.findTarget(before, after, hints('Welcome')), after.querySelector('#edited'), 'Later mutations cannot rewrite the displayed baseline.');
        });
        await check(`${mode}: changed parent and child text remain genuinely competing evidence`, async (scrolling, doc) => {
            const before = await doc('<div>Hello<p>Hello</p></div>', { captured });
            const after = await doc('<div>Welcome<p>Welcome</p></div>', { captured });
            scrolling.capture(before, hints('Hello'));
            equal(scrolling.findTarget(before, after, hints('Welcome')), null, 'Do not minimize away an independently changed parent text node.');
        });
    }
    for (const captured of [false, true]) {
        await check(`unaligned existing values are not an input transition, captured=${captured}`, async (scrolling, doc) => {
            const before = await doc(section('One', 'Hello') + section('Two', 'Welcome'), { captured });
            const after = await doc(section('Two', 'Welcome') + section('One', 'Hello'), { captured });
            scrolling.capture(before, hints('Hello'));
            equal(scrolling.findTarget(before, after, hints('Welcome')), null, 'Do not match old/new strings merely because both exist in a reordered region.');
        });
    }
    for (const captured of [false, true]) {
        for (const nested of [false, true]) {
            for (const generatedIds of [false, true]) {
                await check(`attribute-only reorders do not invent an input transition, captured=${captured}, nested=${nested}, generated IDs=${generatedIds}`, async (scrolling, doc) => {
                    const item = (id, style) => nested
                        ? `<section id="${id}"><p class="${style}">Repeated content</p></section>`
                        : `<p id="${id}" class="${style}">Repeated content</p>`;
                    const first = item('one', 'old-style'), second = item('two', 'new-style');
                    const before = await doc(first + second, { captured });
                    const after = await doc(generatedIds ? item('three', 'new-style') + item('four', 'old-style') : second + first, { captured });
                    scrolling.capture(before, hints(first, 'html'));
                    equal(scrolling.findTarget(before, after, hints(first.replace('old-style', 'new-style'), 'html')), null, 'Existing presentation values only traded positions; reference churn does not prove an authored transition.');
                });
            }
        }
        await check(`reference-only reorders do not invent an authored ID transition, captured=${captured}`, async (scrolling, doc) => {
            const first = '<p id="old-anchor">Repeated content</p>', second = '<p id="new-anchor">Repeated content</p>';
            const before = await doc(first + second, { captured }), after = await doc(second + first, { captured });
            scrolling.capture(before, hints(first, 'html'));
            equal(scrolling.findTarget(before, after, hints(second, 'html')), null, 'Preserved authored references also distinguish a permutation from an applied edit.');
        });
        await check(`a genuine attribute edit among equal-content siblings remains identifiable, captured=${captured}`, async (scrolling, doc) => {
            const old = '<p id="edited" class="old-style">Repeated content</p>';
            const changed = old.replace('old-style', 'new-style');
            const sibling = '<p id="unchanged" class="new-style">Repeated content</p>';
            const before = await doc(old + sibling, { captured }), after = await doc(changed + sibling, { captured });
            scrolling.capture(before, hints(old, 'html'));
            equal(scrolling.findTarget(before, after, hints(changed, 'html')), after.querySelector('#edited'), 'Do not blanket-reject attribute changes on repeated content.');
        });
        await check(`an attribute-only reorder does not veto an independent paired text edit, captured=${captured}`, async (scrolling, doc) => {
            const first = '<p id="one" class="old-style">Repeated content</p>';
            const second = '<p id="two" class="new-style">Repeated content</p>';
            const before = await doc(first + second + '<p id="edited">Hello</p>', { captured });
            const after = await doc(second + first + '<p id="edited">Welcome</p>', { captured });
            scrolling.capture(before, hints('Hello'));
            equal(scrolling.findTarget(before, after, hints('Welcome')), after.querySelector('#edited'), 'An actual loss/gain transition can still identify the edited node.');
        });
    }
    await check('unapplied formatting intent does not confirm an unchanged paragraph inside a reorder', async (scrolling, doc) => {
        const before = await doc(section('One', 'Hello') + section('Two', 'Welcome'), { captured: true });
        const after = await doc(section('Two', 'Welcome') + section('One', 'Hello'), { captured: true });
        scrolling.capture(before, hints('<p>Hello</p>', 'html'));
        equal(scrolling.findTarget(before, after, hints('<p><strong>Hello</strong></p>', 'html')), null, 'Input intent must correspond to an actual output transition.');
    });
    await check('visibility cannot resolve repeated, equally corroborated author transitions', async (scrolling, doc) => {
        const before = await doc('<section><div hidden>Hello</div></section><p>Hello</p>', { captured: true });
        const after = await doc('<section><div hidden>Welcome</div></section><p>Welcome</p>', { captured: true });
        scrolling.capture(before, hints('Hello'));
        equal(scrolling.findTarget(before, after, hints('Welcome')), null, 'Identification remains ambiguous even when only one matching element is visible.');
    });
    await check('nonliteral input intent can support transformed DOM-only content', async (scrolling, doc) => {
        const before = await doc('<section></section>', { captured: true });
        const after = await doc('<section></section>', { captured: true, script: "document.querySelector('section').innerHTML = '<p id=\"conditional\">Conditional result</p>';" });
        scrolling.capture(before, hints(false, 'value'));
        equal(scrolling.findTarget(before, after, hints(true, 'value')), after.querySelector('#conditional'), 'Known author intent and structural DOM output collaborate without a literal boolean search.');
    });
    await check('nonliteral input intent does not turn an unrelated runtime class into sufficient evidence', async (scrolling, doc) => {
        const before = await doc(content(), { captured: true, script: "document.body.className = 'runtime-before';" });
        const after = await doc(content(), { captured: true, script: "document.body.className = 'runtime-after';" });
        scrolling.capture(before, hints(false, 'value'));
        equal(scrolling.findTarget(before, after, hints(true, 'value')), null, 'Author intent alone does not identify an animation class.');
    });
    await check('native-navigation baselines do not retain unrelated editor values', async (scrolling, doc) => {
        const old = await doc(content('Hello'), { captured: true });
        scrolling.capture(old, hints('Hello'));
        const navigated = await doc(content('Other page'), { captured: true });
        scrolling.capture(navigated);
        const next = await doc(content('Welcome') + '<p>Another changed value</p>', { captured: true });
        equal(scrolling.findTarget(navigated, next, hints('Welcome')), null, 'A document without submitted values cannot inherit the prior page intent.');
    });
    await check('comparison exposes only capture and single-element identification; scrolling owns no snapshots', async (frame, doc) => {
        equal(Object.keys(frame.comparison).sort().join(','), 'capture,findChange', 'No snapshot/candidate API escapes.');
        equal(Object.keys(frame.scrolling).sort().join(','), 'remember,restore', 'Scroll presentation has no comparison lifecycle.');
        const before = await doc(content('Hello'), { captured: true });
        const after = await doc(content('Welcome'), { captured: true });
        equal(frame.comparison.findChange(before, after), null, 'Only explicit frame capture may establish a baseline.');
        equal(frame.comparison.capture(before, hints('Hello')), undefined, 'Capture does not expose a snapshot tree.');
        equal(frame.comparison.capture(after, hints('Welcome')), undefined, 'Capture remains a lifecycle operation.');
        equal(frame.comparison.findChange(before, after), after.querySelector('#edited'), 'Return an actual live element, not a result collection.');
    });
    await check('comparison returns the hidden changed element; scrolling alone reveals its ancestor', async (frame, doc) => {
        const markup = (text) => `${content()}<section id="context"><h2>Closed widget</h2><div hidden><p id="hidden-change">${text}</p></div></section>`;
        const before = await doc(markup('Hello'), { captured: true });
        const after = await doc(markup('Welcome'), { captured: true });
        frame.comparison.capture(before, hints('Hello'));
        frame.comparison.capture(after, hints('Welcome'));
        const identified = frame.comparison.findChange(before, after);
        equal(identified, after.querySelector('#hidden-change'), 'Identification must not substitute a visible ancestor.');
        const container = after.querySelector('#context'), original = container.outerHTML;
        frame.scrolling.restore(after, identified);
        if (after.defaultView.scrollY <= 0) throw new Error('Scroll presentation should reveal the offscreen ancestor.');
        equal(container.outerHTML, original, 'Neither owner opens or rewrites the hidden widget.');
    });
    await check('comparison resolves deletion to a surviving element, not a deletion instruction', async (frame, doc) => {
        const before = await doc(section('First') + section('Removed') + section('Last'), { captured: true });
        const after = await doc(section('First') + section('Last'), { captured: true });
        frame.comparison.capture(before);
        frame.comparison.capture(after);
        equal(frame.comparison.findChange(before, after), after.querySelectorAll('section')[1], 'Scrolling never interprets deleted entries or sibling arrays.');
    });
    await check('comparison does not scroll, restore styles or reveal hidden ancestors', async (frame, doc) => {
        const before = await doc(content('Hello'), { captured: true });
        const after = await doc(content('Welcome'), { captured: true });
        frame.comparison.capture(before, hints('Hello'));
        frame.comparison.capture(after, hints('Welcome'));
        after.defaultView.scrollTo(0, 40);
        const html = after.documentElement.outerHTML;
        const position = after.defaultView.scrollY;
        frame.comparison.findChange(before, after);
        equal(after.defaultView.scrollY, position, 'Identification must not change viewport position.');
        equal(after.documentElement.outerHTML, html, 'Identification is read-only.');
    });
    await check('scroll restoration does not parse captured source or freeze an editor baseline', async (frame, doc) => {
        const document = await doc(content(), { captured: true });
        let reads = 0;
        const marker = document.querySelector('meta');
        marker.getAttribute = () => { reads++; throw new Error('Source access is not scroll presentation.'); };
        frame.scrolling.restore(document, document.querySelector('#edited'));
        equal(reads, 0, 'No comparison source is read during restoration.');
        if (document.defaultView.scrollY <= 0) throw new Error('Scroll presentation works independently of comparison.');
    });
    for (const captured of [false, true]) {
        for (const custom of [false, true]) {
            await check(`boxless insertions preserve their comparison-eligible descendant, captured=${captured}, custom policy=${custom}`, async (frame, doc) => {
                const before = await doc(section('First') + section('Last'), { captured });
                const excluded = custom ? '<div class="runtime" id="excluded">Runtime content</div>' : '<nav id="excluded">Navigation</nav>';
                const after = await doc(section('First') + `<section id="wrapper" style="display:contents">${excluded}<p id="authored">Added text</p></section>` + section('Last'), { captured });
                frame.comparison.capture(before);
                frame.comparison.capture(after);
                const identified = frame.comparison.findChange(before, after);
                equal(identified, after.querySelector('#authored'), 'Keep the eligible mapped child instead of returning an undifferentiated boxless wrapper.');
                equal(visibleTarget(identified), after.querySelector('#authored'), 'Scroll presentation must not reintroduce an excluded descendant.');
            }, custom ? ['.runtime'] : defaults);
        }
    }
    await check('boxless source wrappers retain independently mapped children moved by frontend scripts', async (frame, doc) => {
        const before = await doc(section('First') + section('Last'), { captured: true });
        const after = await doc(section('First') + '<section id="inserted" style="display:contents"><h2 id="moved">Inserted</h2></section>' + section('Last'), {
            captured: true, script: "const aside = document.createElement('aside'); document.body.append(aside); aside.append(document.querySelector('#moved'));",
        });
        frame.comparison.capture(before);
        frame.comparison.capture(after);
        equal(frame.comparison.findChange(before, after), after.querySelector('aside > #moved'), 'Do not lose source/live correspondence when reducing to one element.');
    });
    return results;
}

test('preview scrolling matches changed sections conservatively in Chromium', async (t) => {
    const comparison = await readFile(new URL('../src/preview/comparison.js', import.meta.url), 'utf8');
    const scrolling = await readFile(new URL('../src/preview/scroll.js', import.meta.url), 'utf8');
    const source = `${comparison.replace('export function', 'function')}\n${scrolling.replace(/^import .*;\n/, '')}`;
    await runChromiumTests(t, { script: `(${browserTests.toString()})(${JSON.stringify(source)})`, count: 158 });
});
