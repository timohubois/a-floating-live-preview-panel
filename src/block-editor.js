import { createBlockEditor } from './screens/block-editor.js';
import { createLivePreview } from './preview/live-preview.js';
import { showStartupError } from './panel/startup-error.js';
import './panel/panel.css';

const config = window.aFloatingLivePreviewPanel;
if (config) {
    let editor;
    try {
        editor = createBlockEditor(config);
        editor.connect(createLivePreview(config, editor));
    } catch (error) {
        editor?.destroy();
        showStartupError(config.strings.bootFailed, error);
    }
}
