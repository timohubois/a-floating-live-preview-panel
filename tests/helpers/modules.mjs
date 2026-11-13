import { readFile } from 'node:fs/promises';

// Give the existing VM fixtures explicit public-package mocks without executing WordPress in Node.
export async function sourceForVm(url) {
    const source = await readFile(url, 'utf8');
    return source
        .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];$/gm, (_, names, path) => {
            const bindings = names.replace(/\b(\w+)\s+as\s+(\w+)\b/g, '$1: $2');
            return `const { ${bindings} } = imports[${JSON.stringify(path)}];`;
        })
        .replace(/^export (function|const) /gm, '$1 ');
}
