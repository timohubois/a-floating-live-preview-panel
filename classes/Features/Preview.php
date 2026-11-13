<?php

namespace AFloatingLivePreviewPanel\Features;

use AFloatingLivePreviewPanel\Compatibility\Acf;
use WP_Error;
use WP_Post;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/** Own isolated preview writes, integrity checks and authorized revision reads. */
final class Preview
{
    private const POST_STATUS = 'aflpp-preview';

    private ?WP_Post $source = null;
    private int $previewPostId = 0;
    private string $previewToken = '';
    private int $autosavePostId = 0;

    public function __construct(private readonly string $file, private readonly Acf $acf)
    {
        add_action('rest_api_init', [$this, 'registerRoutes']);
        add_action('init', [$this, 'registerStatus']);
        add_action('init', [$this, 'authorizePreview'], 20);
        add_action('post_updated', [$this, 'deletePreviews']);
        // Core's heartbeat_autosave runs at priority 500.
        add_filter('heartbeat_received', [$this, 'trackAutosave'], 499, 2);
        add_filter('heartbeat_received', [$this, 'rebaseAutosave'], 501);
    }

    /** Core autosave lookups and revision history only select revisions with status inherit. */
    public function registerStatus(): void
    {
        register_post_status(self::POST_STATUS, [
            'internal' => true,
            'public' => false,
            'exclude_from_search' => true,
            'show_in_admin_all_list' => false,
            'show_in_admin_status_list' => false,
        ]);
    }

    public function registerRoutes(): void
    {
        register_rest_route('a-floating-live-preview-panel/v1', '/posts/(?P<id>\d+)/preview', [
            'methods' => WP_REST_Server::CREATABLE,
            'permission_callback' => [$this, 'canPreparePreview'],
            'callback' => [$this, 'preparePreview'],
            'args' => [
                'id' => ['type' => 'integer', 'minimum' => 1, 'required' => true],
                'base' => ['type' => 'string', 'pattern' => '^[a-f0-9]{64}$', 'required' => true],
                'post_title' => ['type' => 'string'],
                'content' => ['type' => 'string'],
                'excerpt' => ['type' => 'string'],
            ],
        ]);
    }

    public function canPreparePreview(WP_REST_Request $request): bool|WP_Error
    {
        $post = get_post((int) $request['id']);
        if (
            !is_user_logged_in() || !$post || !is_post_type_viewable($post->post_type)
            || !current_user_can('edit_post', $post->ID)
        ) {
            return new WP_Error(
                'aflpp_cannot_preview',
                __('You cannot preview this post.', 'a-floating-live-preview-panel'),
                ['status' => rest_authorization_required_code()]
            );
        }
        return true;
    }

    private function assetVersion(string $asset): string
    {
        return (string) filemtime(dirname($this->file) . '/assets/' . $asset);
    }

    /** Core and metadata only; heartbeat/editor bookkeeping does not invalidate a preview. */
    public function fingerprint(int $postId): string
    {
        $meta = get_post_meta($postId);
        unset($meta['_edit_lock'], $meta['_edit_last']);
        ksort($meta);

        return hash('sha256', (string) wp_json_encode([get_post($postId, ARRAY_A), $meta]));
    }

    /** Only the same editor's successful native autosave may advance its known saved state. */
    public function trackAutosave(array $response, array $data): array
    {
        $this->autosavePostId = 0;
        $postId = isset($data['wp_autosave']['post_id']) && is_scalar($data['wp_autosave']['post_id'])
            ? absint($data['wp_autosave']['post_id']) : 0;
        if (
            $postId && isset($data['aflpp_base']) && is_string($data['aflpp_base'])
            && current_user_can('edit_post', $postId)
            && hash_equals($this->fingerprint($postId), $data['aflpp_base'])
        ) {
            $this->autosavePostId = $postId;
        }
        return $response;
    }

    public function rebaseAutosave(array $response): array
    {
        if ($this->autosavePostId && !empty($response['wp_autosave']['success'])) {
            $response['aflpp_base'] = $this->fingerprint($this->autosavePostId);
        }
        return $response;
    }

    private function stateAction(int $postId, int $revisionId): string
    {
        return 'aflpp_read_' . $postId . '_' . $revisionId . '_' . $this->fingerprint($postId)
            . ($revisionId ? $this->fingerprint($revisionId) : '');
    }

