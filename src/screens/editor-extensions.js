import { createHooks, doAction } from '@wordpress/hooks';

// Native WordPress hooks, scoped to one editor lifetime; no integration discovery or registry.
export function createEditorExtensions(setupAction, context) {
    const hooks = createHooks();
    const cleanups = [];
    let failure;
    let destroyed = false;
    function failed(error) {
        failure ??= error?.code === 'aflpp_integration_failed' ? error
            : Object.assign(new Error(context.config.strings.integrationFailed), {
                code: 'aflpp_integration_failed', cause: error,
            });
    }
    const extensions = {
        get error() { return failure; },
        filter(name, value, ...args) {
            if (destroyed || failure) return value;
            try {
                const result = hooks.applyFilters(name, value, ...args);
                if (name === 'additionalPreviewValues') {
                    if (Object.prototype.toString.call(result) !== '[object Object]' || Object.values(result).some((item) =>
                        item !== null && !['string', 'boolean'].includes(typeof item)
                        && !(typeof item === 'number' && Number.isFinite(item)))) {
                        throw new TypeError('Preview values must be a plain object of scalar values.');
                    }
                }
                return result;
            } catch (error) { failed(error); return value; }
        },
        action(name, ...args) {
            if (destroyed || failure) return;
            try { hooks.doAction(name, ...args); }
            catch (error) { failed(error); }
        },
        capture(body, values = null) {
            if (destroyed && !failure) failed(new Error('This editor session has ended.'));
            const original = body === null ? null : new URLSearchParams(body);
            const result = extensions.filter('previewFormBody', body, values);
            if (result !== null && !(result instanceof URLSearchParams)) {
                failed(new TypeError('Preview capture must return URLSearchParams or null.'));
            }
            if (!failure && original !== null && (result === null || [...original.keys()].some((name) => {
                const expected = original.getAll(name), actual = result.getAll(name);
                return actual.length !== expected.length || expected.some((value, index) => actual[index] !== value);
            }))) {
                failed(new TypeError('Preview capture must preserve the classic form body.'));
            }
            if (failure) throw failure;
            return result;
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            // One broken cleanup must not retain another integration's listeners.
            for (const cleanup of cleanups.reverse()) {
                try { cleanup(); } catch (error) { failed(error); }
            }
            cleanups.length = 0;
        },
    };
    try {
        doAction(setupAction, {
            ...context, hooks,
            onDestroy(cleanup) { cleanups.push(cleanup); },
        });
    } catch (error) {
        failed(error);
        extensions.destroy();
    }
    return extensions;
}
