import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runChromiumTests } from './helpers/chromium.mjs';

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
    for (const direction of ['ltr', 'rtl']) for (const anchor of ['left', 'center', 'right']) {
        const name = `${direction} ${anchor} boundary resizing stays physical, keyboard-accessible and out of the header`;
        panel.dir = direction;
        panel.dataset.anchor = anchor;
        panel.innerHTML = `<div class="aflpp-header"><button class="components-button aflpp-move">Move preview</button><span class="aflpp-caption">Title</span></div>
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

test('PiP menu bounds, preview shortcut and geometry controls in Chromium', async (t) => {
    const css = await readFile(new URL('../build/classic-editor.css', import.meta.url), 'utf8');
    await runChromiumTests(t, { script: `(${browserTests.toString()})(${JSON.stringify(css)})`, count: 14 });
});
