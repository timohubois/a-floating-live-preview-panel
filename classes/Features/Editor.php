<?php

namespace FloatingLivePreview\Features;

use FloatingLivePreview\Compatibility\Acf;
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
            'floating-live-preview',
            plugins_url('assets/editor.css', $this->file),
            [],
            $this->assetVersion('editor.css')
        );
        wp_enqueue_script(
            'floating-live-preview',
            plugins_url('assets/admin.js', $this->file),
            array_merge(['jquery', 'autosave', 'wp-preferences'], $this->acf->editorDependencies()),
            $this->assetVersion('admin.js'),
            true
        );
        wp_add_inline_script('floating-live-preview', 'window.floatingLivePreview = ' . wp_json_encode([
            'editorModule' => add_query_arg(
                'ver',
                $this->assetVersion('editor.js'),
                plugins_url('assets/editor.js', $this->file)
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
            'endpoint' => rest_url('floating-live-preview/v1/posts/' . $post->ID . '/preview'),
            'postId' => $post->ID,
            'postTitle' => $post->post_title,
            'userId' => get_current_user_id(),
            'nonce' => wp_create_nonce('wp_rest'),
            'base' => $this->preview->fingerprint($post->ID),
            'available' => $post->post_status !== 'auto-draft' && wp_revisions_enabled($post),
            'strings' => [
                'title' => __('Live preview', 'floating-live-preview'),
                'preview' => __('Preview', 'floating-live-preview'),
                'move' => __('Move preview: drag or use arrow keys', 'floating-live-preview'),
                'resizeTop' => __(
                    'Resize top edge: drag or use Up/Down arrows; Shift for larger steps.',
                    'floating-live-preview'
                ),
                'resizeTopRight' => __(
                    'Resize top-right corner: drag or use arrow keys; Shift for larger steps.',
                    'floating-live-preview'
                ),
                'resizeRight' => __(
                    'Resize right edge: drag or use Left/Right arrows; Shift for larger steps.',
                    'floating-live-preview'
                ),
                'resizeBottomRight' => __(
                    'Resize bottom-right corner: drag or use arrow keys; Shift for larger steps.',
                    'floating-live-preview'
                ),
                'resizeBottom' => __(
                    'Resize bottom edge: drag or use Up/Down arrows; Shift for larger steps.',
                    'floating-live-preview'
                ),
                'resizeBottomLeft' => __(
                    'Resize bottom-left corner: drag or use arrow keys; Shift for larger steps.',
                    'floating-live-preview'
                ),
                'resizeLeft' => __(
                    'Resize left edge: drag or use Left/Right arrows; Shift for larger steps.',
                    'floating-live-preview'
                ),
                'resizeTopLeft' => __(
                    'Resize top-left corner: drag or use arrow keys; Shift for larger steps.',
                    'floating-live-preview'
                ),
                'reset' => __('Reset size and position', 'floating-live-preview'),
                'close' => __('Close preview', 'floating-live-preview'),
                'retry' => __('Retry', 'floating-live-preview'),
                'takeOver' => __('Take over', 'floating-live-preview'),
                'takingOver' => __('Taking over…', 'floating-live-preview'),
                'waiting' => __('Waiting for the other preview to finish…', 'floating-live-preview'),
                'handedOff' => __(
                    'Live preview is paused in this tab. Take over to continue here.',
                    'floating-live-preview'
                ),
                'takeoverTimeout' => __(
                    'The other preview is still busy. Try again, or close it in the other tab.',
                    'floating-live-preview'
                ),
                'refresh' => __('Refresh preview', 'floating-live-preview'),
                'expand' => __('Expand preview', 'floating-live-preview'),
                'compact' => __('Make preview compact', 'floating-live-preview'),
                'fullscreen' => __('Enter fullscreen', 'floating-live-preview'),
                'exitFullscreen' => __('Exit fullscreen', 'floating-live-preview'),
                'pip' => __('Pop out preview', 'floating-live-preview'),
                'pipHint' => __('PiP', 'floating-live-preview'),
                'return' => __('Return to editor', 'floating-live-preview'),
                'pipUnavailable' => __('Picture-in-Picture is not available in this browser.', 'floating-live-preview'),
                'actions' => __('Preview actions', 'floating-live-preview'),
                'display' => __('Display', 'floating-live-preview'),
                'layout' => __('Layout', 'floating-live-preview'),
                'preferences' => __('Preferences', 'floating-live-preview'),
                'dockLeft' => __('Dock bottom left', 'floating-live-preview'),
                'dockRight' => __('Dock bottom right', 'floating-live-preview'),
                'loading' => __('Loading preview…', 'floating-live-preview'),
                'bootFailed' => __(
                    'Live preview could not start. Reload the editor or use WordPress Preview.',
                    'floating-live-preview'
                ),
                'viewport' => __('Preview viewport', 'floating-live-preview'),
                'desktop' => __('Desktop', 'floating-live-preview'),
                'tablet' => __('Tablet', 'floating-live-preview'),
                'mobile' => __('Mobile', 'floating-live-preview'),
                'viewportNotice' => __('Viewport width and scale; not device emulation.', 'floating-live-preview'),
                'follow' => __('Scroll to changes', 'floating-live-preview'),
                'rememberVisibility' => __('Remember preview visibility', 'floating-live-preview'),
                'openPreview' => __('Open preview in new tab', 'floating-live-preview'),
                'updating' => __('Refreshing preview…', 'floating-live-preview'),
                'current' => __('Preview refreshed', 'floating-live-preview'),
                'stale' => __('Changes pending…', 'floating-live-preview'),
                'failed' => __(
                    'Preview could not be loaded. Retry or open preview in a new tab.',
                    'floating-live-preview'
                ),
                'conflict' => __(
                    'Live preview is active in another tab. Take over to use this tab.',
                    'floating-live-preview'
                ),
                'closeOther' => __('Close live preview in the other editor tab first.', 'floating-live-preview'),
                'unavailable' => __(
                    'Save a draft first and enable post revisions to use live preview.',
                    'floating-live-preview'
                ),
                'browser' => __(
                    'Live preview needs a secure, same-origin site and a browser with Web Locks support.',
                    'floating-live-preview'
                ),
                'saving' => __('Finishing preview before continuing…', 'floating-live-preview'),
            ],
        ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
    }

    private function assetVersion(string $asset): string
    {
        return (string) filemtime(dirname($this->file) . '/assets/' . $asset);
    }
}
