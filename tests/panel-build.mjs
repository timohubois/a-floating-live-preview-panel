import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { icons } from '../src/panel/icons.js';

const bundle = await readFile(new URL('../build/classic-editor.js', import.meta.url), 'utf8');
const asset = await readFile(new URL('../build/classic-editor.asset.php', import.meta.url), 'utf8');

function shape({ props }) {
    const children = Array.isArray(props.children) ? props.children : [props.children];
    return JSON.stringify({
        fill: props.style.fill, stroke: props.stroke, strokeWidth: props.strokeWidth,
        paths: children.map(({ props }) => ({ d: props.d, fill: props.fill ?? null, stroke: props.stroke ?? null })),
    });
}

test('asset entries use consistent feature names and only emit standard WordPress build files', async () => {
    const entries = ['classic-editor', 'block-editor', 'revision-browser', 'preview-navigation'];
    const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    for (const command of ['build', 'start']) {
        assert.deepEqual(scripts[command].split(/\s+/).slice(2), entries.map((entry) => `src/${entry}.js`));
    }
    const expected = entries.flatMap((entry) => [
        `${entry}.js`, `${entry}.asset.php`,
        ...(entry === 'preview-navigation' ? [] : [`${entry}.css`, `${entry}-rtl.css`]),
    ]);
    assert.deepEqual((await readdir(new URL('../build/', import.meta.url))).sort(), expected.sort(),
        'obsolete entry assets must not remain in the shipped build');
});

test('the editor build declares its public WordPress runtime dependencies', () => {
    const dependencies = [...asset.match(/'dependencies'\s*=>\s*array\(([^)]*)\)/s)[1].matchAll(/'([^']+)'/g)]
        .map((match) => match[1]);
    assert.deepEqual(dependencies, [
        'react-jsx-runtime', 'wp-components', 'wp-data', 'wp-element', 'wp-preferences', 'wp-primitives',
    ]);
    assert.match(asset, /'version'\s*=>\s*'[a-f0-9]+'/);
    assert.doesNotMatch(bundle, /__experimental|__unstable|Cannot find module/);
    assert.doesNotMatch(bundle, /import\(/, 'all editor coordination is bundled, not loaded from source URLs');
});

test('the revision build uses the same public runtime without editor save coordination', async () => {
    const revisionBundle = await readFile(new URL('../build/revision-browser.js', import.meta.url), 'utf8');
    const revisionAsset = await readFile(new URL('../build/revision-browser.asset.php', import.meta.url), 'utf8');
    const dependencies = (source) => source.match(/'dependencies'\s*=>\s*array\(([^)]*)\)/s)[1];
    assert.equal(dependencies(revisionAsset), dependencies(asset));
    assert.doesNotMatch(revisionBundle, /__experimental|__unstable|before-autosave|heartbeat-send|deferredSaves/);
    assert.doesNotMatch(revisionBundle, /import\(/, 'revision coordination and scrolling are bundled');
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

test('all admin entries emit the same panel stylesheet without a separate shared runtime', async () => {
    const [editor, blocks, revisions] = await Promise.all(['classic-editor', 'block-editor', 'revision-browser'].map((entry) =>
        readFile(new URL(`../build/${entry}.css`, import.meta.url), 'utf8')
    ));
    assert.equal(editor, blocks);
    assert.equal(editor, revisions);
    assert.match(editor, /\.aflpp-panel/);
    assert.match(editor, /\.aflpp-pip-document/);
});

test('the standalone frontend build preserves hash navigation but blocks links and form submissions', async () => {
    const source = await readFile(new URL('../build/preview-navigation.js', import.meta.url), 'utf8');
    const asset = await readFile(new URL('../build/preview-navigation.asset.php', import.meta.url), 'utf8');
    assert.match(asset, /'dependencies'\s*=>\s*array\(\s*\)/);
    const handlers = new Map();
    const href = 'https://site.test/post/?preview=true&aflpp_token=token';
    vm.runInNewContext(source, {
        URL, window: { location: { href } },
        document: { addEventListener: (type, callback) => handlers.set(type, callback) },
    });
    const event = (link) => ({
        target: { closest: () => link },
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; },
    });
    const hash = event({ href: `${href}#details`, hasAttribute: () => false });
    handlers.get('click')(hash);
    assert.equal(hash.prevented, undefined);
    for (const address of ['https://elsewhere.test/', 'https://site.test/another/', `${href}&other=1`]) {
        const click = event({ href: address, hasAttribute: () => false });
        handlers.get('click')(click);
        assert.equal(click.prevented, true);
        assert.equal(click.stopped, true);
    }
    const unrelated = event(null);
    handlers.get('click')(unrelated);
    assert.equal(unrelated.prevented, undefined);
    const download = event({ href: `${href}#details`, hasAttribute: () => true });
    handlers.get('click')(download);
    assert.equal(download.prevented, true);
    const submit = event(null);
    handlers.get('submit')(submit);
    assert.equal(submit.prevented, true);
    assert.equal(submit.stopped, true);
});
