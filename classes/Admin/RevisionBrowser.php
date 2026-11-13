<?php

namespace AFloatingLivePreviewPanel\Admin;

use AFloatingLivePreviewPanel\Preview\FrontendPreview;
use WP_Post;

/** Connect WordPress's revision browser without changing its comparison or restore behavior. */
final class RevisionBrowser
{
    public function __construct(
        private readonly FrontendPreview $preview,
        private readonly Panel $panel
    ) {
        add_action('admin_enqueue_scripts', [$this, 'enqueueRevisions']);
        add_action('admin_footer', [$this, 'renderPanel']);
        add_filter('wp_prepare_revision_for_js', [$this, 'revisionData'], 10, 3);
    }

    private function revisionPost(): ?WP_Post
    {
        $screen = get_current_screen();
        $post = get_post();
        if (
            !$screen || $screen->base !== 'revision' || !$post
            || !is_post_type_viewable($post->post_type) || !current_user_can('edit_post', $post->ID)
        ) {
            return null;
        }
        return $post;
    }

    public function revisionData(array $data, WP_Post $revision, WP_Post $post): array
    {
        $screenPost = $this->revisionPost();
        if ($screenPost && $screenPost->ID === $post->ID) {
            $data['aflppPreviewUrl'] = $this->preview->savedPreviewUrl($post, $revision->ID);
        }
        return $data;
    }

    public function enqueueRevisions(): void
    {
        $post = $this->revisionPost();
        if (!$post) {
            return;
        }
        $this->panel->enqueue('revisions', [
            'postId' => $post->ID,
            // Core's synthetic current-post entry does not always pass through revisionData().
            'currentPreviewUrl' => $this->preview->savedPreviewUrl($post, $post->ID),
            'strings' => [
                'title' => __('Revision preview', 'a-floating-live-preview-panel'),
                'preview' => __('Revision preview', 'a-floating-live-preview-panel'),
                'closeLivePreview' => __('Close revision preview', 'a-floating-live-preview-panel'),
                'preparing' => __(
                    'Loading the selected revision without restoring it.',
                    'a-floating-live-preview-panel'
                ),
                'bootFailed' => __(
                    'Revision preview could not start. WordPress comparison and restore are still available.',
                    'a-floating-live-preview-panel'
                ),
                'unavailableTitle' => __('Revision preview is unavailable', 'a-floating-live-preview-panel'),
                'unavailable' => __(
                    'This revision cannot be previewed. Reload the revision browser to update the selection.',
                    'a-floating-live-preview-panel'
                ),
                'browserTitle' => __('Revision preview isn’t supported here', 'a-floating-live-preview-panel'),
                'browser' => __('Open the admin and frontend on the same origin.', 'a-floating-live-preview-panel'),
                /* translators: 1: Revision date, 2: Revision author. */
                'revisionLabel' => __('%1$s — %2$s', 'a-floating-live-preview-panel'),
                'currentVersion' => __('Current version', 'a-floating-live-preview-panel'),
            ],
        ], ['revisions']);
    }

    public function renderPanel(): void
    {
        if ($this->revisionPost()) {
            $this->panel->render(__('Revision preview', 'a-floating-live-preview-panel'));
        }
    }
}
