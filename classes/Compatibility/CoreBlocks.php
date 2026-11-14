<?php

namespace AFloatingLivePreviewPanel\Compatibility;

use WP_Block;
use WP_Block_Type;
use WP_Block_Type_Registry;
use WP_Post;

/** Adapt core's ID-based excerpt reads without replacing its renderer or changing block identity. */
final class CoreBlocks
{
    private ?WP_Block_Type $excerptBlock = null;
    private ?WP_Post $post = null;

    public function __construct()
    {
        add_action('aflpp_preview_source', [$this, 'bindPreview'], 10, 2);
    }

    /** Source selection and authorization belong to FrontendPreview, not block rendering. */
    public function bindPreview(int $postId, int $sourceId): void
    {
        $this->unbindPreview();
        $type = WP_Block_Type_Registry::get_instance()->get_registered('core/post-excerpt');
        if (
            $postId < 1 || $sourceId < 1 || !$type
            || $type->render_callback !== 'render_block_core_post_excerpt'
            || !function_exists('render_block_core_post_excerpt')
        ) {
            return;
        }
        $post = get_post($postId);
        $source = get_post($sourceId);
        if (!$post || !$source) {
            return;
        }
        // Keep the parent clone's filter state raw; get_post() would reload it after display normalization.
        $source = sanitize_post(clone $source);
        $this->post = clone $post;
        foreach (['post_title', 'post_content', 'post_excerpt'] as $field) {
            $this->post->$field = $source->$field;
        }
        $this->excerptBlock = $type;
        $type->render_callback = [$this, 'renderExcerpt'];
        add_action('shutdown', [$this, 'unbindPreview'], PHP_INT_MAX);
    }

    public function renderExcerpt(array $attributes, string $content, WP_Block $block): string
    {
        if ($this->post && ($block->context['postId'] ?? null) === $this->post->ID) {
            // Only core's private call copy sees an object: get_the_excerpt() and
            // get_the_permalink() accept WP_Post and retain its original parent identity.
            // The real block's integer context, globals and cached post objects stay untouched.
            $block = clone $block;
            $block->context['postId'] = clone $this->post;
        }
        return render_block_core_post_excerpt($attributes, $content, $block);
    }

    /** Do not overwrite a later theme/plugin renderer when releasing our own binding. */
    public function unbindPreview(): void
    {
        if ($this->excerptBlock && $this->excerptBlock->render_callback === [$this, 'renderExcerpt']) {
            $this->excerptBlock->render_callback = 'render_block_core_post_excerpt';
        }
        remove_action('shutdown', [$this, 'unbindPreview'], PHP_INT_MAX);
        $this->excerptBlock = null;
        $this->post = null;
    }
}
