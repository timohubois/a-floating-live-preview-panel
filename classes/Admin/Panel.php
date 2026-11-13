<?php

namespace AFloatingLivePreviewPanel\Admin;

/** Own the shared admin window's assets, presentation and common labels. */
final class Panel
{
    public function __construct(private readonly string $file)
    {
    }

    public function enqueue(string $entry, array $config, array $dependencies = []): void
    {
        $asset = require dirname($this->file) . '/build/' . $entry . '.asset.php';
        wp_enqueue_style(
            'a-floating-live-preview-panel',
            plugins_url('build/' . $entry . '.css', $this->file),
            ['wp-components'],
            $asset['version']
        );
        wp_enqueue_script(
            'a-floating-live-preview-panel',
            plugins_url('build/' . $entry . '.js', $this->file),
            array_merge($dependencies, $asset['dependencies']),
            $asset['version'],
            true
        );
        $config['strings'] = array_merge($this->strings(), $config['strings'] ?? []);
        wp_add_inline_script(
            'a-floating-live-preview-panel',
            'window.aFloatingLivePreviewPanel = ' . wp_json_encode(
                $config,
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            ) . ';',
            'before'
        );
    }

    public function render(?string $title = null): void
    {
        $title ??= __('Live preview', 'a-floating-live-preview-panel');
        require dirname($this->file) . '/views/panel.php';
    }

    private function strings(): array
    {
        return [
            'title' => __('Live preview', 'a-floating-live-preview-panel'),
            'preview' => __('Preview', 'a-floating-live-preview-panel'),
            'move' => __('Move preview: drag or use arrow keys', 'a-floating-live-preview-panel'),
            'moved' => __('Preview moved', 'a-floating-live-preview-panel'),
            'resize' => __('Resize preview', 'a-floating-live-preview-panel'),
            'retry' => __('Try again', 'a-floating-live-preview-panel'),
            'actions' => __('Preview actions', 'a-floating-live-preview-panel'),
            'refresh' => __('Refresh preview', 'a-floating-live-preview-panel'),
            'close' => __('Close preview', 'a-floating-live-preview-panel'),
            'closeLivePreview' => __('Close live preview', 'a-floating-live-preview-panel'),
            'display' => __('Display', 'a-floating-live-preview-panel'),
            'openPreview' => __('Open preview in new tab', 'a-floating-live-preview-panel'),
            'popOut' => __('Pop out preview (PiP)', 'a-floating-live-preview-panel'),
            'fullscreen' => __('Enter fullscreen', 'a-floating-live-preview-panel'),
            'position' => __('Position', 'a-floating-live-preview-panel'),
            'bottomLeft' => __('Bottom left', 'a-floating-live-preview-panel'),
            'bottomCenter' => __('Bottom center', 'a-floating-live-preview-panel'),
            'bottomRight' => __('Bottom right', 'a-floating-live-preview-panel'),
            'size' => __('Size', 'a-floating-live-preview-panel'),
            'small' => __('Small', 'a-floating-live-preview-panel'),
            'large' => __('Large', 'a-floating-live-preview-panel'),
            'preferences' => __('Preferences', 'a-floating-live-preview-panel'),
            'rememberVisibility' => __('Remember preview visibility', 'a-floating-live-preview-panel'),
            'follow' => __('Scroll to changes', 'a-floating-live-preview-panel'),
            'reset' => __('Reset size and position', 'a-floating-live-preview-panel'),
            'viewport' => __('Preview viewport', 'a-floating-live-preview-panel'),
            'desktop' => __('Desktop', 'a-floating-live-preview-panel'),
            'tablet' => __('Tablet', 'a-floating-live-preview-panel'),
            'mobile' => __('Mobile', 'a-floating-live-preview-panel'),
            'expand' => __('Expand preview', 'a-floating-live-preview-panel'),
            'compact' => __('Make preview compact', 'a-floating-live-preview-panel'),
            'exitFullscreen' => __('Exit fullscreen', 'a-floating-live-preview-panel'),
            'pipFailed' => __('The preview couldn’t pop out.', 'a-floating-live-preview-panel'),
            'fullscreenFailed' => __('Couldn’t change fullscreen mode.', 'a-floating-live-preview-panel'),
            'windowNoticeHelp' => __('Continue in this panel.', 'a-floating-live-preview-panel'),
            'loading' => __('Loading preview…', 'a-floating-live-preview-panel'),
            'preparing' => __('Preparing your first preview.', 'a-floating-live-preview-panel'),
            'updating' => __('Updating preview…', 'a-floating-live-preview-panel'),
            'current' => __('Preview refreshed', 'a-floating-live-preview-panel'),
            'stale' => __('Changes pending…', 'a-floating-live-preview-panel'),
            'failed' => __('Preview couldn’t load', 'a-floating-live-preview-panel'),
            'failedHelp' => __('Try loading the preview again.', 'a-floating-live-preview-panel'),
            'refreshFailed' => __('Preview couldn’t refresh.', 'a-floating-live-preview-panel'),
            'previousPreview' => __('Showing the previous preview.', 'a-floating-live-preview-panel'),
        ];
    }
}
