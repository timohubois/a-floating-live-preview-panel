import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../assets/preview-panel/viewport.js', import.meta.url), 'utf8'))
    .replace('export function createPreviewViewport', 'function createPreviewViewport');

test('viewport resize observers detach before adoption and rebind to the new window on each move', () => {
    const observers = [];
    function makeWindow(name) {
        return {
            matchMedia: () => ({ matches: false, addEventListener() {} }),
            ResizeObserver: class {
                constructor(callback) { this.window = name; this.callback = callback; observers.push(this); }
                observe(element) { this.element = element; this.connected = true; }
                disconnect() { this.connected = false; }
            },
        };
    }
    const mainWindow = makeWindow('editor');
    const pipWindow = makeWindow('pip');
    const container = { ownerDocument: { defaultView: mainWindow }, clientWidth: 640, clientHeight: 400 };
    const stage = { style: {} };
    const dimensions = {};
    const createPreviewViewport = vm.runInNewContext(`${source}\ncreatePreviewViewport`);
    const viewport = createPreviewViewport(container, stage, dimensions, 'tablet');
    assert.equal(observers[0].connected, true);
    viewport.beforeMove();
    assert.equal(observers[0].connected, false);
    container.ownerDocument = { defaultView: pipWindow };
    viewport.afterMove();
    assert.equal(observers[1].window, 'pip');
    assert.equal(observers[1].connected, true);
    assert.equal(viewport.device, 'tablet');
    assert.equal(stage.style.width, '768px');
    viewport.beforeMove();
    assert.equal(observers[1].connected, false);
    container.ownerDocument = { defaultView: mainWindow };
    viewport.afterMove();
    assert.equal(observers[2].window, 'editor');
    assert.equal(observers.filter(({ connected }) => connected).length, 1);
});
