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
        add_action('admin_footer', [$this, 'renderPanel']);
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
            'adminCookiePath' => ADMIN_COOKIE_PATH,
            'available' => $post->post_status !== 'auto-draft' && wp_revisions_enabled($post),
            'strings' => [
                'title' => __('Live preview', 'a-floating-live-preview-panel'),
                'preview' => __('Preview', 'a-floating-live-preview-panel'),
                'move' => __('Move preview: drag or use arrow keys', 'a-floating-live-preview-panel'),
                'retry' => __('Try again', 'a-floating-live-preview-panel'),
                'takeOver' => __('Preview here', 'a-floating-live-preview-panel'),
                'takingOver' => __('Switching…', 'a-floating-live-preview-panel'),
                'switchingPreview' => __('Switching preview…', 'a-floating-live-preview-panel'),
                'waiting' => __(
                    'Waiting for the other tab to finish its current update.',
                    'a-floating-live-preview-panel'
                ),
                'handedOff' => __('Preview is paused here', 'a-floating-live-preview-panel'),
                'handedOffHelp' => __(
                    'Another tab now runs live updates. Starting here pauses that preview.',
                    'a-floating-live-preview-panel'
                ),
                'takeoverTimeout' => __('The other preview is still busy', 'a-floating-live-preview-panel'),
                'takeoverTimeoutHelp' => __(
                    'Try again, or close the preview in the other tab.',
                    'a-floating-live-preview-panel'
                ),
                'tabEdits' => __('Each tab keeps its own edits.', 'a-floating-live-preview-panel'),
                'expand' => __('Expand preview', 'a-floating-live-preview-panel'),
                'compact' => __('Make preview compact', 'a-floating-live-preview-panel'),
                'exitFullscreen' => __('Exit fullscreen', 'a-floating-live-preview-panel'),
                'return' => __('Return to editor', 'a-floating-live-preview-panel'),
                'pipFailed' => __('The preview couldn’t pop out.', 'a-floating-live-preview-panel'),
                'fullscreenFailed' => __('Couldn’t change fullscreen mode.', 'a-floating-live-preview-panel'),
                'windowNoticeHelp' => __('Continue in this panel.', 'a-floating-live-preview-panel'),
                'loading' => __('Loading preview…', 'a-floating-live-preview-panel'),
                'preparing' => __('Preparing your first preview.', 'a-floating-live-preview-panel'),
                'bootFailed' => __(
                    'Live preview could not start. Reload the editor or use WordPress Preview.',
                    'a-floating-live-preview-panel'
                ),
                'updating' => __('Updating preview…', 'a-floating-live-preview-panel'),
                'current' => __('Preview refreshed', 'a-floating-live-preview-panel'),
                'stale' => __('Changes pending…', 'a-floating-live-preview-panel'),
                'failed' => __('Preview couldn’t load', 'a-floating-live-preview-panel'),
                'failedHelp' => __('Try loading the preview again.', 'a-floating-live-preview-panel'),
                'refreshFailed' => __('Preview couldn’t refresh.', 'a-floating-live-preview-panel'),
                'previousPreview' => __('Showing the previous preview.', 'a-floating-live-preview-panel'),
                'reviewBeforeReload' => __(
                    'Review your edits, then reload the editor.',
                    'a-floating-live-preview-panel'
                ),
                'conflict' => __('Preview is running in another tab', 'a-floating-live-preview-panel'),
                'conflictHelp' => __(
                    'Starting it here pauses live updates in the other tab.',
                    'a-floating-live-preview-panel'
                ),
                'closeOther' => __('Finish in the other tab first', 'a-floating-live-preview-panel'),
                'closeOtherHelp' => __(
                    'Close its live preview, then start one here.',
                    'a-floating-live-preview-panel'
                ),
                'manualSwitchHint' => __(
                    'This browser can’t switch previews between tabs.',
                    'a-floating-live-preview-panel'
                ),
                'unavailableTitle' => __('Live preview isn’t available yet', 'a-floating-live-preview-panel'),
                'unavailable' => __(
                    'Save a draft first. If revisions are disabled, enable them for this post.',
                    'a-floating-live-preview-panel'
                ),
                'browserTitle' => __('Live preview isn’t supported here', 'a-floating-live-preview-panel'),
                'browser' => __(
                    'Open a secure, same-origin site in a browser with Web Locks support.',
                    'a-floating-live-preview-panel'
                ),
                'saving' => __('Finishing preview before continuing…', 'a-floating-live-preview-panel'),
                'nativePreview' => __('Preparing WordPress Preview…', 'a-floating-live-preview-panel'),
                'nativePreviewAcf' => __(
                    'WordPress Preview saved these repeater changes. Copy later edits and reload before saving again.',
                    'a-floating-live-preview-panel'
                ),
                'nativePreviewFailed' => __(
                    'Could not confirm WordPress Preview. Check its tab before continuing.',
                    'a-floating-live-preview-panel'
                ),
            ],
        ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
    }

    public function renderPanel(): void
    {
        if (!$this->editorPost()) {
            return;
        }

        require dirname($this->file) . '/assets/preview-panel/markup.php';
    }

    private function assetVersion(string $asset): string
    {
        return (string) filemtime(dirname($this->file) . '/assets/' . $asset);
    }
}
