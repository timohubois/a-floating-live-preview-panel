import { createPreviewPanel as createPanelView } from './preview-panel/index.js';
import { createPreviewViewport } from './preview-panel/viewport.js';
import { createPreviewControls } from './preview-panel/controls.js';
import { createPreviewFrame } from './preview-frame.js';

// Core registers its own ready callback first. Do not replace or initialize the native revision UI.
window.jQuery(() => {
    const config = window.aFloatingLivePreviewPanel;
    if (!config) return;
    Promise.all([
        import(/* webpackIgnore: true */ config.revisionsModule),
        import(/* webpackIgnore: true */ config.scrollModule),
    ]).then(([revisions, scroll]) => {
        const model = window.wp?.revisions?.view?.frame?.model;
        if (!model || typeof model.get !== 'function' || typeof model.on !== 'function'
            || typeof model.off !== 'function' || typeof revisions.initRevisionsPreview !== 'function') {
            throw new Error('The native revision selection is unavailable.');
        }
        const createPreviewPanel = (strings, options) => createPanelView(
            strings, options, createPreviewViewport, createPreviewControls
        );
        revisions.initRevisionsPreview(config, model, createPreviewPanel, scroll.createPreviewScroll, createPreviewFrame);
    }).catch((error) => {
        document.getElementById('aflpp-panel')?.remove();
        document.getElementById('aflpp-toggle')?.remove();
        const notice = document.createElement('div');
        notice.className = 'notice notice-error';
        notice.setAttribute('role', 'alert');
        const message = document.createElement('p');
        message.textContent = config.strings.bootFailed;
        notice.append(message);
        (document.getElementById('wpbody-content') || document.body).prepend(notice);
        console.error('Revision preview could not start.', error);
    });
});
