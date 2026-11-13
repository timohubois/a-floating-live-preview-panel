// Optional integration: report changes to core; never refresh or save independently.
export function initAcf(form, changed, watchEditor, cancelNativeSave) {
    const acf = window.acf;
    acf.addAction('wysiwyg_tinymce_init', watchEditor);
    for (const action of ['append', 'remove', 'sortstop', 'change_field']) acf.addAction(action, changed);
    acf.addAction('validation_failure', ($form) => {
        if ($form[0] === form) cancelNativeSave?.();
    });

    function isField(target) {
        return !!target.closest('.acf-field');
    }

    // Native input/change events belong to the coordinator; bridge jQuery-only events and row sorting.
    window.jQuery(form).on('input.aflppAcf change.aflppAcf sortupdate.aflppAcf', (event) => {
        if ((!event.originalEvent || event.type === 'sortupdate') && isField(event.target)) changed();
    });

    return {
        isField,
        isValidating() { return form.classList.contains('is-validating'); },
        hasStructuralPaginationChanges() {
            return !!form.querySelector(
                '.acf-repeater[data-pagination="1"] .acf-row:is(.acf-added, .acf-inserted, .acf-reordered, .acf-deleted)'
            );
        },
        accepts(name) {
            return name === '_acf_nonce' || name.startsWith('acf[') || name.startsWith('_acf_fields[');
        },
    };
}
