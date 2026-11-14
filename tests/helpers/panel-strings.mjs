import { readFile } from 'node:fs/promises';

// Use the shipped English copy in component fixtures without requiring a PHP or WordPress runtime.
async function stringsFrom(path) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    const messages = [...source.matchAll(/(?:'([^']+)'\s*=>|\['([^']+)'\]\s*=)\s*__\(\s*'((?:\\.|[^'\\])*)',/g)];
    return Object.fromEntries(messages.map(([, key, assignedKey, text]) => [
        key ?? assignedKey, text.replace(/\\(['\\])/g, '$1'),
    ]));
}

export const panelStrings = await stringsFrom('classes/Admin/Panel.php');
export const revisionStrings = { ...panelStrings, ...await stringsFrom('classes/Admin/RevisionBrowser.php') };
export const blockEditorStrings = { ...panelStrings, ...await stringsFrom('classes/Admin/BlockEditor.php') };