    public function preparePreview(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        // Editor writes require their REST nonce, including internal or alternative-auth requests.
        if (!wp_verify_nonce((string) $request->get_header('X-WP-Nonce'), 'wp_rest')) {
            return new WP_Error(
                'aflpp_invalid_nonce',
                __('The preview request expired. Reload the editor.', 'a-floating-live-preview-panel'),
                ['status' => 403]
            );
        }

        $postId = (int) $request['id'];
        $post = get_post($postId);
        $input = $request->get_params();

        require_once ABSPATH . 'wp-admin/includes/post.php';

        if (
            !in_array($post->post_status, ['draft', 'pending', 'publish', 'private', 'future'], true)
            || !wp_revisions_enabled($post) || wp_check_post_lock($postId)
            || !hash_equals($this->fingerprint($postId), $input['base'])
        ) {
            return new WP_Error(
                'aflpp_preview_conflict',
                __(
                    'The post changed, is locked, or cannot use revisions. Reload the editor.',
                    'a-floating-live-preview-panel'
                ),
                ['status' => 409]
            );
        }
        $base = $this->fingerprint($postId);

        // REST values are unslashed. Native save APIs sanitize HTML and need slashed form data.
        $payload = [
            'post_ID' => $postId,
            'post_type' => $post->post_type,
            'post_status' => $post->post_status,
            'post_author' => $post->post_author,
            'post_title' => $post->post_title,
            'content' => $post->post_content,
            'excerpt' => $post->post_excerpt,
            'wp-preview' => 'dopreview',
        ];
        foreach (['post_title', 'content', 'excerpt'] as $key) {
            if (isset($input[$key])) {
                $payload[$key] = $input[$key];
            }
        }
        $payload = $this->acf->preparePayload($payload, $input);
        if (is_wp_error($payload)) {
            return $payload;
        }

        $payload = wp_slash($payload);

        // ACF's classic-preview form hooks read $_POST during the revision save.
        $originalPost = $_POST;
        $revisionId = 0;
        $seed = fn (int $revisionId) => $this->seedPreviewMeta($postId, $revisionId);
        add_action('save_post_revision', $seed, 0);
        if (!defined('DOING_AUTOSAVE')) {
            define('DOING_AUTOSAVE', true);
        }
        try {
            $_POST = $payload;
            $revisionId = $this->writeRevision($postId, $payload);
        } finally {
            remove_action('save_post_revision', $seed, 0);
            $_POST = $originalPost;
            $acfError = $this->acf->verifySave(is_wp_error($revisionId) ? 0 : (int) $revisionId);
        }
        if (is_wp_error($revisionId)) {
            return new WP_Error('aflpp_preview_failed', $revisionId->get_error_message(), ['status' => 400]);
        }
        if ($acfError) {
            return $acfError;
        }
        $revisionId = (int) $revisionId;
        if (!$revisionId || !$this->ownsRevision($postId, $revisionId)) {
            return new WP_Error(
                'aflpp_revision_unavailable',
                __('The preview revision is unavailable.', 'a-floating-live-preview-panel'),
                ['status' => 409]
            );
        }

        if (!hash_equals($base, $this->fingerprint($postId))) {
            return new WP_Error(
                'aflpp_source_changed',
                __('The saved post changed during preview. Reload the editor.', 'a-floating-live-preview-panel'),
                ['status' => 409]
            );
        }
        $action = $this->stateAction($postId, $revisionId);
        return new WP_REST_Response([
            // Our state token authorizes this revision; native autosave parameters would select recovery data.
            'url' => get_preview_post_link($post, [
                'aflpp_post' => $postId,
                'aflpp_revision' => $revisionId,
                'aflpp_token' => wp_create_nonce($action),
            ]),
        ]);
    }

    private function revisionName(int $postId): string
    {
        return $postId . '-aflpp-preview-' . get_current_user_id();
    }

