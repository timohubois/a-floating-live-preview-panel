<?php

/** Run with `wp eval-file tests/revisions.php` on a disposable single-site installation with this plugin active. */

use AFloatingLivePreviewPanel\Admin\Panel;
use AFloatingLivePreviewPanel\Compatibility\Acf;
use AFloatingLivePreviewPanel\Preview\FrontendPreview;
use AFloatingLivePreviewPanel\Preview\LivePreview;

if (!defined('WP_CLI') || !WP_CLI || !class_exists(FrontendPreview::class)) {
    throw new RuntimeException('Run this through WP-CLI with A Floating Live Preview Panel active.');
}

if (is_multisite()) {
    WP_CLI::error('Run this fixture on a disposable single-site installation; multisite is not supported.');
}

require_once ABSPATH . 'wp-admin/includes/user.php';

$check = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException(esc_html($message));
    }
};
$originalUser = get_current_user_id();
// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Preserve the CLI request for cleanup.
$originalGet = $_GET;
$posts = [];
$users = [];
$acf = new Acf();
$livePreview = new LivePreview($acf);
$preview = new FrontendPreview(dirname(__DIR__) . '/a-floating-live-preview-panel.php', $livePreview, $acf);
$dieHandler = static fn () => static function ($message, $title, $args): void {
    throw new RuntimeException('aflpp_denied_' . (int) ($args['response'] ?? 0));
};
add_filter('wp_die_handler', $dieHandler, PHP_INT_MAX);
$denied = static function (array $query) use ($preview, $check): void {
    $_GET = $query;
    try {
        $preview->authorizePreview();
    } catch (RuntimeException $error) {
        $check($error->getMessage() === 'aflpp_denied_403', 'Denied previews must return HTTP 403.');
        return;
    }
    throw new RuntimeException('An unauthorized preview was accepted.');
};
$query = static function (string $url): array {
    parse_str(wp_parse_url($url, PHP_URL_QUERY), $query);
    return $query;
};

