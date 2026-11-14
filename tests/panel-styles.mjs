import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runChromiumTests } from './helpers/chromium.mjs';
import { panelStrings } from './helpers/panel-strings.mjs';

function browserTests({ core, panel, strings }) {
    const style = document.createElement('style');
    style.textContent = `${core}\n${panel}`;
    document.head.append(style);
    const shell = document.createElement('section');
    shell.className = 'aflpp-panel';
    shell.innerHTML = `<header class="aflpp-header"><button class="components-button has-icon is-compact aflpp-icon" type="button" aria-label="${strings.refresh}"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg></button></header>
        <footer class="aflpp-devicebar"></footer>`;
    const reference = document.createElement('button');
    reference.type = 'button';
    reference.className = 'components-button has-icon is-compact';
    reference.setAttribute('aria-label', 'Native compact button');
    reference.innerHTML = shell.querySelector('button').innerHTML;
    document.body.append(shell, reference);
    const button = shell.querySelector('button');
    const results = [];
    const properties = ['color', 'backgroundColor', 'cursor', 'outlineStyle', 'outlineColor', 'outlineWidth', 'boxShadow', 'opacity', 'width', 'minWidth', 'height', 'padding', 'borderRadius'];
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
    const shortcut = document.createElement('div');
    shortcut.className = 'aflpp-pip-control';
    shortcut.innerHTML = '<div class="aflpp-pip-surface"><button class="components-button has-icon aflpp-pip-button" aria-label="Picture-in-picture">' + reference.innerHTML + '</button></div>';
    shell.append(shortcut);
    const pip = shortcut.querySelector('button');
    const nativeAction = reference.cloneNode(true);
    nativeAction.classList.remove('is-compact');
    document.body.append(nativeAction);
    for (const state of ['normal', 'disabled', 'aria-disabled', 'focused', 'pressed']) {
        const name = `PiP action retains native WordPress ${state} appearance`;
        try {
            for (const element of [pip, nativeAction]) {
                element.disabled = state === 'disabled';
                element.toggleAttribute('aria-disabled', state === 'aria-disabled');
                if (state === 'aria-disabled') element.setAttribute('aria-disabled', 'true');
                element.classList.toggle('is-pressed', state === 'pressed');
            }
            if (state === 'focused') pip.focus();
            const actual = appearance(pip);
            if (state === 'focused') nativeAction.focus();
            if (JSON.stringify(actual) !== JSON.stringify(appearance(nativeAction))) {
                throw new Error('Keep native PiP button geometry, colors, corners, disabled and focus states.');
            }
            if (getComputedStyle(shortcut.firstElementChild).backgroundColor !== 'rgb(255, 255, 255)') {
                throw new Error('Keep contrast on a separate opaque backing, not a custom button fill.');
            }
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { pip.blur(); nativeAction.blur(); }
    }
    shortcut.remove(); nativeAction.remove();
    {
        const name = 'header and footer share the opaque panel surface and retain separator borders';
        try {
            if (getComputedStyle(shell).backgroundColor !== 'rgb(255, 255, 255)') {
                throw new Error('Keep the panel surface opaque and white.');
            }
            for (const mode of ['', 'aflpp-expanded', 'aflpp-pip']) {
                shell.className = `aflpp-panel ${mode}`;
                for (const [selector, edge] of [['.aflpp-header', 'Bottom'], ['.aflpp-devicebar', 'Top']]) {
                    const chrome = getComputedStyle(shell.querySelector(selector));
                    if (chrome.backgroundColor !== 'rgba(0, 0, 0, 0)' || chrome.backgroundImage !== 'none') {
                        throw new Error(`${mode} ${selector} must use the panel surface without its own background.`);
                    }
                    if (chrome[`border${edge}Width`] !== '1px' || chrome[`border${edge}Style`] !== 'solid') {
                        throw new Error(`${mode} ${selector} must retain its thin separator border.`);
                    }
                    if (mode === 'aflpp-pip' && chrome.borderRadius !== '0px') {
                        throw new Error('Keep PiP chrome flush with the browser window.');
                    }
                }
                if (mode === 'aflpp-pip' && getComputedStyle(shell).boxShadow !== 'none') {
                    throw new Error('PiP must not retain the floating panel shadow.');
                }
            }
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { shell.className = 'aflpp-panel'; }
    }
    {
        const name = 'floating panel follows the native popover surface and WordPress design tokens';
        const surface = document.createElement('div');
        surface.className = 'components-popover__content';
        document.body.append(surface);
        try {
            const actual = getComputedStyle(shell), expected = getComputedStyle(surface);
            if (actual.borderRadius !== expected.borderRadius || actual.backgroundColor !== expected.backgroundColor) {
                throw new Error('Match native popover corners and background.');
            }
            // Legacy core and the newer package use slightly different neutral ring colors.
            const shadows = (value) => value.split(/,\s*(?![^()]*\))/).slice(1).join(',');
            if (shadows(actual.boxShadow) !== shadows(expected.boxShadow) || actual.boxShadow === 'none') {
                throw new Error(`Match native popover elevation: ${actual.boxShadow} versus ${expected.boxShadow}.`);
            }
            shell.style.setProperty('--wpds-border-radius-md', '8px');
            shell.style.setProperty('--wpds-color-stroke-surface-neutral', 'rgb(120, 120, 120)');
            shell.style.setProperty('--wpds-color-background-surface-neutral-strong', 'rgb(250, 250, 250)');
            if (actual.borderRadius !== '8px' || actual.backgroundColor !== 'rgb(250, 250, 250)'
                || getComputedStyle(shell.querySelector('.aflpp-header')).borderBottomColor !== 'rgb(120, 120, 120)') {
                throw new Error('Follow WordPress surface tokens when provided.');
            }
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { shell.removeAttribute('style'); surface.remove(); }
    }
    {
        const name = 'retained-preview notices preserve native padding, typography and text wrapping';
        const content = '<div class="components-notice is-warning"><div class="components-notice__content"><p>Preview could not refresh.</p></div><div class="components-notice__actions"></div></div>';
        const feedback = document.createElement('div');
        feedback.className = 'aflpp-feedback';
        feedback.innerHTML = content;
        shell.append(feedback);
        const comparison = document.createElement('div');
        comparison.style.font = getComputedStyle(shell).font;
        comparison.innerHTML = content;
        document.body.append(comparison);
        try {
            for (const [selector, properties] of [
                ['.components-notice', ['padding', 'fontSize', 'fontFamily', 'lineHeight']],
                ['.components-notice__content', ['fontSize', 'fontFamily', 'lineHeight', 'textWrap']],
                ['.components-notice__actions', ['marginTop']],
                ['p', ['margin', 'fontWeight']],
            ]) {
                const actual = getComputedStyle(feedback.querySelector(selector));
                const expected = getComputedStyle(comparison.querySelector(selector));
                for (const property of properties) {
                    if (actual[property] !== expected[property]) throw new Error(`${selector} ${property} must remain native.`);
                }
            }
            if (getComputedStyle(feedback.querySelector('p')).textWrap === 'balance') {
                throw new Error('Do not balance operational notice paragraphs.');
            }
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { feedback.remove(); comparison.remove(); }
    }
    const name = 'shared recovery text balances without changing captions or preview content';
    try {
        shell.innerHTML = `<h2 id="aflpp-title" class="aflpp-caption">Preview title</h2>
            <div class="aflpp-placeholder"><h3 class="aflpp-empty-title">${strings.failed}</h3>
                <div class="components-placeholder__instructions">${strings.reviewBeforeReload}</div>
                <p class="aflpp-empty-note">${strings.tabEdits}</p></div>
            <div class="aflpp-feedback"><div class="components-notice__content"><p>${strings.refreshFailed}</p></div></div>
            <div class="aflpp-viewport"><p>Preview content is not panel status text.</p></div>`;
        for (const selector of ['.aflpp-empty-title', '.components-placeholder__instructions', '.aflpp-empty-note']) {
            if (getComputedStyle(shell.querySelector(selector)).textWrap !== 'balance') {
                throw new Error(`${selector} must use balanced wrapping.`);
            }
        }
        const captionStyle = getComputedStyle(shell.querySelector('.aflpp-caption'));
        const panelStyle = getComputedStyle(shell);
        if (captionStyle.whiteSpace !== 'nowrap') {
            throw new Error('Keep the toolbar caption on one line.');
        }
        if (captionStyle.font !== panelStyle.font || captionStyle.color !== panelStyle.color || captionStyle.margin !== '0px') {
            throw new Error('The semantic heading must retain the caption typography and spacing.');
        }
        if (getComputedStyle(shell.querySelector('.aflpp-viewport p')).textWrap === 'balance') {
            throw new Error('Do not apply message wrapping to preview content.');
        }
        results.push({ name });
    } catch (error) { results.push({ name, error: error.message }); }
    finally { shell.remove(); reference.remove(); style.remove(); }
    return results;
}

test('panel styles preserve native surfaces, component states and balanced messages in Chromium', async (t) => {
    const corePath = process.env.WORDPRESS_ROOT
        ? `${process.env.WORDPRESS_ROOT}/wp-includes/css/dist/components/style.min.css`
        : new URL('../node_modules/@wordpress/components/build-style/style.css', import.meta.url);
    const [core, panel] = await Promise.all([
        readFile(corePath, 'utf8'),
        readFile(new URL('../build/classic-editor.css', import.meta.url), 'utf8'),
    ]);
    await runChromiumTests(t, { script: `(${browserTests.toString()})(${JSON.stringify({ core, panel, strings: panelStrings })})`, count: 14 });
});
