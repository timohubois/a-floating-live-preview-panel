import { createHooks } from '@wordpress/hooks';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { sourceForVm } from './modules.mjs';

const sources = await Promise.all([
    '../../src/screens/editor-extensions.js', '../../src/compatibility/acf-editor.js',
    '../../src/compatibility/acf-fields.js', '../../src/compatibility/acf-block-editor.js',
    '../../src/compatibility/yoast.js',
].map((path) => sourceForVm(new URL(path, import.meta.url))));
const [extensionSource, acfSource, fieldsSource, blockSource, yoastSource] = sources;

// Exercise production setup subscriptions using the real WordPress hooks package.
export function editorExtensionsFixture(context, overrides = {}) {
    const hooks = createHooks();
    const wordpressHooks = { ...hooks, createHooks };
    const evaluate = (source, result, imports) => vm.runInNewContext(
        `(() => { ${source}\n${result ? `return ${result};` : ''} })()`, { ...context, imports }
    );
    const initAcf = overrides.initAcf || evaluate(fieldsSource, 'initAcf');
    const select = overrides.select || context.imports?.['@wordpress/data']?.select || (() => undefined);
    const createBlockEditorAcf = overrides.createBlockEditorAcf || evaluate(blockSource, 'createBlockEditorAcf', {
        '@wordpress/data': { select }, './acf-fields.js': { initAcf },
    });
    evaluate(acfSource, '', {
        '@wordpress/hooks': wordpressHooks, './acf-fields.js': { initAcf },
        './acf-block-editor.js': { createBlockEditorAcf },
    });
    evaluate(yoastSource, '', { '@wordpress/hooks': wordpressHooks, '@wordpress/data': { select } });
    return {
        hooks,
        createEditorExtensions: evaluate(extensionSource, 'createEditorExtensions', { '@wordpress/hooks': wordpressHooks }),
    };
}

// The classic browser fixtures also run the real hooks implementation, without a CDN or server.
const hooksDirectory = new URL('../build/', import.meta.resolve('@wordpress/hooks'));
const hookModules = Object.fromEntries(await Promise.all((await readdir(hooksDirectory))
    .filter((name) => name.endsWith('.cjs'))
    .map(async (name) => [`./${name}`, await readFile(new URL(name, hooksDirectory), 'utf8')])));
export const browserEditorExtensionsSource = `(function(initAcf) {
    const sources = ${JSON.stringify(hookModules)};
    const cache = {};
    function require(name) {
        if (!cache[name]) {
            const module = { exports: {} };
            cache[name] = module;
            new Function('module', 'exports', 'require', 'process', sources[name])(
                module, module.exports, require, { env: { NODE_ENV: 'production' } });
        }
        return cache[name].exports;
    }
    const { createHooks } = require('./index.cjs');
    const wordpressHooks = { ...createHooks(), createHooks };
    new Function('imports', ${JSON.stringify(acfSource)})({
        '@wordpress/hooks': wordpressHooks, './acf-fields.js': { initAcf },
        './acf-block-editor.js': { createBlockEditorAcf() { throw new Error('Classic-only fixture.'); } },
    });
    return new Function('imports', ${JSON.stringify(`${extensionSource}\nreturn createEditorExtensions;`)})({
        '@wordpress/hooks': wordpressHooks,
    });
})`;
