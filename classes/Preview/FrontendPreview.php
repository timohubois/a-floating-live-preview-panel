<?php

namespace AFloatingLivePreviewPanel\Preview;

use AFloatingLivePreviewPanel\Compatibility\Acf;
use WP_Post;

/** Authorize preview reads and render only the selected source on the frontend. */
final class FrontendPreview
{
    private ?WP_Post $source = null;
    private int $previewPostId = 0;
    private string $previewToken = '';
    private bool $isolated = false;

    public function __construct(
        private readonly string $file,
        private readonly LivePreview $livePreview,
        private readonly Acf $acf
    ) {
        add_action('init', [$this, 'authorizePreview'], 20);
    }

    /** Saved history is read-only and may belong to any author the current user can read. */
    private function savedSource(int $postId, int $sourceId): ?WP_Post
    {
        $post = get_post($postId);
        $source = get_post($sourceId);
        $status = $post ? get_post_status_object($post->post_status) : null;
        if (
            !is_user_logged_in() || !$post || !$source || !is_post_type_viewable($post->post_type)
            // Match the public, protected and private statuses core can render in an authenticated preview.
            || !$status || !($status->public || $status->protected || $status->private)
            || !current_user_can('edit_post', $postId) || !current_user_can('read_post', $sourceId)
        ) {
            return null;
        }
        if ($sourceId === $postId) {
            return $source;
        }
        return $source->post_type === 'revision' && $source->post_status === 'inherit'
            && (int) $source->post_parent === $postId ? $source : null;
    }

    private function savedAction(int $postId, int $sourceId): string
    {
        // A separate namespace must never authorize the mutable internal live-preview revision.
        return 'aflpp_saved_' . $postId . '_' . $sourceId;
    }

    public function savedPreviewUrl(WP_Post $post, int $sourceId): ?string
    {
        if (!$this->savedSource($post->ID, $sourceId)) {
            return null;
        }
        return get_preview_post_link($post, [
            'aflpp_post' => $post->ID,
            'aflpp_revision' => $sourceId,
            'aflpp_saved' => '1',
            'aflpp_token' => wp_create_nonce($this->savedAction($post->ID, $sourceId)),
        ]);
    }

    public function authorizePreview(): void
    {
        if (!isset($_GET['aflpp_post'])) {
            return;
        }
        if (!defined('DONOTCACHEPAGE')) {
            define('DONOTCACHEPAGE', true);
        }
        nocache_headers();
        $postId = isset($_GET['aflpp_post']) && is_scalar($_GET['aflpp_post']) ? absint($_GET['aflpp_post']) : 0;
        $revisionId = isset($_GET['aflpp_revision']) && is_scalar($_GET['aflpp_revision'])
            ? absint($_GET['aflpp_revision']) : 0;
        $token = isset($_GET['aflpp_token']) && is_string($_GET['aflpp_token'])
            ? sanitize_text_field(wp_unslash($_GET['aflpp_token'])) : '';
        $saved = isset($_GET['aflpp_saved']);
        $source = null;
        if ($saved) {
            if ($_GET['aflpp_saved'] === '1' && $postId && $revisionId) {
                $source = $this->savedSource($postId, $revisionId);
            }
            $authorized = $source && wp_verify_nonce($token, $this->savedAction($postId, $revisionId));
        } else {
            $source = $this->livePreview->authorizedSource($postId, $revisionId, $token);
            $authorized = $source !== null;
        }
        if (!$authorized) {
            wp_die(
                esc_html__(
                    'This preview expired or is unavailable. Reload the editor or revision browser.',
                    'a-floating-live-preview-panel'
                ),
                '',
                ['response' => 403]
            );
        }

        $this->previewPostId = $postId;
        $this->previewToken = $token;
        $this->isolated = isset($_GET['aflpp_isolated']) && $_GET['aflpp_isolated'] === '1';
        $this->source = sanitize_post($source);
        // Bind core and compatibility reads to the authorized source, not the latest revision.
        remove_filter('the_preview', '_set_preview');
        add_filter('the_preview', [$this, 'readPost']);
        // Timber can reload the parent by ID instead of using WordPress's filtered preview object.
        add_filter('timber/post/import_data', [$this, 'readTimberPost'], PHP_INT_MAX, 2);
        $this->acf->bindPreview($postId, $this->source->ID, $saved);
        if ($saved) {
            add_filter('get_post_metadata', [$this, 'readRevisionMeta'], 10, 4);
        }
        add_action('template_redirect', [$this, 'checkPreviewTarget'], -1);
    }

    /** Only explicitly revisioned metadata comes from history; unrelated metadata stays current. */
    public function readRevisionMeta($value, int $postId, string $key, bool $single)
    {
        if (
            $value !== null || $postId !== $this->previewPostId || !$this->source
            || $this->source->ID === $postId
            || !in_array($key, wp_post_revision_meta_keys(get_post_type($postId)), true)
        ) {
            return $value;
        }
        // Core unwraps the first item for single reads. Keep array-valued meta intact and
        // return a falsey scalar for absent keys (also used by metadata_exists()).
        $values = get_post_meta($this->source->ID, $key, false);
        return $single && !$values ? '' : $values;
    }

    public function readPost(WP_Post $post): WP_Post
    {
        if ($post->ID === $this->previewPostId && $this->source) {
            foreach (['post_title', 'post_content', 'post_excerpt'] as $field) {
                $post->$field = $this->source->$field;
            }
        }
        return $post;
    }

    public function readTimberPost(array $data, object $post): array
    {
        if ((int) $post->ID === $this->previewPostId && $this->source) {
            foreach (['post_title', 'post_content', 'post_excerpt'] as $field) {
                $data[$field] = $this->source->$field;
            }
        }
        return $data;
    }

    public function checkPreviewTarget(): void
    {
        if (!is_preview() || !is_singular() || get_queried_object_id() !== $this->previewPostId) {
            // Native routing owns other destinations, including archives, redirects and error pages.
            // The authorized source remains bound only to its original post; do not label other output verified.
            return;
        }
        // Match isolated Gutenberg screens without disabling core's client-side media processing.
        // Older WordPress versions can also be isolated by the Gutenberg plugin.
        if ($this->isolated) {
            // Preserve site-supplied policies instead of replacing their resource-loading rules.
            $alreadyIsolated = function_exists('wp_is_cross_origin_isolated_request')
                ? wp_is_cross_origin_isolated_request()
                : (bool) preg_grep('/^Document-Isolation-Policy:/i', headers_list());
            if (!$alreadyIsolated) {
                if (function_exists('wp_send_document_isolation_policy_header')) {
                    wp_send_document_isolation_policy_header();
                } else {
                    header('Document-Isolation-Policy: isolate-and-credentialless');
                }
            }
        }
        // Core canonical redirects drop preview=true without native autosave parameters, losing our core-field overlay.
        remove_action('template_redirect', 'redirect_canonical');
        // Enhance only the original authorized singular HTML; never require it as the routing result.
        add_filter('show_admin_bar', '__return_false', PHP_INT_MAX);
        add_action('wp_head', function (): void {
            echo '<meta name="a-floating-live-preview-panel" content="' . esc_attr($this->previewToken) . '">';
        });
        add_action('wp_enqueue_scripts', function (): void {
            $asset = require dirname($this->file) . '/build/preview-navigation.asset.php';
            wp_enqueue_script(
                'a-floating-live-preview-panel-navigation',
                plugins_url('build/preview-navigation.js', $this->file),
                $asset['dependencies'],
                $asset['version'],
                false
            );
        });
    }
}
