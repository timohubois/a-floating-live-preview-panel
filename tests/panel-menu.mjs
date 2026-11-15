import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    panel.innerHTML = '<div class="aflpp-viewport"><div class="aflpp-pip-control"><div class="aflpp-pip-surface"><button class="components-button aflpp-pip-button" aria-label="Keep on top"></button></div></div></div>';
    document.body.append(panel);
    try {
        const button = panel.querySelector('button');
        const surface = panel.querySelector('.aflpp-pip-surface');
        const control = panel.querySelector('.aflpp-pip-control');
        const viewport = panel.querySelector('.aflpp-viewport').getBoundingClientRect();
        const rect = button.getBoundingClientRect();
        if (viewport.right - rect.right !== 12 || viewport.bottom - rect.bottom !== 12) throw new Error('Keep the shortcut inside the viewport bottom-right corner.');
        const touch = matchMedia('(hover: none)').matches;
        if (getComputedStyle(surface).opacity !== (touch ? '1' : '0')) throw new Error('Hide the entire shortcut and its backing at rest unless the device cannot hover.');
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (getComputedStyle(surface).transitionDuration !== (reducedMotion ? '0s' : '0.16s')) throw new Error('Use a short opacity fade, respecting reduced motion.');
        if (getComputedStyle(control, '::before').inset !== '-12px') throw new Error('Limit proximity to the small area around the button.');
        button.focus();
        if (document.activeElement !== button || getComputedStyle(surface).opacity !== '1' || getComputedStyle(surface).transitionDuration !== '0s') throw new Error('Keyboard focus must reveal the shortcut immediately.');
        if (getComputedStyle(button).pointerEvents !== 'auto') throw new Error('The revealed shortcut must accept clicks.');
        control.replaceChildren();
        if (getComputedStyle(control).display !== 'none') throw new Error('An unavailable shortcut must not leave an invisible hit area over the preview.');
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
        Object.assign(container.dataset, { title: 'Live preview', moveHelp: 'Drag or use arrow keys.' });
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
            check(!button.querySelector('svg, .components-external-link__icon') && button.querySelector('.aflpp-launcher-label')?.textContent === 'Live preview', 'Keep the launcher text-only rather than suggesting an external link.');
            container.hidden = false;
            const reference = button.cloneNode(true);
            reference.removeAttribute('id');
            reference.removeAttribute('aria-describedby');
            document.body.append(reference);
            try {
                const properties = ['color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'webkitFontSmoothing', 'height', 'padding', 'backgroundColor', 'backgroundImage', 'border', 'borderRadius', 'boxShadow', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset'];
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
                check(container.getBoundingClientRect().height === button.getBoundingClientRect().height, 'Fit the surface without a baseline gap.');
                check(getComputedStyle(button).cursor === 'grab', 'Keep the launcher draggable.');
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
            check(box.width <= 120 && button.getBoundingClientRect().width <= box.width, 'Fit the entire secondary Button to the available width.');
            const label = button.querySelector('.aflpp-launcher-label');
            const text = label.getBoundingClientRect(), bounds = button.getBoundingClientRect();
            check(text.width > 0 && text.left >= bounds.left && text.right <= bounds.right, 'Keep the translated label inside the button in both directions.');
            check(label.scrollWidth > label.clientWidth && getComputedStyle(label).textOverflow === 'ellipsis' && button.scrollWidth <= button.clientWidth, 'Truncate the long label without overflowing the button.');
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
        panel.innerHTML = ['controls', 'refresh-control', 'move-control', 'device-controls', 'fit-control', 'pip-control', 'empty', 'feedback']
            .map((name) => `<div class="aflpp-${name}"></div>`).join('');
        document.body.append(panel);
        let controls;
        try {
            let state = {
                inPage: mode === 'in-page', inPip: mode === 'PiP', movable: mode === 'in-page', mode: 'expand', modeLabel: strings.expand,
                canPip: mode === 'in-page', canFullscreen: mode === 'in-page',
                hasPreview: true, previewUrl: '/preview', dock: 'center', device: 'desktop', fit: 'window', orientation: 'landscape',
                rememberVisibility: true, rememberPosition: true, followChanges: true,
            };
            let toggles = 0, closes = 0;
            controls = window.previewControls.createPreviewControls(panel, strings, {
                close() { closes++; },
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
                for (const [action, key, selected] of [['remember-visibility', 'rememberVisibility', true], ['remember-position', 'rememberPosition', checked], ['follow', 'follow', true]]) {
                    const toggle = document.querySelector(`[data-action="${action}"]`);
                    check(toggle.getAttribute('role') === 'menuitemcheckbox' && toggle.getAttribute('aria-checked') === String(selected), 'Expose every preference as a native checkbox with its current state.');
                    const label = toggle.querySelector('.components-menu-item__info-wrapper > .components-menu-item__item');
                    const help = toggle.querySelector('.components-menu-item__info');
                    check(label?.textContent.trim() === strings[key], 'Use the plain-language setting name.');
                    check(help?.textContent === strings[`${key}Help`], 'Show the explanation as native menu help, not a hidden tooltip.');
                    check(toggle.scrollWidth <= toggle.clientWidth && help.scrollWidth <= help.clientWidth, 'Keep labels and explanations inside the native menu.');
                }
                check(!document.querySelector('[data-action="open-preview"], .aflpp-panel a[target="_blank"]'), 'Do not offer a separate preview tab.');
                const reset = document.querySelector('[data-action="reset"]');
                check(mode !== 'in-page' || reset?.querySelector('.components-menu-item__info')?.textContent === strings.resetHelp, 'Explain where resetting puts the window.');
                if (mode === 'in-page') {
                    for (const action of ['pip', 'pop-out']) {
                        const button = document.querySelector(`[data-action="${action}"]`);
                        check(button.getAttribute('aria-label') === 'Keep on top', 'Describe what the window does, not the browser API.');
                        const help = document.getElementById(button.getAttribute('aria-describedby'));
                        check(help?.textContent === strings.popOutHelp, 'Let the native Button associate the plain explanation.');
                    }
                    const pip = document.querySelector('[data-action="pip"]');
                    check(pip.textContent.trim() === 'Keep on top', 'Keep the action label short.');
                }
                item.focus();
                check(document.activeElement === item, 'Keep the preference keyboard-focusable.');
                item.click();
                await pause();
                check(!preference(), 'Toggling closes the menu like the other preferences.');
                check(state.rememberPosition === !checked, 'Update the preference once without changing display mode.');
            }
            check(toggles === 2, 'Invoke each toggle only once.');
            if (mode === 'PiP') {
                controls.focus('mode');
                check(document.activeElement === trigger && !panel.querySelector('[data-action="mode"], [data-action="close"]'), 'Use native browser window controls and focus the actions menu.');
                trigger.click(); await pause();
                document.querySelector('[data-action="close"]').click();
                check(closes === 1 && !preference(), 'The PiP menu must close live preview once and dismiss itself.');
            }
            results.push({ name });
        } catch (error) { results.push({ name, error: error.stack }); }
        finally { controls?.beforeMove(); panel.remove(); }
    }
    return results;
}

async function nativeNoticeTests(strings) {
    const results = [];
    const { createPreviewControls, dispatch, select, noticesStore } = window.previewControls;
    const actions = dispatch(noticesStore), selectors = select(noticesStore);
    const context = 'a-floating-live-preview-panel';
    const pause = () => new Promise((resolve) => setTimeout(resolve, 50));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    actions.createInfoNotice('Editor-owned notice', { id: 'unrelated-editor-notice', speak: false });
    const editorNotices = selectors.getNotices();
    const theme = window.wp.theme;
    for (const mode of ['in-page', 'fullscreen', 'PiP']) {
        const name = `${mode} feedback uses scoped native inline notices and preserves recovery and dismissal`;
        // Older core may expose notices without the optional theme provider.
        window.wp.theme = mode === 'fullscreen' ? undefined : theme;
        const panel = document.createElement('section');
        panel.className = 'aflpp-panel';
        panel.style.cssText = 'left:20px;top:20px;width:480px;height:340px';
        panel.innerHTML = ['controls', 'refresh-control', 'move-control', 'device-controls', 'fit-control', 'pip-control', 'empty', 'feedback']
            .map((name) => `<div class="aflpp-${name}"></div>`).join('');
        document.body.append(panel);
        let controls, frame;
        try {
            let state = {
                inPage: mode === 'in-page', inPip: mode === 'PiP', hasPreview: true, device: 'desktop', fit: 'window', orientation: 'landscape',
                notice: { heading: 'Could not update preview.', description: 'Showing the previous preview.', status: 'warning', dismissible: false, retry: true, action: strings.retry },
            };
            let retries = 0, dismissals = 0;
            controls = createPreviewControls(panel, strings, {
                retry() { retries++; },
                dismissNotice() { dismissals++; state = { ...state, notice: null }; controls.update(state); },
            });
            controls.update(state);
            await pause();
            const notice = panel.querySelector('.notices-inline-notices__notice');
            check(notice && !panel.querySelector('.components-notice'), 'Use the real newer inline renderer, not CSS on a legacy Notice.');
            check(notice.querySelector('svg') && !notice.querySelector('strong'), 'Let core provide the status icon and plain message.');
            check(notice.textContent.includes('Could not update preview. Showing the previous preview.'), 'Keep both parts of the message.');
            const style = getComputedStyle(notice);
            check(style.borderTopWidth === '0px' && style.borderLeftWidth === '0px' && style.borderRightWidth === '0px' && (!window.wp.theme || style.borderRadius === '0px'), `Integrate with the single header separator and flush editor notice edges: ${style.borderTopWidth}/${style.borderLeftWidth}/${style.borderRightWidth}/${style.borderRadius}.`);
            let record = selectors.getNotices(context)[0];
            check(record.spokenMessage === null && !record.isDismissible, 'Do not duplicate the shell announcement or dismiss an unresolved failure.');
            const retry = [...notice.querySelectorAll('button')].find((button) => button.textContent === strings.retry);
            retry.click();
            check(retries === 1, 'Invoke recovery once through the native action.');
            retry.focus();
            controls.update({ ...state, device: 'mobile', notice: { ...state.notice } });
            await pause();
            check(panel.querySelector('.notices-inline-notices__notice') === notice && document.activeElement === retry, 'Unrelated updates must preserve the notice and action focus.');
            state = { ...state, notice: { ...state.notice, disabled: true } };
            controls.update(state);
            await pause();
            check(retry.disabled || retry.getAttribute('aria-disabled') === 'true', 'Native recovery actions respect disabled state.');
            retry.click();
            check(retries === 1, 'Disabled actions cannot retry.');
            if (mode === 'PiP') {
                controls.beforeMove();
                controls.update(state);
                check(selectors.getNotices(context).length === 0, 'Keep our notice cleared while the controls are detached.');
                frame = document.createElement('iframe');
                document.body.append(frame);
                for (const sheet of document.styleSheets) {
                    const copy = frame.contentDocument.createElement('style');
                    copy.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
                    frame.contentDocument.head.append(copy);
                }
                frame.contentDocument.body.append(panel);
                controls.remount();
                await pause();
                check(panel.querySelector('.notices-inline-notices__notice') && selectors.getNotices(context).length === 1, 'Restore native feedback in the destination document.');
            }
            state = { ...state, notice: { heading: 'Window operation failed', status: 'info', dismissible: true } };
            controls.update(state);
            await pause();
            record = selectors.getNotices(context)[0];
            check(record.isDismissible, 'Incidental window messages remain dismissible.');
            const close = panel.querySelector('.aflpp-feedback button');
            check(close, 'Core supplies its own dismiss button.');
            close.click();
            await pause();
            check(dismissals === 1 && selectors.getNotices(context).length === 0 && !panel.querySelector('.notices-inline-notices__notice'), 'Dismissal clears shell state and the scoped store once.');
            check(selectors.getNotices() === editorNotices, 'Never change editor-owned notices.');
            results.push({ name });
        } catch (error) { results.push({ name, error: error.stack }); }
        finally { controls?.beforeMove(); panel.remove(); frame?.remove(); window.wp.theme = theme; }
    }
    actions.removeNotice('unrelated-editor-notice');
    return results;
}

async function nativeViewportControlTests(strings) {
    const results = [];
    const pause = () => new Promise((resolve) => setTimeout(resolve, 50));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    for (const mode of ['floating', 'expanded', 'fullscreen', 'PiP']) for (const width of [320, 480, 900]) {
        const name = `${mode}, ${width}px: three fitting choices, device-button rotation and responsive footer`;
        const panel = document.createElement('section');
        panel.className = 'aflpp-panel';
        panel.dir = width === 480 ? 'rtl' : 'ltr';
        panel.dataset.hasPreview = 'true';
        panel.style.cssText = `position:relative;width:${width}px;height:340px`;
        panel.innerHTML = '<header class="aflpp-header"><div class="aflpp-move-control"></div><div class="aflpp-refresh-control"></div><div class="aflpp-titlebar">Preview</div><div class="aflpp-controls"></div></header><div class="aflpp-feedback" hidden></div><div class="aflpp-viewport"><div class="aflpp-canvas" role="region" aria-label="Preview canvas" tabindex="-1"><div class="aflpp-canvas-space"><div class="aflpp-stage"></div></div></div><div class="aflpp-empty" hidden></div><div class="aflpp-pip-control"></div></div><footer class="aflpp-devicebar"><div class="aflpp-device-controls"></div><div class="aflpp-viewport-controls"><div class="aflpp-fit-control"></div><span class="aflpp-dimensions"></span></div></footer>';
        document.body.append(panel);
        let controls, viewport;
        try {
            viewport = window.previewControls.createPreviewViewport(panel.querySelector('.aflpp-viewport'), panel.querySelector('.aflpp-stage'), panel.querySelector('.aflpp-dimensions'), { device: 'tablet' });
            let state = {
                inPage: mode === 'floating' || mode === 'expanded', inPip: mode === 'PiP', movable: mode === 'floating',
                mode: 'expand', modeLabel: strings.expand, hasPreview: true, canRefresh: true,
                device: viewport.device, fit: viewport.fit, orientation: viewport.orientation,
            };
            const sync = () => {
                state = { ...state, device: viewport.device, fit: viewport.fit, orientation: viewport.orientation };
                controls.update(state);
            };
            controls = window.previewControls.createPreviewControls(panel, strings, {
                fit(value) { viewport.setFit(value); sync(); },
                device(value) {
                    if (value === viewport.device) viewport.rotate();
                    else viewport.select(value);
                    sync();
                },
            });
            sync();
            await pause();
            const checkIcons = () => {
                for (const button of panel.querySelectorAll('[data-viewport]')) {
                    const svg = button.querySelector('svg');
                    check(svg?.parentElement === button, 'Native SVGs must not be nested in an unsized icon wrapper.');
                    const rect = svg.getBoundingClientRect();
                    check(rect.width === 24 && rect.height === 24, `Native toolbar icons must paint at 24×24, not shrink to dots: ${rect.width}×${rect.height}.`);
                    const glyph = svg.querySelector('path').getBoundingClientRect();
                    check(glyph.width >= 8 && glyph.height >= 8, 'The actual icon paths must remain visible at native size.');
                }
            };
            checkIcons();
            const select = panel.querySelector('select[data-action="fit"]');
            check(select && select.labels[0]?.textContent === strings.fitting, 'The native select needs an accessible label.');
            check([...select.options].map(({ value }) => value).join(',') === 'automatic,window,width', 'Offer all three approved fitting choices.');
            check(select.options[0].textContent === strings.automatic && select.options[1].textContent === strings.fitToWindow && select.options[2].textContent === strings.fitToWidth, 'Use translated fitting labels.');
            check(select.value === 'automatic', 'Automatic is the default.');
            select.focus();
            for (const fit of ['width', 'window', 'automatic']) {
                select.value = fit;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                await pause();
                check(state.fit === fit && select.value === fit, 'Changing the select updates the viewport and selected option.');
                check(document.activeElement === select, 'Changing fitting preserves keyboard focus.');
            }
            const tablet = panel.querySelector('[data-viewport="tablet"]');
            check(tablet.getAttribute('aria-label') === `${strings.tablet} — ${strings.rotateLandscape}`, 'The selected button explains how to rotate.');
            tablet.click();
            await pause();
            check(state.orientation === 'landscape' && panel.querySelector('.aflpp-dimensions').textContent.startsWith('1024 × 768'), 'Reselecting the device rotates the viewport.');
            check(tablet.getAttribute('aria-label') === `${strings.tablet} — ${strings.rotatePortrait}`, 'The next rotation action has the correct accessible name.');
            check(tablet.classList.contains('aflpp-device-rotated'), 'The selected device icon shows landscape orientation.');
            checkIcons();
            check(!panel.querySelector('[data-action="rotate"]'), 'No separate rotate control remains.');
            const footer = panel.querySelector('.aflpp-devicebar').getBoundingClientRect();
            for (const element of panel.querySelectorAll('.aflpp-devicebar button, .aflpp-devicebar select, .aflpp-dimensions')) {
                const rect = element.getBoundingClientRect();
                check(rect.left >= footer.left - 1 && rect.right <= footer.right + 1 && rect.top >= footer.top - 1 && rect.bottom <= footer.bottom + 1, 'All footer controls and dimensions must fit without clipping.');
            }
            check(panel.scrollWidth <= panel.clientWidth + 1, 'The footer must wrap instead of widening a narrow panel.');
            panel.querySelector('[data-viewport="desktop"]').click();
            await pause();
            check(state.device === 'desktop' && panel.querySelectorAll('[data-viewport]').length === 3, 'Device selection keeps just the three existing buttons.');
            const desktop = panel.querySelector('[data-viewport="desktop"]');
            check(desktop.getAttribute('aria-pressed') === 'true', 'Keep native toolbar selected state.');
            check(!desktop.classList.contains('aflpp-device-rotated'), 'Desktop starts with its normal landscape icon.');
            desktop.click();
            await pause();
            check(state.orientation === 'landscape' && panel.querySelector('.aflpp-dimensions').textContent.startsWith('1280 × 800'), 'Reselecting desktop keeps its landscape viewport.');
            check(!desktop.classList.contains('aflpp-device-rotated'), 'The desktop icon never rotates.');
            check(desktop.getAttribute('aria-label') === strings.desktop, 'Desktop must not offer rotation in its accessible name or tooltip.');
            checkIcons();
            desktop.click();
            await pause();
            check(state.orientation === 'landscape' && !desktop.classList.contains('aflpp-device-rotated'), 'Repeated desktop activation remains a no-op.');
            checkIcons();
            results.push({ name });
        } catch (error) { results.push({ name, error: error.stack }); }
        finally { controls?.beforeMove(); viewport?.beforeMove(); panel.remove(); }
    }
    return results;
}

test('native WordPress launcher, menu and notices render and handle focus and clicks in Chromium', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'aflpp-native-launcher-'));
    try {
        // Expose public APIs only in the fixture so native-store isolation can be checked too.
        await writeFile(join(directory, 'entry.js'), `
            export { createPreviewControls, createPreviewLauncher } from ${JSON.stringify(fileURLToPath(new URL('../src/panel/controls.js', import.meta.url)))};
            export { createPreviewViewport } from ${JSON.stringify(fileURLToPath(new URL('../src/panel/viewport.js', import.meta.url)))};
            export { dispatch, select } from '@wordpress/data';
            export { store as noticesStore } from '@wordpress/notices';
            export { ThemeProvider } from '@wordpress/theme';
        `);
        await new Promise((resolve, reject) => webpack({
            mode: 'production', devtool: false,
            entry: join(directory, 'entry.js'),
            resolve: { modules: [fileURLToPath(new URL('../node_modules', import.meta.url)), 'node_modules'] },
            output: { path: directory, filename: 'controls.js', library: { name: 'previewControls', type: 'window' } },
            optimization: { minimize: false }, performance: false,
        }, (error, stats) => {
            if (error) return reject(error);
            if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
            resolve();
        }));
        const css = await readFile(new URL('../build/classic-editor.css', import.meta.url), 'utf8');
        const core = await readFile(new URL('../node_modules/@wordpress/components/build-style/style.css', import.meta.url), 'utf8');
        const tokens = await readFile(new URL('../node_modules/@wordpress/theme/prebuilt/css/design-tokens.css', import.meta.url), 'utf8');
        const bundle = pathToFileURL(join(directory, 'controls.js')).href;
        await runChromiumTests(t, {
            script: `(async () => {
                window.wp = { theme: { ThemeProvider: window.previewControls.ThemeProvider } };
                return [...(${nativeLauncherTests.toString()})(), ...await (${nativePreferenceTests.toString()})(${JSON.stringify(panelStrings)}), ...await (${nativeNoticeTests.toString()})(${JSON.stringify(panelStrings)}), ...await (${nativeViewportControlTests.toString()})(${JSON.stringify(panelStrings)})];
            })()`, count: 20,
            head: `<style>${tokens}\n${core}\n${css}</style><script src="${bundle}"></script>`,
        });
    } finally { await rm(directory, { recursive: true, force: true }); }
});
