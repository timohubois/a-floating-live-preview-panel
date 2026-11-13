import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// Exercise our PiP-only CSS in another document; WordPress owns the menu's actual rendering and positioning.
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
    const panel = document.createElement('section');
    panel.className = 'aflpp-panel';
    panel.style.cssText = 'left:0;top:0;width:360px;height:240px';
    panel.innerHTML = '<div class="aflpp-viewport"><div class="aflpp-pip-control"><button class="components-button aflpp-pip-button" aria-label="Pop out preview (PiP)"></button></div></div>';
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
    for (const anchor of ['left', 'center', 'right']) {
        const name = `${anchor} resize grip is visible, keyboard-focusable and retains its resize cursor`;
        panel.dataset.anchor = anchor;
        panel.innerHTML = '<div class="aflpp-header"><button class="aflpp-move">Move preview</button></div><button class="aflpp-resize" aria-label="Resize preview"></button>';
        document.body.append(panel);
        try {
            const grip = panel.querySelector('.aflpp-resize');
            const rect = grip.getBoundingClientRect();
            if (rect.width < 24 || rect.height < 24) throw new Error('The single grip needs a usable target.');
            if (getComputedStyle(grip).cursor !== (anchor === 'left' ? 'nesw-resize' : 'nwse-resize')) throw new Error('Button resets must not override the resize cursor.');
            if (getComputedStyle(panel.querySelector('.aflpp-move')).cursor !== 'grab') throw new Error('Button resets must not override the move cursor.');
            grip.focus();
            if (document.activeElement !== grip) throw new Error('The visible resize grip must remain focusable.');
            panel.classList.add('aflpp-expanded');
            if (getComputedStyle(grip).display !== 'none') throw new Error('Expanded mode must not expose an unusable resize grip.');
            panel.classList.remove('aflpp-expanded');
            results.push({ name });
        } catch (error) { results.push({ name, error: error.message }); }
        finally { panel.remove(); }
    }
    style.remove();
    return results;
}

test('PiP menu bounds, preview shortcut and geometry controls in Chromium', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'aflpp-menu-'));
    try {
        const css = await readFile(new URL('../assets/preview-panel/style.css', import.meta.url), 'utf8');
        const page = join(directory, 'test.html');
        await writeFile(page, `<!doctype html><html><body><script id="results" type="application/json">null</script><script>
            document.getElementById('results').textContent = JSON.stringify((${browserTests.toString()})(${JSON.stringify(css)}));
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
        assert.equal(results.length, 10);
        for (const result of results) await t.test(result.name, () => assert.equal(result.error, undefined, result.error));
    } finally { await rm(directory, { recursive: true, force: true }); }
});
