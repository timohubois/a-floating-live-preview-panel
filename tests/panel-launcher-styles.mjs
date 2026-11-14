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
    launcher.className = 'components-button is-secondary';
    launcherContainer.append(launcher);
    launcher.innerHTML = '<span class="aflpp-launcher-label">Live preview</span>';
    const nativeLauncher = document.createElement('button');
    nativeLauncher.type = 'button';
    nativeLauncher.className = 'components-button is-secondary';
    nativeLauncher.innerHTML = launcher.innerHTML;
    document.body.append(launcherContainer, nativeLauncher);
    // Compare appearance with the installed native styles, without pinning visual values to a version.
    const nativeProperties = ['color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'webkitFontSmoothing', 'height', 'padding', 'backgroundColor', 'backgroundImage', 'border', 'borderRadius', 'boxShadow', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset'];
    for (const state of ['normal', 'focused']) {
        const name = `launcher retains native WordPress secondary ${state} typography, spacing and focus`;
        try {
            if (state === 'focused') launcher.focus();
            const actual = nativeProperties.map((property) => getComputedStyle(launcher)[property]);
            if (state === 'focused') nativeLauncher.focus();
            const expected = nativeProperties.map((property) => getComputedStyle(nativeLauncher)[property]);
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Launcher appearance ${JSON.stringify(actual)} must match native ${JSON.stringify(expected)}.`);
            }
            const surface = getComputedStyle(launcherContainer);
            if (surface.backgroundColor !== 'rgb(255, 255, 255)' || surface.boxShadow === 'none') {
                throw new Error('Keep the opaque floating surface and subtle shadow on the mount, separate from button states.');
            }
            if (surface.borderRadius !== getComputedStyle(launcher).borderRadius) {
                throw new Error('Match the native button corners without an extra rounded Card edge.');
            }
            if (launcherContainer.getBoundingClientRect().height !== launcher.getBoundingClientRect().height) {
                throw new Error('Fit the floating surface to the button without an inline baseline gap.');
            }
            if (getComputedStyle(launcher).cursor !== 'grab') throw new Error('Keep the launcher draggable.');
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { launcher.blur(); nativeLauncher.blur(); }
    }
    for (const direction of ['ltr', 'rtl']) {
        const name = `${direction} text-only launcher truncates a long translated label without overflowing`;
        try {
            launcher.dir = direction;
            launcherContainer.style.maxWidth = '120px';
            launcher.querySelector('.aflpp-launcher-label').textContent = 'A long translated live preview label '.repeat(8);
            const label = launcher.firstElementChild;
            const text = label.getBoundingClientRect();
            const box = launcher.getBoundingClientRect();
            if (text.width <= 0 || text.left < box.left || text.right > box.right || launcher.scrollWidth > launcher.clientWidth) {
                throw new Error('Keep the translated label inside the button.');
            }
            if (label.scrollWidth <= label.clientWidth || getComputedStyle(label).textOverflow !== 'ellipsis') {
                throw new Error('Truncate long labels with an ellipsis without changing the full text.');
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
