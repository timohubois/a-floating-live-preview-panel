<?php

namespace AFloatingLivePreviewPanel\Features;

use AFloatingLivePreviewPanel\Compatibility\Acf;
use WP_Post;

/** Own classic-editor eligibility, assets, module configuration and UI strings. */
final class Editor
{
    public function __construct(
        private readonly string $file,
        private readonly Preview $preview,
        private readonly Acf $acf
    ) {
        add_action('admin_enqueue_scripts', [$this, 'enqueueEditor']);
    }

    private function editorPost(): ?WP_Post
    {
        $screen = get_current_screen();
        $post = get_post();

        if (
            !$screen || $screen->base !== 'post' || $screen->is_block_editor()
            || !$post || !is_post_type_viewable($post->post_type)
            || !current_user_can('edit_post', $post->ID)
        ) {
            return null;
        }

        return $post;
    }

    public function enqueueEditor(): void
    {
        $post = $this->editorPost();
        if (!$post) {
            return;
        }

        wp_enqueue_style(
            'a-floating-live-preview-panel',
            plugins_url('assets/preview-panel/style.css', $this->file),
            [],
            $this->assetVersion('preview-panel/style.css')
        );
        wp_enqueue_script(
            'a-floating-live-preview-panel',
            plugins_url('assets/editor-bootstrap.js', $this->file),
            array_merge(['jquery', 'autosave', 'wp-preferences'], $this->acf->editorDependencies()),
            $this->assetVersion('editor-bootstrap.js'),
            true
        );
        wp_add_inline_script('a-floating-live-preview-panel', 'window.aFloatingLivePreviewPanel = ' . wp_json_encode([
            'editorModule' => add_query_arg(
                'ver',
                $this->assetVersion('editor-preview.js'),
                plugins_url('assets/editor-preview.js', $this->file)
            ),
            'panelModule' => add_query_arg(
                'ver',
                $this->assetVersion('preview-panel/index.js'),
                plugins_url('assets/preview-panel/index.js', $this->file)
            ),
            'viewportModule' => add_query_arg(
                'ver',
                $this->assetVersion('preview-panel/viewport.js'),
                plugins_url('assets/preview-panel/viewport.js', $this->file)
            ),
            'scrollModule' => add_query_arg(
                'ver',
                $this->assetVersion('preview-scroll.js'),
                plugins_url('assets/preview-scroll.js', $this->file)
            ),
            'acfModule' => $this->acf->editorModule($this->file),
            'endpoint' => rest_url('a-floating-live-preview-panel/v1/posts/' . $post->ID . '/preview'),
            'postId' => $post->ID,
            'postTitle' => $post->post_title,
            'userId' => get_current_user_id(),
            'nonce' => wp_create_nonce('wp_rest'),
            'base' => $this->preview->fingerprint($post->ID),
            'available' => $post->post_status !== 'auto-draft' && wp_revisions_enabled($post),
            'strings' => [
                'title' => __('Live preview', 'a-floating-live-preview-panel'),
                'preview' => __('Preview', 'a-floating-live-preview-panel'),
                'move' => __('Move preview: drag or use arrow keys', 'a-floating-live-preview-panel'),
                'resizeTop' => __(
                    'Resize top edge: drag or use Up/Down arrows; Shift for larger steps.',
                    'a-floating-live-preview-panel'
                ),
                'resizeTopRight' => __(
                    'Resize top-right corner: drag or use arrow keys; Shift for larger steps.',
                    'a-floating-live-preview-panel'
                ),
                'resizeRight' => __(
                    'Resize right edge: drag or use Left/Right arrows; Shift for larger steps.',
                    'a-floating-live-preview-panel'
                ),
                'resizeBottomRight' => __(
                    'Resize bottom-right corner: drag or use arrow keys; Shift for larger steps.',
                    'a-floating-live-preview-panel'
                ),
                'resizeBottom' => __(
                    'Resize bottom edge: drag or use Up/Down arrows; Shift for larger steps.',
                    'a-floating-live-preview-panel'
                ),
                'resizeBottomLeft' => __(
                    'Resize bottom-left corner: drag or use arrow keys; Shift for larger steps.',
                    'a-floating-live-preview-panel'
                ),
                'resizeLeft' => __(
                    'Resize left edge: drag or use Left/Right arrows; Shift for larger steps.',
                    'a-floating-live-preview-panel'
                ),
                'resizeTopLeft' => __(
                    'Resize top-left corner: drag or use arrow keys; Shift for larger steps.',
                    'a-floating-live-preview-panel'
                ),
                'reset' => __('Reset size and position', 'a-floating-live-preview-panel'),
                'close' => __('Close preview', 'a-floating-live-preview-panel'),
                'retry' => __('Retry', 'a-floating-live-preview-panel'),
                'takeOver' => __('Take over', 'a-floating-live-preview-panel'),
                'takingOver' => __('Taking over…', 'a-floating-live-preview-panel'),
                'waiting' => __('Waiting for the other preview to finish…', 'a-floating-live-preview-panel'),
                'handedOff' => __(
                    'Live preview is paused in this tab. Take over to continue here.',
                    'a-floating-live-preview-panel'
                ),
                'takeoverTimeout' => __(
                    'The other preview is still busy. Try again, or close it in the other tab.',
                    'a-floating-live-preview-panel'
                ),
                'refresh' => __('Refresh preview', 'a-floating-live-preview-panel'),
                'expand' => __('Expand preview', 'a-floating-live-preview-panel'),
                'compact' => __('Make preview compact', 'a-floating-live-preview-panel'),
                'fullscreen' => __('Enter fullscreen', 'a-floating-live-preview-panel'),
                'exitFullscreen' => __('Exit fullscreen', 'a-floating-live-preview-panel'),
                'pip' => __('Pop out preview', 'a-floating-live-preview-panel'),
                'pipHint' => __('PiP', 'a-floating-live-preview-panel'),
                'return' => __('Return to editor', 'a-floating-live-preview-panel'),
                'pipUnavailable' => __(
                    'Picture-in-Picture is not available in this browser.',
                    'a-floating-live-preview-panel'
                ),
                'actions' => __('Preview actions', 'a-floating-live-preview-panel'),
                'display' => __('Display', 'a-floating-live-preview-panel'),
                'layout' => __('Layout', 'a-floating-live-preview-panel'),
                'preferences' => __('Preferences', 'a-floating-live-preview-panel'),
                'dockLeft' => __('Dock bottom left', 'a-floating-live-preview-panel'),
                'dockRight' => __('Dock bottom right', 'a-floating-live-preview-panel'),
                'loading' => __('Loading preview…', 'a-floating-live-preview-panel'),
                'bootFailed' => __(
                    'Live preview could not start. Reload the editor or use WordPress Preview.',
                    'a-floating-live-preview-panel'
                ),
                'viewport' => __('Preview viewport', 'a-floating-live-preview-panel'),
                'desktop' => __('Desktop', 'a-floating-live-preview-panel'),
                'tablet' => __('Tablet', 'a-floating-live-preview-panel'),
                'mobile' => __('Mobile', 'a-floating-live-preview-panel'),
                'viewportNotice' => __(
                    'Viewport width and scale; not device emulation.',
                    'a-floating-live-preview-panel'
                ),
                'follow' => __('Scroll to changes', 'a-floating-live-preview-panel'),
                'rememberVisibility' => __('Remember preview visibility', 'a-floating-live-preview-panel'),
                'openPreview' => __('Open preview in new tab', 'a-floating-live-preview-panel'),
                'updating' => __('Refreshing preview…', 'a-floating-live-preview-panel'),
                'current' => __('Preview refreshed', 'a-floating-live-preview-panel'),
                'stale' => __('Changes pending…', 'a-floating-live-preview-panel'),
                'failed' => __(
                    'Preview could not be loaded. Retry or open preview in a new tab.',
                    'a-floating-live-preview-panel'
                ),
                'conflict' => __(
                    'Live preview is active in another tab. Take over to use this tab.',
                    'a-floating-live-preview-panel'
                ),
                'closeOther' => __(
                    'Close live preview in the other editor tab first.',
                    'a-floating-live-preview-panel'
                ),
                'unavailable' => __(
                    'Save a draft first and enable post revisions to use live preview.',
                    'a-floating-live-preview-panel'
                ),
                'browser' => __(
                    'Live preview needs a secure, same-origin site and a browser with Web Locks support.',
                    'a-floating-live-preview-panel'
                ),
                'saving' => __('Finishing preview before continuing…', 'a-floating-live-preview-panel'),
            ],
        ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
    }

    private function assetVersion(string $asset): string
    {
        return (string) filemtime(dirname($this->file) . '/assets/' . $asset);
    }
}
