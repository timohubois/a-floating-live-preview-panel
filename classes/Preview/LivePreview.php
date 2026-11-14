<?php

namespace AFloatingLivePreviewPanel\Preview;

use AFloatingLivePreviewPanel\Compatibility\Acf;
use WP_Error;
use WP_Post;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/** Own isolated live-preview revisions, integrity checks and native-save coordination. */
final class LivePreview
{
    private const POST_STATUS = 'aflpp-preview';

    private int $autosavePostId = 0;

    /** @var \WeakMap<WP_REST_Request, array> */
    private \WeakMap $restSaves;

    public function __construct(private readonly Acf $acf)
    {
        $this->restSaves = new \WeakMap();
        add_filter('rest_request_before_callbacks', [$this, 'trackRestSave'], 10, 3);
        add_filter('rest_post_dispatch', [$this, 'rebaseRestSave'], PHP_INT_MAX, 3);
        add_action('rest_api_init', [$this, 'registerRoutes']);
        add_action('init', [$this, 'registerStatus']);
        add_action('post_updated', [$this, 'deletePreviews']);
        add_action('load-post.php', [$this, 'trackNativePreview']);
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

    /** Content and metadata only; editor locks and asynchronous core queue flags are not content. */
    public function fingerprint(int $postId): string
    {
        $meta = get_post_meta($postId);
        // Core cron removes these queue flags independently after published-post saves.
        unset($meta['_edit_lock'], $meta['_edit_last'], $meta['_encloseme'], $meta['_pingme']);
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

    /** Observe only opted-in native post/autosave routes; never reject or replace a native save. */
    public function trackRestSave($response, array $handler, WP_REST_Request $request)
    {
        $postId = (int) $request->get_param('id');
        $post = $postId ? get_post($postId) : null;
        $base = (string) $request->get_header('X-AFLPP-Base');
        $token = (string) $request->get_header('X-AFLPP-Request');
        if (
            !$post || !in_array($request->get_method(), ['POST', 'PUT', 'PATCH'], true)
            || !preg_match('/^[a-f0-9]{64}$/D', $base) || !preg_match('/^[a-f0-9]{32}$/D', $token)
            || !current_user_can('edit_post', $postId)
            || !wp_verify_nonce((string) $request->get_header('X-WP-Nonce'), 'wp_rest')
        ) {
            return $response;
        }
        $route = rest_get_route_for_post($post);
        if (!$route || !in_array($request->get_route(), [$route, $route . '/autosaves'], true)) {
            return $response;
        }
        $this->restSaves[$request] = [
            'postId' => $postId, 'base' => $base, 'request' => $token,
            'matches' => hash_equals($this->fingerprint($postId), $base),
        ];
        return $response;
    }

    /** A private, request-correlated receipt is removed by our middleware before core receives the record. */
    public function rebaseRestSave(
        WP_REST_Response $response,
        WP_REST_Server $server,
        WP_REST_Request $request
    ): WP_REST_Response {
        $save = $this->restSaves[$request] ?? null;
        unset($this->restSaves[$request]);
        $status = $response->get_status();
        if (!$save || !(($status >= 200 && $status < 300) || ($status >= 400 && $status < 500))) {
            return $response;
        }
        $data = $response->get_data();
        if (!is_array($data)) {
            return $response;
        }
        $post = get_post($save['postId']);
        $after = $save['matches'] && $post ? $this->fingerprint($post->ID) : 'conflict';
        // A client error can happen after the post was updated, for example while saving metadata.
        // Only unchanged failures are safe to retry with the editor's existing baseline.
        if ($status >= 400 && $after !== $save['base']) {
            return $response;
        }
        $data['_aflpp_receipt'] = [
            'request' => $save['request'],
            'before' => $save['base'],
            'after' => $after,
            'available' => $post && $this->isAvailable($post),
        ];
        $response->set_data($data);
        return $response;
    }

    /** Acknowledge native Preview and Gutenberg's legacy meta-box POST without replacing their save or redirect. */
    public function trackNativePreview(): void
    {
        $postId = isset($_POST['post_ID']) && is_scalar($_POST['post_ID']) ? absint($_POST['post_ID']) : 0;
        // phpcs:disable WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Exact string contracts below.
        $token = isset($_POST['aflpp_preview']) && is_string($_POST['aflpp_preview'])
            ? wp_unslash($_POST['aflpp_preview']) : '';
        $base = isset($_POST['aflpp_base']) && is_string($_POST['aflpp_base'])
            ? wp_unslash($_POST['aflpp_base']) : '';
        $action = isset($_POST['wp-preview']) && is_string($_POST['wp-preview'])
            ? wp_unslash($_POST['wp-preview']) : '';
        $metaSave = isset($_POST['aflpp_metabox'], $_GET['meta-box-loader'], $_POST['action'])
            && $_POST['aflpp_metabox'] === '1' && $_POST['action'] === 'editpost';
        // phpcs:enable WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
        $nonce = isset($_POST['_wpnonce']) && is_string($_POST['_wpnonce'])
            ? sanitize_text_field(wp_unslash($_POST['_wpnonce'])) : '';
        if (
            ($action !== 'dopreview' && !$metaSave) || !$postId
            || !preg_match('/^[a-f0-9]{32}$/D', $token) || !preg_match('/^[a-f0-9]{64}$/D', $base)
            || !current_user_can('edit_post', $postId) || !wp_verify_nonce($nonce, 'update-post_' . $postId)
        ) {
            return;
        }
        $matches = hash_equals($this->fingerprint($postId), $base);
        add_filter('wp_redirect', function ($location) use ($postId, $token, $base, $matches) {
            if ($location && !headers_sent()) {
                // A short-lived, tab/request-specific receipt also works for redirects and non-HTML previews.
                $receipt = $matches ? $base . '.' . $this->fingerprint($postId) : 'conflict';
                setcookie('aflpp_preview_' . $token, $receipt, [
                    'expires' => time() + MINUTE_IN_SECONDS,
                    'path' => ADMIN_COOKIE_PATH,
                    'secure' => is_ssl(),
                    'samesite' => 'Strict',
                ]);
            }
            return $location;
        }, PHP_INT_MAX);
    }

    public function isAvailable(WP_Post $post): bool
    {
        return in_array($post->post_status, ['draft', 'pending', 'publish', 'private', 'future'], true)
            && wp_revisions_enabled($post);
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
                __('This preview has expired.', 'a-floating-live-preview-panel'),
                ['status' => 403]
            );
        }

        $postId = (int) $request['id'];
        $post = get_post($postId);
        $input = $request->get_params();

        require_once ABSPATH . 'wp-admin/includes/post.php';

        if (
            !$this->isAvailable($post) || wp_check_post_lock($postId)
            || !hash_equals($this->fingerprint($postId), $input['base'])
        ) {
            return new WP_Error(
                'aflpp_preview_conflict',
                __(
                    'This post has changed, someone else is editing it, or WordPress can’t save versions of it.',
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
                __('We couldn’t prepare the preview.', 'a-floating-live-preview-panel'),
                ['status' => 409]
            );
        }

        if (!hash_equals($base, $this->fingerprint($postId))) {
            return new WP_Error(
                'aflpp_source_changed',
                __('The saved post changed while the preview was loading.', 'a-floating-live-preview-panel'),
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

    /** Keep mutable live-source ownership and state-token validation together. */
    public function authorizedSource(int $postId, int $revisionId, string $token): ?WP_Post
    {
        if (
            !is_user_logged_in() || !$postId || !get_post($postId)
            || !current_user_can('edit_post', $postId) || !$revisionId
            || !$this->ownsRevision($postId, $revisionId)
            || !wp_verify_nonce($token, $this->stateAction($postId, $revisionId))
        ) {
            return null;
        }
        return get_post($revisionId);
    }
}