    /** Reuse one internal revision per post/user without reading or overwriting recovery autosaves. */
    private function writeRevision(int $postId, array $payload): int|WP_Error
    {
        $revisions = get_posts([
            'post_type' => 'revision',
            'post_status' => self::POST_STATUS,
            'post_parent' => $postId,
            'author' => get_current_user_id(),
            'name' => $this->revisionName($postId),
            'posts_per_page' => 1,
            'fields' => 'ids',
        ]);

        // The payload is already slashed; wp_insert_post applies the native post sanitization filters.
        return wp_insert_post([
            'ID' => $revisions[0] ?? 0,
            'post_type' => 'revision',
            'post_status' => self::POST_STATUS,
            'post_parent' => $postId,
            'post_name' => $this->revisionName($postId),
            'post_author' => get_current_user_id(),
            'post_title' => $payload['post_title'],
            'post_content' => $payload['content'],
            'post_excerpt' => $payload['excerpt'],
        ], true);
    }

    /** Saved changes invalidate preview URLs; discard only our internal revisions at that point. */
    public function deletePreviews(int $postId): void
    {
        if (!get_post_status_object(self::POST_STATUS) || wp_is_post_revision($postId)) {
            return;
        }
        $revisions = get_posts([
            'post_type' => 'revision',
            'post_status' => self::POST_STATUS,
            'post_parent' => $postId,
            'posts_per_page' => -1,
            'fields' => 'ids',
        ]);
        foreach ($revisions as $revisionId) {
            $revision = get_post($revisionId);
            if (
                $revision && $revision->post_type === 'revision' && $revision->post_status === self::POST_STATUS
                && (int) $revision->post_parent === $postId
            ) {
                wp_delete_post_revision($revisionId);
            }
        }
    }

    /** Start from saved metadata before ACF overlays the submitted fields, including on reused previews. */
    private function seedPreviewMeta(int $postId, int $revisionId): void
    {
        if (!$this->ownsRevision($postId, $revisionId)) {
            return;
        }
        $source = get_post_meta($postId);
        unset($source['_edit_lock'], $source['_edit_last']);
        $preview = get_post_meta($revisionId);
        foreach (array_unique(array_merge(array_keys($source), array_keys($preview))) as $key) {
            if (($source[$key] ?? []) === ($preview[$key] ?? [])) {
                continue;
            }
            // Use metadata APIs directly: post-meta write helpers redirect revisions to their parent.
            delete_metadata('post', $revisionId, $key);
            foreach (isset($source[$key]) ? get_post_meta($postId, $key) : [] as $value) {
                add_metadata('post', $revisionId, $key, wp_slash($value));
            }
        }
        $this->acf->clearRevisionCache($revisionId);
    }

    private function ownsRevision(int $postId, int $revisionId): bool
    {
        $revision = get_post($revisionId);
        return $revision && $revision->post_type === 'revision'
            && $revision->post_status === self::POST_STATUS && (int) $revision->post_parent === $postId
            && (int) $revision->post_author === get_current_user_id()
            && $revision->post_name === $this->revisionName($postId);
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
        if (
            !is_user_logged_in() || !$postId || !get_post($postId) || !current_user_can('edit_post', $postId)
            || !$revisionId || !$this->ownsRevision($postId, $revisionId)
            || !wp_verify_nonce($token, $this->stateAction($postId, $revisionId))
        ) {
            wp_die(
                esc_html__(
                    'This preview expired or is unavailable. Refresh it from the editor.',
                    'a-floating-live-preview-panel'
                ),
                '',
                ['response' => 403]
            );
        }

        $this->previewPostId = $postId;
        $this->previewToken = $token;
        $this->source = sanitize_post(get_post($revisionId));
        // Bind core and compatibility reads to the authorized source, not the latest revision.
        remove_filter('the_preview', '_set_preview');
        add_filter('the_preview', [$this, 'readPost']);
        // Timber can reload the parent by ID instead of using WordPress's filtered preview object.
        add_filter('timber/post/import_data', [$this, 'readTimberPost'], PHP_INT_MAX, 2);
        $this->acf->bindPreview($postId, $this->source->ID);
        add_action('template_redirect', [$this, 'checkPreviewTarget'], -1);
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
        // Enhance only the original authorized singular HTML; never require it as the routing result.
        add_filter('show_admin_bar', '__return_false', PHP_INT_MAX);
        add_action('wp_head', function (): void {
            echo '<meta name="a-floating-live-preview-panel" content="' . esc_attr($this->previewToken) . '">';
        });
        add_action('wp_enqueue_scripts', function (): void {
            wp_enqueue_script(
                'a-floating-live-preview-panel-navigation',
                plugins_url('assets/preview-navigation.js', $this->file),
                [],
                $this->assetVersion('preview-navigation.js'),
                false
            );
        });
    }
}
