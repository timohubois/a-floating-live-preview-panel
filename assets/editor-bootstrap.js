(() => {
    'use strict';

    // Keep classic WordPress dependencies ordered; load application code as native modules.
    const config = window.aFloatingLivePreviewPanel;
    const form = document.getElementById('post');
    if (!config || !form) return;

    // Observe native saves before asynchronous module loading can yield to heartbeat or form events.
    const nativeEditor = { idle: Promise.resolve(), saving: false };
    let finishNative;
    window.jQuery(document).on('heartbeat-send.aflpp', (event, data) => {
        if (data.wp_autosave) nativeEditor.idle = new Promise((resolve) => { finishNative = resolve; });
    }).on('heartbeat-tick.aflpp heartbeat-error.aflpp', () => {
        finishNative?.();
        finishNative = null;
    });
    const saving = (event) => {
        if (event.type === 'submit' || event.target.closest('#publish, #save-post, #post-preview')) nativeEditor.saving = true;
    };
    form.addEventListener('click', saving, true);
    form.addEventListener('submit', saving, true);
    const stopWatchingStartupSave = () => {
        form.removeEventListener('click', saving, true);
        form.removeEventListener('submit', saving, true);
    };

    Promise.all([
        import(config.editorModule),
        import(config.panelModule),
        import(config.viewportModule),
        import(config.scrollModule),
        config.acfModule ? import(config.acfModule) : null,
    ]).then(([editor, view, viewport, scroll, acf]) => {
        if (typeof view.createPreviewPanel !== 'function') throw new Error('Preview panel module has no initializer.');
        if (typeof viewport.createPreviewViewport !== 'function') throw new Error('Preview viewport module has no initializer.');
        if (typeof scroll.createPreviewScroll !== 'function') throw new Error('Preview scroll module has no initializer.');
        if (acf && typeof acf.initAcf !== 'function') throw new Error('ACF preview module has no initializer.');
        stopWatchingStartupSave();
        const createPreviewPanel = (strings, options) => view.createPreviewPanel(strings, options, viewport.createPreviewViewport);
        editor.initPreview(config, acf?.initAcf, nativeEditor, createPreviewPanel, scroll.createPreviewScroll);
    }).catch((error) => {
        stopWatchingStartupSave();
        window.jQuery(document).off('.aflpp');
        document.getElementById('aflpp-panel')?.remove();
        document.getElementById('aflpp-toggle')?.remove();
        const notice = document.createElement('div');
        notice.className = 'notice notice-error';
        notice.setAttribute('role', 'alert');
        const message = document.createElement('p');
        message.textContent = config.strings.bootFailed;
        notice.append(message);
        (document.getElementById('wpbody-content') || document.body).prepend(notice);
        console.error('A Floating Live Preview Panel could not start.', error);
    });
})();
