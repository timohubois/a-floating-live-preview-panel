import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runChromiumTests } from './helpers/chromium.mjs';

function browserTests({ core, panel }) {
    const style = document.createElement('style');
    style.textContent = `${core}\n${panel}`;
    document.head.append(style);
    const results = [];
    const launcherContainer = document.createElement('div');
    launcherContainer.className = 'aflpp-launcher';
    launcherContainer.style.cssText = 'left:16px;top:16px';
    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'components-button';
    launcherContainer.append(launcher);
    launcher.innerHTML = '<span class="aflpp-launcher-label">Live preview</span><span class="components-external-link__icon wp-exclude-emoji" aria-hidden="true">↗</span>';
    const nativeLauncher = document.createElement('button');
    nativeLauncher.type = 'button';
    nativeLauncher.className = 'components-button';
    nativeLauncher.innerHTML = launcher.innerHTML;
    document.body.append(launcherContainer, nativeLauncher);
    // Compare appearance with the installed native styles, without pinning visual values to a version.
    const nativeProperties = ['color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'webkitFontSmoothing', 'height', 'padding', 'backgroundColor', 'backgroundImage', 'border', 'borderRadius', 'boxShadow', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset'];
    for (const state of ['normal', 'focused']) {
        const name = `launcher retains native WordPress ${state} typography, spacing and focus`;
        try {
            if (state === 'focused') launcher.focus();
            const actual = nativeProperties.map((property) => getComputedStyle(launcher)[property]);
            if (state === 'focused') nativeLauncher.focus();
            const expected = nativeProperties.map((property) => getComputedStyle(nativeLauncher)[property]);
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Launcher appearance ${JSON.stringify(actual)} must match native ${JSON.stringify(expected)}.`);
            }
            if (getComputedStyle(launcher).cursor !== 'grab') throw new Error('Keep the launcher draggable.');
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { launcher.blur(); nativeLauncher.blur(); }
    }
    for (const direction of ['ltr', 'rtl']) {
        const name = `${direction} launcher keeps its trailing arrow visible with a long translated label`;
        try {
            launcher.dir = direction;
            launcherContainer.style.maxWidth = '120px';
            launcher.querySelector('.aflpp-launcher-label').textContent = 'A long translated live preview label '.repeat(8);
            const arrow = launcher.querySelector('.components-external-link__icon');
            arrow.textContent = direction === 'rtl' ? '↖' : '↗';
            const label = launcher.firstElementChild.getBoundingClientRect();
            const icon = arrow.getBoundingClientRect();
            const box = launcher.getBoundingClientRect();
            if (direction === 'rtl' ? icon.right > label.left : icon.left < label.right) {
                throw new Error('The arrow must follow the label in the reading direction.');
            }
            if (icon.width <= 0 || icon.left < box.left || icon.right > box.right || launcher.scrollWidth > launcher.clientWidth) {
                throw new Error('Keep the arrow inside the button while truncating only its label.');
            }
            if (arrow.getAttribute('aria-hidden') !== 'true' || getComputedStyle(launcher.firstElementChild).textOverflow !== 'ellipsis') {
                throw new Error('The decorative arrow must not change the accessible label.');
            }
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
    }
    launcherContainer.remove();
    nativeLauncher.remove();
    style.remove();
    return results;
}

test('launcher styles retain native appearance and fit translated labels in Chromium', async (t) => {
    const [core, panel] = await Promise.all([
        readFile(new URL('../node_modules/@wordpress/components/build-style/style.css', import.meta.url), 'utf8'),
        readFile(new URL('../build/classic-editor.css', import.meta.url), 'utf8'),
    ]);
    await runChromiumTests(t, { script: `(${browserTests.toString()})(${JSON.stringify({ core, panel })})`, count: 4 });
});
