<?php

namespace AFloatingLivePreviewPanel\Compatibility;

use WP_Post;

/** Make Timber's ID-based post imports respect the already-authorized preview source. */
final class Timber
{
    private int $previewPostId = 0;
    private ?WP_Post $source = null;

    public function __construct()
    {
        add_action('aflpp_preview_source', [$this, 'bindPreview'], 10, 2);
    }

    /** Core owns authorization and source selection; this adapter only binds Timber reads. */
    public function bindPreview(int $postId, int $sourceId): void
    {
        $this->unbindPreview();
        // Themes may load Timber's autoloader after our plugin bootstrap.
        if (!class_exists(\Timber\Timber::class) || $postId < 1 || $sourceId < 1) {
            return;
        }
        $source = get_post($sourceId);
        if (!$source) {
            return;
        }
        $this->previewPostId = $postId;
        $this->source = sanitize_post($source);
        // Timber can reload the parent by ID instead of using WordPress's filtered preview object.
        add_filter('timber/post/import_data', [$this, 'readPost'], PHP_INT_MAX, 2);
        add_action('shutdown', [$this, 'unbindPreview'], PHP_INT_MAX);
    }

    /** Idempotent cleanup for rebinding and the end of the frontend request. */
    public function unbindPreview(): void
    {
        remove_filter('timber/post/import_data', [$this, 'readPost'], PHP_INT_MAX);
        remove_action('shutdown', [$this, 'unbindPreview'], PHP_INT_MAX);
        $this->previewPostId = 0;
        $this->source = null;
    }

    public function readPost(array $data, object $post): array
    {
        if ($this->source && (int) $post->ID === $this->previewPostId) {
            foreach (['post_title', 'post_content', 'post_excerpt'] as $field) {
                $data[$field] = $this->source->$field;
            }
        }
        return $data;
    }
}
