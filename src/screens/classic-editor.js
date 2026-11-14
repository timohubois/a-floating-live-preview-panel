import { initAcf } from '../compatibility/acf-fields.js';
import { createLivePreview } from '../preview/live-preview.js';

// Classic fields and native form controls stay outside the shared preview lifecycle.
export function initLivePreview(config, nativeEditor) {
    const form = document.getElementById('post');
    if (!config || !form) return;
    let capturing = false;
    let acf;
    const editors = new WeakSet();
    nativeEditor.title = document.getElementById('title')?.value ?? config.postTitle;
    nativeEditor.preparePreview = async () => {
        capturing = true;
        let values;
        try {
            window.tinymce?.triggerSave();
            values = new FormData(form);
        } finally { capturing = false; }
        const data = new URLSearchParams();
        for (const [name, value] of values) {
            if (typeof value === 'string' && (
                ['post_title', 'content', 'excerpt'].includes(name) || acf?.accepts(name)
            )) data.append(name, value);
        }
        data.set('base', config.base);
        const response = await fetch(config.endpoint, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'X-WP-Nonce': config.nonce }, body: data,
        });
        const result = await response.json();
        if (!response.ok) throw Object.assign(new Error(result.message || config.strings.failed), { code: result.code });
        return result;
    };
    const preview = createLivePreview(config, nativeEditor);
    const changed = () => { if (!capturing) preview.changed(); };
    nativeEditor.onAutosave = changed;
    nativeEditor.beforePreview = () => {
        preview.pause(config.strings.nativePreview);
        return preview.pending;
    };
    nativeEditor.onPreview = (error, saved) => {
        // Remaining ACF row deltas still reference the pre-Preview draft; do not apply them twice.
        if (!error && saved && acf?.hasStructuralPaginationChanges()) {
            error = Object.assign(new Error(config.strings.nativePreviewAcf), { code: 'aflpp_source_changed' });
        }
        preview.resume(error);
    };
    function watchEditor(editor) {
        if (!editor || editors.has(editor)) return;
        editors.add(editor);
        editor.on('input change undo redo SetContent', changed);
    }
    if (window.tinymce) {
        window.tinymce.editors.forEach(watchEditor);
        window.tinymce.on('AddEditor', (event) => watchEditor(event.editor));
    }
    function cancelNativeSave() {
        if (!nativeEditor.saving) return;
        nativeEditor.saving = false;
        changed();
    }
    nativeEditor.onSaveCancelled = cancelNativeSave;
    acf = config.acfEnabled ? initAcf(form, changed, watchEditor, cancelNativeSave) : null;
    nativeEditor.isValidating = () => acf?.isValidating?.();
    function onFieldChange(event) {
        if (event.target.name === 'post_title') preview.setTitle(event.target.value);
        if (['post_title', 'content', 'excerpt'].includes(event.target.name) || acf?.isField(event.target)) changed();
    }
    nativeEditor.onFieldChange = onFieldChange;
    form.addEventListener('input', onFieldChange);
    // Quicktags emits non-bubbling native change events after toolbar and media insertions.
    form.addEventListener('change', onFieldChange, true);

    let drainingNativeSave = false;
    function continueNativeSave(event, resume) {
        if (event.defaultPrevented) return;
        if (drainingNativeSave) {
            nativeEditor.deferredSaves?.add(event);
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (nativeEditor.saving) return;
        nativeEditor.saving = true;
        preview.pause();
        const pending = preview.pending || (nativeEditor.previewing ? nativeEditor.idle : null);
        if (!pending) return;
        nativeEditor.deferredSaves?.add(event);
        event.preventDefault();
        event.stopImmediatePropagation();
        drainingNativeSave = true;
        const proceed = () => {
            drainingNativeSave = false;
            if (nativeEditor.saving) resume();
        };
        pending.then(proceed, proceed);
    }
    form.addEventListener('click', (event) => {
        const control = event.target.closest('#publish, #save-post');
        if (control && !control.disabled && !control.classList.contains('disabled')) {
            continueNativeSave(event, () => control.click());
        }
    }, true);
    form.addEventListener('submit', (event) => {
        if (form.querySelector('#wp-preview')?.value === 'dopreview') return;
        continueNativeSave(event, () => form.requestSubmit(event.submitter || undefined));
    }, true);
    preview.start();
}
