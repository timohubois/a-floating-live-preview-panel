// Optional integration: report changes to core; never refresh or save independently.
export function initAcf(form, changed, watchEditor) {
    const acf = window.acf;
    acf.addAction('wysiwyg_tinymce_init', watchEditor);
    for (const action of ['append', 'remove', 'sortstop', 'change_field']) acf.addAction(action, changed);

    // ACF uses jQuery events on inputs AND field containers; row moves also emit sortupdate.
    window.jQuery(form).on('input.aflppAcf change.aflppAcf sortupdate.aflppAcf', (event) => {
        if (event.target.closest('.acf-field')) changed();
    });

    return {
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