try {
    // Inspect the real rendered view, not PHP source formatting or obsolete CSS class names.
    ob_start();
    (new Panel(dirname(__DIR__) . '/a-floating-live-preview-panel.php'))->render();
    $document = new DOMDocument();
    $document->loadHTML(ob_get_clean(), LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    $xpath = new DOMXPath($document);
    $byClass = static fn (string $name): DOMNodeList => $xpath->query(
        '//*[contains(concat(" ", normalize-space(@class), " "), " ' . $name . ' ")]'
    );
    foreach (['aflpp-move-control', 'aflpp-caption', 'aflpp-resize'] as $class) {
        $check($byClass($class)->length === 1, 'The rendered panel needs one ' . $class . ' binding.');
    }
    $panel = $document->getElementById('aflpp-panel');
    $caption = $byClass('aflpp-caption')->item(0);
    $check(
        $caption->tagName === 'h2' && trim($caption->textContent) !== ''
        && $caption->getAttribute('id') !== '' && $panel
        && $panel->getAttribute('aria-labelledby') === $caption->getAttribute('id')
        && !$panel->hasAttribute('aria-label'),
        'The panel must be labelled by its visible heading, including before JavaScript initializes.'
    );
    $header = $byClass('aflpp-header')->item(0);
    $check(
        $header && $xpath->query('.//button | .//*[@tabindex >= 0]', $header)->length === 0,
        'The initial titlebar must not contain keyboard resize controls or interactive title buttons.'
    );
    $buttons = $xpath->query('//section//button');
    $check($buttons->length === 1, 'The shell must have exactly one keyboard resize control.');
    $resize = $buttons->item(0);
    $check(trim($resize->getAttribute('aria-label')) !== '', 'Keyboard resizing needs an accessible label.');
    $help = $document->getElementById($resize->getAttribute('aria-describedby'));
    $check($help && trim($help->textContent) !== '', 'Keyboard resizing needs linked instructions.');
    $edges = $xpath->query('//*[@data-resize-edge]');
    $directions = [];
    foreach ($edges as $edge) {
        $directions[] = $edge->getAttribute('data-resize-edge');
        $check(
            $edge->tagName !== 'button'
            && (!$edge->hasAttribute('tabindex') || (int) $edge->getAttribute('tabindex') < 0)
            && $edge->getAttribute('aria-hidden') === 'true',
            'Pointer resize edges must stay out of the keyboard and accessibility navigation.'
        );
    }
    sort($directions);
    $check(
        $directions === ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'],
        'Every pointer resize edge must be rendered once.'
    );
    $statuses = $xpath->query('//*[@role="status"]');
    $check(
        $statuses->length === 1 && $statuses->item(0)->getAttribute('aria-hidden') !== 'true'
        && !$statuses->item(0)->hasAttribute('hidden'),
        'The shell needs one accessible status region.'
    );

    $suffix = wp_generate_password(12, false, false);
    foreach (['administrator', 'subscriber'] as $role) {
        $id = wp_insert_user([
            'user_login' => 'aflpp_revision_test_' . $role . '_' . $suffix,
            'user_pass' => wp_generate_password(32),
            'role' => $role,
        ]);
        $check(!is_wp_error($id), 'Could not create the temporary test user.');
        $users[] = $id;
    }
    [$admin, $subscriber] = $users;
    wp_set_current_user($admin);
    foreach (['Selected post', 'Unrelated post'] as $title) {
        $id = wp_insert_post([
            'post_type' => 'post', 'post_status' => 'draft', 'post_author' => $admin,
            'post_title' => 'AFLPP test — ' . $title,
            'post_content' => 'Saved content', 'post_excerpt' => 'Saved excerpt',
        ], true);
        $check(!is_wp_error($id) && $id > 0, 'Could not create the temporary test post.');
        $posts[] = $id;
    }
    [$postId, $otherId] = $posts;
    $revisionId = _wp_put_post_revision($postId);
    $check(!is_wp_error($revisionId) && $revisionId > 0, 'Could not create a test revision.');
    wp_update_post([
        'ID' => $revisionId, 'post_author' => $subscriber, 'post_title' => 'Historical title',
        'post_content' => 'Historical content', 'post_excerpt' => 'Historical excerpt',
    ]);
    $internalId = wp_insert_post([
        'post_type' => 'revision', 'post_status' => 'aflpp-preview', 'post_parent' => $postId,
        'post_author' => $admin, 'post_name' => $postId . '-aflpp-preview-' . $admin,
        'post_title' => 'Internal live preview',
    ]);
    $posts[] = $internalId;
    $foreignInternalId = wp_insert_post([
        'post_type' => 'revision', 'post_status' => 'aflpp-preview', 'post_parent' => $postId,
        'post_author' => $subscriber, 'post_name' => $postId . '-aflpp-preview-' . $subscriber,
    ]);
    $posts[] = $foreignInternalId;
    $autosaveId = wp_insert_post([
        'post_type' => 'revision', 'post_status' => 'inherit', 'post_parent' => $postId,
        'post_author' => $admin, 'post_name' => $postId . '-autosave-v1', 'post_title' => 'Recovery autosave',
    ]);
    $check(wp_is_post_autosave($autosaveId) === $postId, 'Recovery autosave fixture failed.');
    $check(!isset(wp_get_post_revisions($postId)[$internalId]), 'Internal previews must stay out of history.');
    register_post_meta('post', 'aflpp_revision_test_meta', [
        'type' => 'string', 'single' => true, 'show_in_rest' => true, 'revisions_enabled' => true,
    ]);
    register_post_meta('post', 'aflpp_revision_test_array', [
        'type' => 'array', 'single' => true, 'revisions_enabled' => true,
        'show_in_rest' => ['schema' => ['type' => 'array', 'items' => ['type' => 'string']]],
    ]);
    register_post_meta('post', 'aflpp_revision_test_missing', [
        'type' => 'string', 'single' => true, 'show_in_rest' => true, 'revisions_enabled' => true,
    ]);
    update_post_meta($postId, 'aflpp_revision_test_array', ['Saved array']);
    update_metadata('post', $revisionId, 'aflpp_revision_test_array', ['Historical', 'array']);
    update_post_meta($postId, 'aflpp_revision_test_missing', 'Not present in history');
    update_post_meta($postId, 'aflpp_revision_test_meta', 'Saved metadata');
    update_metadata('post', $revisionId, 'aflpp_revision_test_meta', 'Historical metadata');
    update_post_meta($postId, 'aflpp_unrevisioned_test_meta', 'Current unrevisioned metadata');
    update_metadata('post', $revisionId, 'aflpp_unrevisioned_test_meta', 'Must not be used');

    if (function_exists('acf_add_local_field_group')) {
        acf_add_local_field_group([
            'key' => 'group_aflpp_revision_test', 'title' => 'Temporary revision test',
            'fields' => [
                ['key' => 'field_aflpp_revision_test_text', 'name' => 'aflpp_revision_test_text', 'type' => 'text'],
                [
                    'key' => 'field_aflpp_revision_test_rows',
                    'name' => 'aflpp_revision_test_rows', 'type' => 'repeater',
                    'sub_fields' => [
                        [
                            'key' => 'field_aflpp_revision_test_row', 'name' => 'text', 'type' => 'text',
                        ],
                    ],
                ],
            ],
        ]);
        foreach ([$postId => 'Saved', $revisionId => 'Historical'] as $id => $prefix) {
            update_field('field_aflpp_revision_test_text', $prefix . ' ACF text', $id);
            update_field('field_aflpp_revision_test_rows', [['text' => $prefix . ' ACF row']], $id);
        }
    }

    $post = get_post($postId);
    $savedUrl = $preview->savedPreviewUrl($post, $revisionId);
    $currentUrl = $preview->savedPreviewUrl($post, $postId);
    $check(is_string($savedUrl) && is_string($currentUrl), 'Saved sources should have preview URLs.');
    $check(is_string($preview->savedPreviewUrl($post, $autosaveId)), 'Recovery autosaves should be readable.');
    $check($preview->savedPreviewUrl($post, $internalId) === null, 'History must not expose internal previews.');
    $check($preview->savedPreviewUrl(get_post($otherId), $revisionId) === null, 'Foreign revisions must be rejected.');

    $customStatuses = [
        'aflpp-test-public' => ['public' => true],
        'aflpp-test-protected' => ['protected' => true],
        'aflpp-test-private' => ['private' => true],
        'aflpp-test-internal' => ['internal' => true],
    ];
    foreach ($customStatuses as $name => $args) {
        register_post_status($name, $args);
    }
    $otherRevisionId = _wp_put_post_revision($otherId);
    $check(!is_wp_error($otherRevisionId) && $otherRevisionId > 0, 'Could not create a custom-status revision.');
    $statusCases = [
        'aflpp-test-public' => true, 'aflpp-test-protected' => true, 'aflpp-test-private' => true,
        'aflpp-test-internal' => false, 'aflpp-unregistered' => false, 'auto-draft' => false, 'trash' => false,
    ];
    foreach ($statusCases as $status => $eligible) {
        wp_update_post(['ID' => $otherId, 'post_status' => $status]);
        $other = get_post($otherId);
        $statusUrl = $preview->savedPreviewUrl($other, $otherRevisionId);
        $check(is_string($statusUrl) === $eligible, 'Revision URL eligibility failed for ' . $status);
        $check(
            is_string($preview->savedPreviewUrl($other, $otherId)) === $eligible,
            'Current-post URL eligibility failed for ' . $status
        );
        if ($eligible) {
            $_GET = $query($statusUrl);
            $preview->authorizePreview();
            $check(
                $preview->readPost(clone $other)->post_title === get_post($otherRevisionId)->post_title,
                'Custom-status authorization failed for ' . $status
            );
        } else {
            $denied([
                'aflpp_post' => (string) $otherId, 'aflpp_revision' => (string) $otherRevisionId,
                'aflpp_saved' => '1',
                'aflpp_token' => wp_create_nonce('aflpp_saved_' . $otherId . '_' . $otherRevisionId),
            ]);
        }
    }
    wp_update_post(['ID' => $otherId, 'post_status' => 'draft']);

    $savedQuery = $query($savedUrl);
    $tampered = $savedQuery;
    $tampered['aflpp_token'] = 'invalid';
    $denied($tampered);
    $tampered = $savedQuery;
    $tampered['aflpp_post'] = $otherId;
    $denied($tampered);
    $tampered = $savedQuery;
    unset($tampered['aflpp_saved']);
    $denied($tampered); // Saved nonces must not authorize the live-preview path.
    $tampered = $savedQuery;
    $tampered['aflpp_revision'] = $internalId;
    $tampered['aflpp_token'] = wp_create_nonce('aflpp_saved_' . $postId . '_' . $internalId);
    $denied($tampered); // Even a valid saved-source nonce cannot expose internal revisions.
    $tampered = $savedQuery;
    $tampered['aflpp_saved'] = ['1'];
    $denied($tampered);

    foreach ([$subscriber, 0] as $userId) {
        wp_set_current_user($userId);
        $check($preview->savedPreviewUrl($post, $revisionId) === null, 'Non-editors must not get preview URLs.');
        $denied($savedQuery);
    }
    wp_set_current_user($admin);
    $stateAction = new ReflectionMethod(LivePreview::class, 'stateAction');
    $internalQuery = [
        'aflpp_post' => (string) $postId, 'aflpp_revision' => (string) $foreignInternalId,
        'aflpp_token' => wp_create_nonce($stateAction->invoke($livePreview, $postId, $foreignInternalId)),
    ];
    $denied($internalQuery);
    $internalQuery['aflpp_revision'] = (string) $internalId;
    $internalQuery['aflpp_token'] = wp_create_nonce($stateAction->invoke($livePreview, $postId, $internalId));
    $_GET = $internalQuery;
    $preview->authorizePreview();
    $check($preview->readPost(clone $post)->post_title === 'Internal live preview', 'Live preview regressed.');
    if (function_exists('get_field')) {
        $check(
            update_field('field_aflpp_revision_test_text', 'Writable live ACF text', $postId) !== false
            && get_post_meta($internalId, 'aflpp_revision_test_text', true) === 'Writable live ACF text',
            'Saved-source guards must not block live-preview writes after rebinding.'
        );
        $check(delete_field('field_aflpp_revision_test_text', $postId), 'Live-preview deletions must remain writable.');
    }

    $attemptAcfWrites = static function (int $sourceId) use ($postId, $check): void {
        $changes = [
            'field_aflpp_revision_test_text' => 'Must not persist',
            'field_aflpp_revision_test_rows' => [['text' => 'Must not persist'], ['text' => 'Rejected extra row']],
        ];
        foreach (array_unique([$postId, $sourceId, 'post_' . $sourceId]) as $target) {
            foreach ($changes as $field => $value) {
                $check(update_field($field, $value, $target) === false, 'Saved-source ACF updates must be rejected.');
                $check(delete_field($field, $target) === false, 'Saved-source ACF deletions must be rejected.');
            }
        }
        $check(
            acf_update_metadata($sourceId, 'aflpp_revision_test_text', 'Must not persist') === false
            && acf_delete_metadata($sourceId, 'aflpp_revision_test_text', true) === false,
            'Direct ACF metadata operations must also be rejected for the saved source.'
        );
        foreach (['acf/pre_update_metadata', 'acf/pre_delete_metadata'] as $hook) {
            foreach (['user_', 'term_', 'comment_', 'option_'] as $prefix) {
                $check(
                    apply_filters($hook, null, $prefix . $sourceId) === null,
                    'Non-post ACF objects must remain unaffected by saved-source guards.'
                );
            }
        }
    };

    // Raw database snapshots detect writes without being affected by request-local read filters.
    global $wpdb;
    $snapshot = static function () use ($wpdb, $postId): array {
        // phpcs:disable WordPress.DB.DirectDatabaseQuery -- Assert raw persisted state, bypassing preview filters.
        return [
            $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$wpdb->posts} WHERE ID = %d OR post_parent = %d ORDER BY ID",
                $postId,
                $postId
            ), ARRAY_A),
            $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$wpdb->postmeta} WHERE post_id IN (
                    SELECT ID FROM {$wpdb->posts} WHERE ID = %d OR post_parent = %d
                ) ORDER BY meta_id",
                $postId,
                $postId
            ), ARRAY_A),
        ];
        // phpcs:enable WordPress.DB.DirectDatabaseQuery
    };
    $before = $snapshot();
    $_GET = $savedQuery;
    $preview->authorizePreview();
    $rendered = $preview->readPost(clone $post);
    $check($rendered->post_title === 'Historical title', 'Core title must come from the selected revision.');
    $check($rendered->post_content === 'Historical content', 'Core content must come from the selected revision.');
    $check($rendered->post_excerpt === 'Historical excerpt', 'Core excerpt must come from the selected revision.');
    $check($rendered->ID === $postId, 'The parent identity must remain stable.');
    $timber = $preview->readTimberPost(['post_title' => 'Saved title'], $post);
    $check($timber['post_title'] === 'Historical title', 'Timber must use the selected revision.');
    $check(
        get_post_meta($postId, 'aflpp_revision_test_meta', true) === 'Historical metadata',
        'Revisioned meta failed.'
    );
    $check(
        get_post_meta($postId, 'aflpp_revision_test_array', true) === ['Historical', 'array'],
        'Single array-valued metadata must not be unwrapped twice.'
    );
    $check(
        get_post_meta($postId, 'aflpp_revision_test_array', false) === [['Historical', 'array']],
        'Multi-value metadata reads must keep their native shape.'
    );
    $check(
        get_post_meta($postId, 'aflpp_revision_test_missing', true) === '',
        'Missing historical metadata must not fall back to the saved post.'
    );
    $check(
        !metadata_exists('post', $postId, 'aflpp_revision_test_missing')
        && metadata_exists('post', $postId, 'aflpp_revision_test_array'),
        'Historical metadata existence must reflect the selected source.'
    );
    $check(
        get_post_meta($postId, 'aflpp_unrevisioned_test_meta', true) === 'Current unrevisioned metadata',
        'Unrevisioned metadata must stay current.'
    );
    if (function_exists('get_field')) {
        $attemptAcfWrites($revisionId);
        $check(
            update_field('field_aflpp_revision_test_text', 'Unrelated writable ACF text', $otherId) !== false
            && get_post_meta($otherId, 'aflpp_revision_test_text', true) === 'Unrelated writable ACF text',
            'Saved-source guards must not block unrelated post writes.'
        );
        $check(delete_field('field_aflpp_revision_test_text', $otherId), 'Unrelated deletions must remain writable.');
        $check(get_field('aflpp_revision_test_text', $postId) === 'Historical ACF text', 'ACF source binding failed.');
        $rows = get_field('aflpp_revision_test_rows', $postId);
        $check(($rows[0]['text'] ?? '') === 'Historical ACF row', 'Historical repeater values failed.');
    }
    $_GET = $query($currentUrl);
    $preview->authorizePreview();
    $check($preview->readPost(clone $post)->post_title === $post->post_title, 'Current-post source failed.');
    $check(
        get_post_meta($postId, 'aflpp_revision_test_meta', true) === 'Saved metadata',
        'Current metadata failed.'
    );
    if (function_exists('get_field')) {
        $attemptAcfWrites($postId);
        $check(get_field('aflpp_revision_test_text', $postId) === 'Saved ACF text', 'Current ACF source failed.');
    }
    $check($before === $snapshot(), 'Reading revision previews changed saved posts or metadata.');
    WP_CLI::success(
        'Panel markup, revision permissions, core/Timber fields, metadata, optional ACF and read-only behavior passed.'
    );
} finally {
    $_GET = $originalGet;
    remove_filter('wp_die_handler', $dieHandler, PHP_INT_MAX);
    remove_filter('get_post_metadata', [$preview, 'readRevisionMeta']);
    remove_filter('acf/validate_post_id', [$acf, 'readPostId'], PHP_INT_MAX);
    remove_filter('acf/pre_load_metadata', [$acf, 'readMetadata'], PHP_INT_MAX);
    remove_filter('acf/pre_update_metadata', [$acf, 'preventSourceWrite'], PHP_INT_MAX);
    remove_filter('acf/pre_delete_metadata', [$acf, 'preventSourceWrite'], PHP_INT_MAX);
    foreach (array_reverse($posts) as $postId) {
        wp_delete_post($postId, true);
    }
    foreach ($users as $userId) {
        wp_delete_user($userId);
    }
    wp_set_current_user($originalUser);
}
