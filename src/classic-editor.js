import { createNativeEditor } from './classic-editor/native-editor.js';
import { initLivePreview } from './classic-editor/editor.js';
import { showStartupError } from './panel/startup-error.js';
import './panel/panel.css';

const config = window.aFloatingLivePreviewPanel;
const form = document.getElementById('post');
if (config && form) {
    // Bind native observers first. All plugin modules are bundled, so initialization cannot yield to a save.
    const nativeEditor = createNativeEditor(config, form);
    try {
        initLivePreview(config, nativeEditor);
    } catch (error) {
        nativeEditor.destroy();
        showStartupError(config.strings.bootFailed, error);
    }
}
