// Optional integration: report changes to core; never refresh or save independently.
export function initAcf(form, changed, watchEditor) {
    const acf = window.acf;
    acf.addAction('wysiwyg_tinymce_init', watchEditor);
    for (const action of ['append', 'remove', 'sortstop', 'change_field']) acf.addAction(action, changed);

    // ACF uses jQuery events on inputs AND field containers; row moves also emit sortupdate.
    window.jQuery(form).on('input.flpAcf change.flpAcf sortupdate.flpAcf', (event) => {
        if (event.target.closest('.acf-field')) changed();
    });

    return {
        accepts(name) {
            return name === '_acf_nonce' || name.startsWith('acf[') || name.startsWith('_acf_fields[');
        },
    };
}
