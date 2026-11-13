import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { icons } from '../src/icons.js';

const bundle = await readFile(new URL('../assets/build/editor-bootstrap.js', import.meta.url), 'utf8');
const asset = await readFile(new URL('../assets/build/editor-bootstrap.asset.php', import.meta.url), 'utf8');

function shape({ props }) {
    const children = Array.isArray(props.children) ? props.children : [props.children];
    return JSON.stringify({
        fill: props.style.fill, stroke: props.stroke, strokeWidth: props.strokeWidth,
        paths: children.map(({ props }) => ({ d: props.d, fill: props.fill ?? null, stroke: props.stroke ?? null })),
    });
}

test('panel markup has one visible resize control with an accessible name and keyboard description', async () => {
    const markup = await readFile(new URL('../assets/preview-panel/markup.php', import.meta.url), 'utf8');
    assert.equal([...markup.matchAll(/<button[^>]*class="aflpp-resize"/g)].length, 1);
    assert.doesNotMatch(markup, /data-edge=|resizeLabels/);
    assert.match(markup, /aria-describedby="aflpp-resize-help"/);
    assert.match(markup, /Resize preview/);
    assert.match(markup, /Drag or use arrow keys to resize; Shift for larger steps\./);
});

test('the editor build declares its public WordPress runtime dependencies', () => {
    const dependencies = [...asset.match(/'dependencies'\s*=>\s*array\(([^)]*)\)/s)[1].matchAll(/'([^']+)'/g)]
        .map((match) => match[1]);
    assert.deepEqual(dependencies, [
        'react-jsx-runtime', 'wp-components', 'wp-data', 'wp-element', 'wp-preferences', 'wp-primitives',
    ]);
    assert.match(asset, /'version'\s*=>\s*'[a-f0-9]+'/);
    assert.doesNotMatch(bundle, /__experimental|__unstable|Cannot find module/);
    assert.match(bundle, /import\(/, 'retain native loading for the separate preview coordination modules');
});

test('the shipped editor bundle uses WordPress runtime globals and bundles exactly the selected official icons', () => {
    const bundledIcons = [];
    const jsx = (type, props) => {
        const element = { type, props };
        if (type === 'svg') bundledIcons.push(element);
        return element;
    };
    const window = {
        wp: { components: {}, data: {}, element: {}, preferences: {}, primitives: { SVG: 'svg', Path: 'path' } },
        ReactJSXRuntime: { jsx, jsxs: jsx },
    };
    // No editor form: loading the compiled entry must be safe, without booting coordination or React.
    vm.runInNewContext(bundle, { window, document: { getElementById: () => null } });
    assert.equal(bundledIcons.length, Object.keys(icons).length);
    assert.deepEqual(bundledIcons.map(shape).sort(), Object.values(icons).map(shape).sort());
    assert.equal(window.aFloatingLivePreviewPanelIcons, undefined, 'icons are module-local, not a plugin global');
});
