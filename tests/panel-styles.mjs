import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runChromiumTests } from './helpers/chromium.mjs';

function browserTests({ core, panel }) {
    const style = document.createElement('style');
    style.textContent = `${core}\n${panel}`;
    document.head.append(style);
    const shell = document.createElement('section');
    shell.className = 'aflpp-panel';
    shell.innerHTML = '<button class="components-button has-icon aflpp-icon" type="button">Refresh</button>';
    const reference = document.createElement('button');
    reference.type = 'button';
    reference.className = 'components-button has-icon';
    reference.textContent = 'Native button';
    document.body.append(shell, reference);
    const button = shell.querySelector('button');
    const results = [];
    const properties = ['color', 'backgroundColor', 'cursor', 'outlineStyle', 'outlineColor', 'outlineWidth', 'boxShadow', 'opacity'];
    const appearance = (element) => properties.map((property) => getComputedStyle(element)[property]);
    for (const state of ['normal', 'disabled', 'aria-disabled', 'focused', 'pressed']) {
        const name = `panel icon retains native WordPress ${state} appearance`;
        try {
            for (const element of [button, reference]) {
                element.disabled = state === 'disabled';
                element.toggleAttribute('aria-disabled', state === 'aria-disabled');
                if (state === 'aria-disabled') element.setAttribute('aria-disabled', 'true');
                element.classList.toggle('is-pressed', state === 'pressed');
            }
            if (state === 'focused') button.focus();
            const actual = appearance(button);
            if (state === 'focused') reference.focus();
            const expected = appearance(reference);
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Panel appearance ${JSON.stringify(actual)} must match native ${JSON.stringify(expected)}.`);
            }
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { button.blur(); reference.blur(); }
    }
    const name = 'shared recovery text balances without changing captions or preview content';
    try {
        shell.innerHTML = `<span class="aflpp-caption">Preview title</span>
            <div class="aflpp-placeholder"><h2 class="aflpp-empty-title">Preview couldn’t load</h2>
                <div class="components-placeholder__instructions">Review your edits, then reload the editor.</div>
                <p class="aflpp-empty-note">Each tab keeps its own edits.</p></div>
            <div class="aflpp-feedback"><div class="components-notice__content"><p>Preview refresh failed.</p></div></div>
            <div class="aflpp-viewport"><p>Preview content is not panel status text.</p></div>`;
        for (const selector of ['.aflpp-empty-title', '.components-placeholder__instructions', '.aflpp-empty-note', '.components-notice__content p']) {
            if (getComputedStyle(shell.querySelector(selector)).textWrap !== 'balance') {
                throw new Error(`${selector} must use balanced wrapping.`);
            }
        }
        if (getComputedStyle(shell.querySelector('.aflpp-caption')).whiteSpace !== 'nowrap') {
            throw new Error('Keep the toolbar caption on one line.');
        }
        if (getComputedStyle(shell.querySelector('.aflpp-viewport p')).textWrap === 'balance') {
            throw new Error('Do not apply message wrapping to preview content.');
        }
        results.push({ name });
    } catch (error) { results.push({ name, error: error.message }); }
    finally { shell.remove(); reference.remove(); style.remove(); }
    return results;
}

test('panel styles preserve native component states and balance only shared messages in Chromium', async (t) => {
    const [core, panel] = await Promise.all([
        readFile(new URL('../node_modules/@wordpress/components/build-style/style.css', import.meta.url), 'utf8'),
        readFile(new URL('../build/classic-editor.css', import.meta.url), 'utf8'),
    ]);
    await runChromiumTests(t, { script: `(${browserTests.toString()})(${JSON.stringify({ core, panel })})`, count: 6 });
});
