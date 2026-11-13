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

test('panel markup separates plain title, pointer-only edges and one accessible boundary resize control', async () => {
    const markup = await readFile(new URL('../assets/preview-panel/markup.php', import.meta.url), 'utf8');
    assert.equal([...markup.matchAll(/<button[^>]*class="aflpp-resize"/g)].length, 1);
    assert.doesNotMatch(markup, /data-edge=|resizeLabels/);
    assert.match(markup, /aria-describedby="aflpp-resize-help"/);
    assert.match(markup, /Resize preview/);
    assert.match(markup, /Use arrow keys to resize; Shift for larger steps\./);
    const header = markup.slice(markup.indexOf('<div class="aflpp-header">'), markup.indexOf('<div class="aflpp-feedback"'));
    assert.doesNotMatch(header, /aflpp-resize|<button|tabindex/);
    assert.match(header, /aflpp-move-control/);
    assert.match(header, /<span class="aflpp-caption"><\/span>/);
    assert.match(markup, /data-resize-edge=/);
    assert.doesNotMatch(markup, /aflpp-status-tooltip|aflpp-resize-icon|aflpp-feedback-action/);
});

test('the panel keeps an accessible status region without a redundant visual status dot', async () => {
    const [markup, css, source] = await Promise.all(['markup.php', 'style.css', 'index.js'].map((file) =>
        readFile(new URL(`../assets/preview-panel/${file}`, import.meta.url), 'utf8')
    ));
    for (const content of [markup, css, source]) assert.doesNotMatch(content, /aflpp-dot|aflpp-pulse|dataset\.retryable/);
    assert.match(markup, /class="aflpp-sr-only" role="status"/);
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

test('the revision build uses the same public runtime without editor save coordination', async () => {
    const revisionBundle = await readFile(new URL('../assets/build/revisions-bootstrap.js', import.meta.url), 'utf8');
    const revisionAsset = await readFile(new URL('../assets/build/revisions-bootstrap.asset.php', import.meta.url), 'utf8');
    const dependencies = (source) => source.match(/'dependencies'\s*=>\s*array\(([^)]*)\)/s)[1];
    assert.equal(dependencies(revisionAsset), dependencies(asset));
    assert.doesNotMatch(revisionBundle, /__experimental|__unstable|before-autosave|heartbeat-send|deferredSaves/);
    assert.match(revisionBundle, /import\(/, 'retain native loading for revision coordination and scrolling');
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
