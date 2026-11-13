<?php

namespace AFloatingLivePreviewPanel\Admin;

use AFloatingLivePreviewPanel\Compatibility\Acf;
use AFloatingLivePreviewPanel\Preview\LivePreview;
use WP_Post;

/** Connect the classic editor to the shared panel and preview features. */
final class ClassicEditor
{
    public function __construct(
        private readonly LivePreview $preview,
        private readonly Acf $acf,
        private readonly Panel $panel
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

        $this->panel->enqueue('classic-editor', [
            'acfEnabled' => $this->acf->isAvailable(),
            'endpoint' => rest_url('a-floating-live-preview-panel/v1/posts/' . $post->ID . '/preview'),
            'postId' => $post->ID,
            'postTitle' => $post->post_title,
            'userId' => get_current_user_id(),
            'nonce' => wp_create_nonce('wp_rest'),
            'base' => $this->preview->fingerprint($post->ID),
            'adminCookiePath' => ADMIN_COOKIE_PATH,
            'available' => $post->post_status !== 'auto-draft' && wp_revisions_enabled($post),
            'strings' => [
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
                'bootFailed' => __(
                    'Live preview could not start. Reload the editor or use WordPress Preview.',
                    'a-floating-live-preview-panel'
                ),
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
                'saving' => __('Saving in WordPress…', 'a-floating-live-preview-panel'),
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
        ], array_merge(['jquery', 'autosave'], $this->acf->editorDependencies()));
    }

    public function renderPanel(): void
    {
        if (!$this->editorPost()) {
            return;
        }

        $this->panel->render();
    }
}
