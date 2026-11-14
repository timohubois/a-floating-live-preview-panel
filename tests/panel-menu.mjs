import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import webpack from 'webpack';
import { runChromiumTests } from './helpers/chromium.mjs';
import { panelStrings } from './helpers/panel-strings.mjs';

// Exercise panel CSS and the native overlay layers; WordPress owns actual menu rendering and positioning.
function browserTests(css) {
    const results = [];
    for (const pip of [false, true]) for (const height of [120, 180, 440]) {
        const name = `${pip ? 'PiP' : 'in-page'} menu in a ${height}px-high document`;
        const frame = document.createElement('iframe');
        frame.style.cssText = `width:360px;height:${height}px;border:0`;
        document.body.append(frame);
        try {
            const doc = frame.contentDocument;
            doc.open();
            doc.write(`<!doctype html><html><head><style>${css}</style></head><body class="aflpp-pip-document">
                <section class="aflpp-panel${pip ? ' aflpp-pip' : ''}">
                    <div class="aflpp-menu-popover" style="position:absolute;top:46px;right:8px">
                        <div class="components-popover__content" style="border:1px solid black">
                            ${Array.from({ length: 16 }, (_, i) => `<button type="button" style="display:block;height:32px">Command ${i}</button>`).join('')}
                        </div>
                    </div>
                </section></body></html>`);
            doc.close();
            const content = doc.querySelector('.components-popover__content');
            const style = doc.defaultView.getComputedStyle(content);
            if (!pip) {
                if (style.maxHeight !== 'none' || style.overflowY !== 'visible') throw new Error('Do not override in-page native sizing.');
            } else {
                const rect = content.getBoundingClientRect();
                if (style.maxHeight !== `${height - 48}px` || style.overflowY !== 'auto') throw new Error('PiP needs a destination-viewport height cap and scrolling.');
                if (rect.top < 0 || rect.bottom > height) throw new Error('The PiP menu extends beyond its document.');
                if (content.scrollHeight <= content.clientHeight) throw new Error('The fixture must exercise overflowing commands.');
                content.lastElementChild.scrollIntoView({ block: 'end' });
                const last = content.lastElementChild.getBoundingClientRect();
                if (content.scrollTop <= 0 || last.top < rect.top || last.bottom > rect.bottom) throw new Error('The final command must be reachable by scrolling.');
            }
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { frame.remove(); }
    }
    const name = 'PiP shortcut stays viewport-pinned and keyboard-focusable';
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const layeringName = 'in-page menu overlays the admin bar without raising the panel';
    const adminBar = document.createElement('div');
    adminBar.style.cssText = 'position:fixed;inset:0 0 auto;height:32px;z-index:99999;background:black';
    const shell = document.createElement('section');
    shell.className = 'aflpp-panel';
    shell.style.cssText = 'left:0;top:80px;width:360px;height:240px';
    const menu = document.createElement('div');
    menu.className = 'components-popover aflpp-menu-popover';
    // WordPress gives its native popovers z-index 1000000.
    menu.style.cssText = 'position:fixed;left:100px;top:8px;width:200px;height:120px;z-index:1000000;background:white';
    document.body.append(adminBar, shell, menu);
    try {
        if (Number(getComputedStyle(shell).zIndex) >= Number(getComputedStyle(adminBar).zIndex)) throw new Error('Keep the panel below native admin overlays.');
        if (document.elementFromPoint(110, 20) !== menu) throw new Error('The menu must remain visible and clickable over the admin bar.');
        shell.append(menu);
        if (document.elementFromPoint(110, 20) !== adminBar) throw new Error('The fixture must reproduce the clipping when the menu is trapped inside the panel.');
        results.push({ name: layeringName });
    } catch (error) { results.push({ name: layeringName, error: error.message }); }
    finally { menu.remove(); shell.remove(); adminBar.remove(); }
    const panel = document.createElement('section');
    panel.className = 'aflpp-panel';
    panel.style.cssText = 'left:0;top:0;width:360px;height:240px';
    panel.innerHTML = '<div class="aflpp-viewport"><div class="aflpp-pip-control"><button class="components-button aflpp-pip-button" aria-label="Picture-in-picture"></button></div></div>';
    document.body.append(panel);
    try {
        const button = panel.querySelector('button');
        const viewport = panel.querySelector('.aflpp-viewport').getBoundingClientRect();
        const rect = button.getBoundingClientRect();
        if (viewport.right - rect.right !== 12 || viewport.bottom - rect.bottom !== 12) throw new Error('Keep the shortcut inside the viewport bottom-right corner.');
        const touch = matchMedia('(hover: none)').matches;
        if (getComputedStyle(button).opacity !== (touch ? '1' : '0')) throw new Error('Hide the shortcut at rest unless the device cannot hover.');
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (getComputedStyle(button).transitionDuration !== (reducedMotion ? '0s' : '0.16s')) throw new Error('Use a short opacity fade, respecting reduced motion.');
        if (getComputedStyle(button, '::before').inset !== '-12px') throw new Error('Limit proximity to the small area around the button.');
        button.focus();
        if (document.activeElement !== button || getComputedStyle(button).opacity !== '1' || getComputedStyle(button).transitionDuration !== '0s') throw new Error('Keyboard focus must reveal the shortcut immediately.');
        if (getComputedStyle(button).pointerEvents !== 'auto') throw new Error('The revealed shortcut must accept clicks.');
        results.push({ name });
    } catch (error) { results.push({ name, error: error.message }); }
    finally { panel.remove(); }
    for (const direction of ['ltr', 'rtl']) for (const anchor of ['left', 'center', 'right']) {
        const name = `${direction} ${anchor} boundary resizing stays physical, keyboard-accessible and out of the header`;
        panel.dir = direction;
        panel.dataset.anchor = anchor;
        panel.innerHTML = `<header class="aflpp-header"><button class="components-button aflpp-move">Move preview</button><h2 class="aflpp-caption">Title</h2></header>
            <span class="aflpp-edge aflpp-edge-n"></span><span class="aflpp-edge aflpp-edge-e"></span><span class="aflpp-edge aflpp-edge-nw"></span>
            <div class="aflpp-resize-control"><button class="aflpp-resize" aria-label="Resize preview"></button></div>`;
        document.body.append(panel);
        try {
            const grip = panel.querySelector('.aflpp-resize');
            const rect = grip.getBoundingClientRect(), box = panel.getBoundingClientRect();
            if (rect.width < 24 || rect.height < 24) throw new Error('The keyboard boundary needs a usable focus indicator.');
            if (anchor === 'left' ? rect.left < box.left + box.width / 2 : rect.left > box.left + box.width / 2) throw new Error('Keep the keyboard boundary at its physical free corner, including RTL.');
            if (panel.querySelector('.aflpp-header .aflpp-resize')) throw new Error('No resize icon or resize Tab stop in the header.');
            for (const [selector, cursor] of [['n', 'ns-resize'], ['e', 'ew-resize'], ['nw', 'nwse-resize']]) {
                if (getComputedStyle(panel.querySelector('.aflpp-edge-' + selector)).cursor !== cursor) throw new Error('Pointer borders need directional cursors.');
            }
            if (getComputedStyle(panel.querySelector('.aflpp-move')).cursor !== 'grab') throw new Error('The dedicated move button retains its grab cursor.');
            grip.focus();
            if (document.activeElement !== grip) throw new Error('The boundary resize control must remain keyboard-focusable.');
            panel.classList.add('aflpp-expanded');
            if (grip.getClientRects().length) throw new Error('Expanded mode hides the keyboard boundary.');
            panel.classList.remove('aflpp-expanded');
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { panel.remove(); }
    }
    const placeholderName = 'native Placeholder instructions remain readable at compact widths';
    panel.innerHTML = '<div class="aflpp-empty"><div class="components-placeholder aflpp-placeholder is-medium"><div class="components-placeholder__instructions">Recovery instructions</div></div></div>';
    const coreStyle = document.createElement('style');
    // Core hides block Placeholder instructions below its medium-width breakpoint.
    coreStyle.textContent = '.components-placeholder.is-medium .components-placeholder__instructions, .components-placeholder.is-small .components-placeholder__instructions { display:none; }';
    document.head.prepend(coreStyle);
    document.body.append(panel);
    try {
        for (const size of ['is-medium', 'is-small']) {
            panel.querySelector('.components-placeholder').className = `components-placeholder aflpp-placeholder ${size}`;
            if (getComputedStyle(panel.querySelector('.components-placeholder__instructions')).display !== 'block') throw new Error('Do not hide loading, permission or recovery instructions.');
        }
        results.push({ name: placeholderName });
    } catch (error) { results.push({ name: placeholderName, error: error.message }); }
    finally { panel.remove(); coreStyle.remove(); }
    style.remove();
    return results;
}

test('menu layering, PiP bounds, preview shortcut and geometry controls in Chromium', async (t) => {
    const css = await readFile(new URL('../build/classic-editor.css', import.meta.url), 'utf8');
    await runChromiumTests(t, { script: `(${browserTests.toString()})(${JSON.stringify(css)})`, count: 15 });
});

function nativeLauncherTests() {
    const results = [];
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    for (const direction of ['ltr', 'rtl']) {
        const name = `native ${direction} launcher renders a secondary Button with an accessible description`;
        const container = document.createElement('div');
        container.dir = direction;
        container.className = 'aflpp-launcher';
        container.hidden = true;
        container.style.cssText = 'left:20px;top:20px';
        Object.assign(container.dataset, { title: 'Live preview', moveHelp: 'Drag or use arrow keys.', direction });
        document.body.append(container);
        try {
            const button = window.previewControls.createPreviewLauncher(container);
            check(button instanceof HTMLButtonElement && button.classList.contains('components-button') && button.classList.contains('is-secondary'), 'Render the native secondary Button component.');
            check(container.firstElementChild === button && !container.querySelector('.components-card'), 'Render the button directly without a Card edge competing with its focus ring.');
            check(container.hidden && !button.getClientRects().length && button.getAttribute('aria-expanded') === 'false', 'Hide the entire native surface until it is positioned.');
            check(button.getAttribute('aria-controls') === 'aflpp-panel' && !button.hasAttribute('href'), 'Keep native button semantics.');
            check(button.getAttribute('aria-label') === 'Live preview', 'Keep the action label independent of status messages.');
            const description = document.getElementById(button.getAttribute('aria-describedby'));
            check(description?.textContent === container.dataset.moveHelp, 'Let Button provide its accessible description.');
            const arrow = button.querySelector('.components-external-link__icon');
            check(arrow.textContent === (direction === 'rtl' ? '↖' : '↗') && arrow.getAttribute('aria-hidden') === 'true', 'Keep the trailing arrow decorative and directional.');
            container.hidden = false;
            const reference = button.cloneNode(true);
            reference.removeAttribute('id');
            reference.removeAttribute('aria-describedby');
            document.body.append(reference);
            try {
                const properties = ['backgroundColor', 'border', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'padding', 'color', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset'];
                const appearance = (element) => JSON.stringify(properties.map((property) => getComputedStyle(element)[property]));
                for (const focused of [false, true]) {
                    if (focused) button.focus();
                    const actual = appearance(button);
                    if (focused) reference.focus();
                    check(actual === appearance(reference), 'Preserve native secondary Button appearance and focus.');
                    button.blur();
                    reference.blur();
                }
                check(getComputedStyle(container).backgroundColor === 'rgb(255, 255, 255)', 'Keep the floating surface opaque over editor content.');
                check(getComputedStyle(container).boxShadow !== 'none', 'Apply the subtle floating shadow to the mount, not the button focus ring.');
                check(getComputedStyle(container).borderRadius === getComputedStyle(button).borderRadius, 'Align the floating surface with the native button corners.');
            } finally { reference.remove(); }
            button.focus();
            check(document.activeElement === button, 'The native button must receive focus.');
            let clicks = 0;
            button.addEventListener('click', () => clicks++);
            button.click();
            check(clicks === 1, 'Existing shell handlers must receive the native button click once.');
            container.style.maxWidth = '120px';
            button.querySelector('.aflpp-launcher-label').textContent = 'A long translated live preview label '.repeat(8);
            const box = container.getBoundingClientRect();
            const icon = arrow.getBoundingClientRect();
            check(box.width <= 120 && button.getBoundingClientRect().width <= box.width, 'Fit the entire secondary Button to the available width.');
            check(icon.width > 0 && icon.left >= box.left && icon.right <= box.right && button.scrollWidth <= button.clientWidth, 'Keep the native trailing arrow visible while truncating only the label.');
            results.push({ name });
        } catch (error) { results.push({ name, error: error.stack }); }
        finally { container.remove(); }
    }
    return results;
}

async function nativePreferenceTests(strings) {
    const results = [];
    const pause = () => new Promise((resolve) => setTimeout(resolve, 50));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    for (const mode of ['in-page', 'fullscreen', 'PiP']) {
        const name = `${mode} native menu exposes and toggles Remember size and position`;
        const panel = document.createElement('section');
        panel.className = 'aflpp-panel';
        panel.style.cssText = 'left:20px;top:20px;width:480px;height:340px';
        panel.innerHTML = ['controls', 'refresh-control', 'move-control', 'device-controls', 'pip-control', 'empty', 'feedback']
            .map((name) => `<div class="aflpp-${name}"></div>`).join('');
        document.body.append(panel);
        let controls;
        try {
            let state = {
                inPage: mode === 'in-page', inPip: mode === 'PiP', movable: mode === 'in-page', mode: 'expand', modeLabel: strings.expand,
                canPip: mode === 'in-page', canFullscreen: mode === 'in-page',
                hasPreview: true, dock: 'center', size: 'small', device: 'desktop',
                rememberVisibility: true, rememberPosition: true, followChanges: true,
            };
            let toggles = 0;
            controls = window.previewControls.createPreviewControls(panel, strings, {
                rememberPosition() {
                    toggles++;
                    state = { ...state, rememberPosition: !state.rememberPosition };
                    controls.update(state);
                },
            });
            controls.update(state);
            const trigger = panel.querySelector('[data-action="actions"]');
            const preference = () => document.querySelector('[data-action="remember-position"]');
            for (const checked of [true, false]) {
                trigger.click();
                await pause();
                const item = preference();
                check(item?.getAttribute('role') === 'menuitemcheckbox', 'Use the native checkbox menu item.');
                check(item.textContent.trim() === strings.rememberPosition, 'Expose the translated preference label.');
                check(item.getAttribute('aria-checked') === String(checked), 'Expose the current saved checkbox state.');
                const visibility = document.querySelector('[data-action="remember-visibility"]');
                check(visibility.textContent.trim() === 'Remember if the preview is open', 'Use the new plain-language visibility label.');
                check(visibility.scrollWidth <= visibility.clientWidth, 'Keep the longer label within the native menu.');
                if (mode === 'in-page') {
                    for (const action of ['pip', 'pop-out']) {
                        const button = document.querySelector(`[data-action="${action}"]`);
                        check(button.getAttribute('aria-label') === 'Picture-in-picture', 'Use the browser feature name.');
                        const help = document.getElementById(button.getAttribute('aria-describedby'));
                        check(help?.textContent === strings.popOutHelp, 'Let the native Button associate the plain explanation.');
                    }
                    const pip = document.querySelector('[data-action="pip"]');
                    check(pip.textContent.trim() === 'Picture-in-picture', 'Keep the explanation out of the visible menu label.');
                }
                item.focus();
                check(document.activeElement === item, 'Keep the preference keyboard-focusable.');
                item.click();
                await pause();
                check(!preference(), 'Toggling closes the menu like the other preferences.');
                check(state.rememberPosition === !checked, 'Update the preference once without changing display mode.');
            }
            check(toggles === 2, 'Invoke each toggle only once.');
            results.push({ name });
        } catch (error) { results.push({ name, error: error.stack }); }
        finally { controls?.beforeMove(); panel.remove(); }
    }
    return results;
}

test('native WordPress launcher and preference menu render and handle focus and clicks in Chromium', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'aflpp-native-launcher-'));
    try {
        // Bundle the same public packages for this isolated browser fixture, without requiring a WordPress server.
        await new Promise((resolve, reject) => webpack({
            mode: 'production', devtool: false,
            entry: fileURLToPath(new URL('../src/panel/controls.js', import.meta.url)),
            output: { path: directory, filename: 'controls.js', library: { name: 'previewControls', type: 'window' } },
            optimization: { minimize: false }, performance: false,
        }, (error, stats) => {
            if (error) return reject(error);
            if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
            resolve();
        }));
        const css = await readFile(new URL('../build/classic-editor.css', import.meta.url), 'utf8');
        const core = await readFile(new URL('../node_modules/@wordpress/components/build-style/style.css', import.meta.url), 'utf8');
        const bundle = pathToFileURL(join(directory, 'controls.js')).href;
        await runChromiumTests(t, {
            script: `(async () => [...(${nativeLauncherTests.toString()})(), ...await (${nativePreferenceTests.toString()})(${JSON.stringify(panelStrings)})])()`, count: 5,
            head: `<style>${core}\n${css}</style><script src="${bundle}"></script>`,
        });
    } finally { await rm(directory, { recursive: true, force: true }); }
});
