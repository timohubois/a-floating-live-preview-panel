import { select } from '@wordpress/data';
import { initAcf } from './acf-fields.js';

// Legacy Gutenberg meta boxes are native forms in the parent document, not in the block canvas.
function forms() {
    // Let WordPress choose active locations; retain the existing markup fallback when its selector is absent.
    const locations = select('core/edit-post')?.getActiveMetaBoxLocations?.() ?? ['normal', 'side', 'advanced'];
    return [document.querySelector('.metabox-base-form'), ...locations.map((location) =>
        document.querySelector(`.edit-post-meta-boxes-area.is-${location} .metabox-location-${location}`)
        || document.querySelector(`#metaboxes .metabox-location-${location}`))].filter(Boolean);
}

export function createBlockEditorAcf(changed) {
    const editors = new Set();
    let capturing = false;
    let waiting = [];
    let storeValues = new Map();
    const onChange = () => { if (!capturing) changed(); };
    function watchEditor(editor) {
        if (!editor || editors.has(editor)) return;
        editors.add(editor);
        editor.on('input change undo redo SetContent', onChange);
    }
    const acf = initAcf(document, onChange, watchEditor);
    window.tinymce?.editors.forEach(watchEditor);
    window.tinymce?.on('AddEditor', onEditorAdded);
    function onEditorAdded(event) { watchEditor(event.editor); }
    function onInput(event) {
        if (acf.isField(event.target) && forms().some((form) => form.contains(event.target))) onChange();
    }
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput, true);
    // isSavingMetaBoxes() ends before ACF's asynchronous row refresh. No public completion
    // signal covers empty results too; observe replacement, not timing or private refresh methods.
    const observer = new MutationObserver(onChange);

    return {
        get ready() {
            waiting = waiting.filter(({ field, rows }) => field.isConnected && rows.some((row) => field.contains(row)));
            if (!waiting.length) observer.disconnect();
            return !waiting.length;
        },
        saved() {
            observer.disconnect();
            waiting = forms().flatMap((form) => [...form.querySelectorAll('.acf-repeater[data-pagination="1"]')]
                .map((field) => ({ field, rows: [...field.querySelectorAll(':scope > table > tbody > tr.acf-row:not(.acf-clone)')] }))
                .filter(({ rows }) => rows.length));
            for (const { field } of waiting) observer.observe(field, { childList: true, subtree: true });
            onChange();
        },
        observe() {
            // The opt-in ACF datastore keeps its controls synchronized. Read its public field
            // selector only to detect changes; native form capture retains paginated row deltas.
            const store = select('acf/fields');
            if (!store?.getFieldValue) return;
            const current = new Map();
            for (const form of forms()) {
                for (const field of window.acf.getFields({ parent: window.jQuery(form) })) {
                    const key = field.get('key');
                    current.set(key, store.getFieldValue(key));
                }
            }
            if (current.size !== storeValues.size || [...current].some(([key, value]) => storeValues.get(key) !== value)) {
                storeValues = current;
                onChange();
            }
        },
        capture() {
            capturing = true;
            const data = new URLSearchParams();
            try {
                window.tinymce?.triggerSave();
                for (const form of forms()) {
                    for (const [name, value] of new FormData(form)) {
                        if (typeof value === 'string' && acf.accepts(name)) data.append(name, value);
                    }
                }
            } finally { capturing = false; }
            return data;
        },
        destroy() {
            observer.disconnect();
            acf.destroy();
            document.removeEventListener('input', onInput);
            document.removeEventListener('change', onInput, true);
            window.tinymce?.off('AddEditor', onEditorAdded);
            for (const editor of editors) editor.off('input change undo redo SetContent', onChange);
        },
    };
}
