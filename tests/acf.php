<?php

/** Run with `wp eval-file tests/acf.php` on a single site; skips without ACF Pro. */

use AFloatingLivePreviewPanel\Compatibility\Acf;
use AFloatingLivePreviewPanel\Preview\LivePreview;

if (!defined('WP_CLI') || !WP_CLI || !class_exists(LivePreview::class) || is_multisite()) {
    throw new RuntimeException('Run through WP-CLI on a single-site installation with this plugin active.');
}
if (
    !function_exists('acf_add_local_field_group') || !function_exists('acf_get_field_type')
    || !acf_get_field_type('repeater')
) {
    WP_CLI::log('Skipping ACF preview checks: ACF Pro with repeater support is not active.');
    return;
}
require_once ABSPATH . 'wp-admin/includes/user.php';
$check = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException(esc_html($message));
    }
};
$originalUser = get_current_user_id();
$user = 0;
$postId = 0;
$live = new LivePreview();
$send = static function (int $postId, array $data): WP_REST_Response {
    $request = new WP_REST_Request('POST', '/a-floating-live-preview-panel/v1/posts/' . $postId . '/preview');
    $request->set_header('X-WP-Nonce', wp_create_nonce('wp_rest'));
    $request->set_body_params($data);
    return rest_do_request($request);
};
try {
    $user = wp_insert_user([
        'user_login' => 'aflpp_acf_' . wp_generate_password(12, false, false),
        'user_pass' => wp_generate_password(32), 'role' => 'administrator',
    ]);
    $check(!is_wp_error($user), 'Could not create a fixture user.');
    wp_set_current_user($user);
    acf_add_local_field_group([
        'key' => 'group_aflpp_acf_test', 'title' => 'Temporary ACF preview test',
        // Unsigned form inputs must belong to a matching field group in ACF 6.8.11+.
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'page']]],
        'fields' => [
            ['key' => 'field_aflpp_acf_test_text', 'name' => 'aflpp_acf_test_text', 'type' => 'text'],
            [
                'key' => 'field_aflpp_acf_test_rows', 'name' => 'aflpp_acf_test_rows', 'type' => 'repeater',
                'pagination' => 1, 'rows_per_page' => 1,
                'sub_fields' => [
                    ['key' => 'field_aflpp_acf_test_row', 'name' => 'text', 'type' => 'text'],
                ],
            ],
        ],
    ]);
    $postId = wp_insert_post([
        'post_type' => 'page', 'post_status' => 'publish', 'post_author' => $user,
        'post_title' => 'AFLPP ACF preview fixture',
    ], true);
    $check(!is_wp_error($postId) && $postId > 0, 'Could not create a fixture page.');
    update_field('field_aflpp_acf_test_text', 'Saved text', $postId);
    update_field('field_aflpp_acf_test_rows', [['text' => 'First row'], ['text' => 'Second row']], $postId);
    $base = $live->fingerprint($postId);
    $data = [
        'base' => $base, '_acf_nonce' => wp_create_nonce('post'),
        'acf' => [
            'field_aflpp_acf_test_text' => 'Unsaved text',
            'field_aflpp_acf_test_rows' => [
                'row-0' => ['field_aflpp_acf_test_row' => 'Unsaved first row'],
            ],
        ],
    ];
    $response = $send($postId, $data);
    $check(
        $response->get_status() === 200,
        'Valid ACF form data must preview through the native save path: ' . wp_json_encode($response->get_data())
    );
    parse_str(wp_parse_url($response->get_data()['url'], PHP_URL_QUERY), $query);
    $revisionId = (int) $query['aflpp_revision'];
    $check(
        get_post($revisionId)->post_status === 'aflpp-preview'
        && get_metadata('post', $revisionId, 'aflpp_acf_test_text', true) === 'Unsaved text',
        'Native ACF hooks must save the unsaved value only to the isolated preview revision.'
    );
    $check(
        get_metadata('post', $revisionId, 'aflpp_acf_test_rows_0_text', true) === 'Unsaved first row'
        && get_metadata('post', $revisionId, 'aflpp_acf_test_rows_1_text', true) === 'Second row',
        'A partial paginated repeater must merge edited rows with the saved rows.'
    );
    $check(
        $live->fingerprint($postId) === $base && get_field('aflpp_acf_test_text', $postId) === 'Saved text',
        'Previewing ACF values must not alter the saved page or its metadata.'
    );
    $check(!wp_get_post_autosave($postId, $user), 'ACF preview must not create a native recovery autosave.');
    $revisionBase = $live->fingerprint($revisionId);
    $invalidRequests = [
        ['_acf_nonce' => 'invalid'], ['_acf_nonce' => null],
        ['acf' => 'invalid'], ['_acf_fields' => 'invalid'],
    ];
    foreach ($invalidRequests as $invalid) {
        $response = $send($postId, array_replace($data, $invalid));
        $check(
            $response->get_status() === 400
            && ($response->get_data()['code'] ?? '') === 'aflpp_acf_unavailable',
            'Invalid ACF form data or nonces must still be rejected.'
        );
        $check(
            $live->fingerprint($postId) === $base && $live->fingerprint($revisionId) === $revisionBase,
            'Rejected ACF requests must not alter either the saved page or the existing preview.'
        );
    }
    // Lower-level ACF reads (used by post-meta blocks) must use the same authorized source.
    $reader = new Acf();
    $reader->bindPreview($postId, $revisionId);
    try {
        $field = acf_get_field('field_aflpp_acf_test_text');
        $check(acf_get_value($postId, $field) === 'Unsaved text', 'Raw ACF value reads must use the preview source.');
        $check(
            acf_get_metadata($postId, 'aflpp_acf_test_text', true) === $field['key'],
            'Raw ACF field references must use the preview source too.'
        );
        delete_metadata('post', $revisionId, 'aflpp_acf_test_text');
        $reader->clearRevisionCache($postId);
        $reader->clearRevisionCache($revisionId);
        $check(
            acf_get_metadata($postId, 'aflpp_acf_test_text') === null,
            'Absent source metadata must not fall back to the parent.'
        );
    } finally {
        $reader->unbindPreview();
    }
    if (function_exists('acf_register_block_type')) {
        acf_register_block_type([
            'name' => 'aflpp-meta-fixture', 'title' => 'AFLPP metadata fixture', 'use_post_meta' => true,
            'render_callback' => static function (): void {
                echo esc_html(get_field('aflpp_block_text'));
            },
        ]);
        acf_add_local_field_group([
            'key' => 'group_aflpp_block_fixture', 'title' => 'AFLPP block fields',
            'location' => [[['param' => 'block', 'operator' => '==', 'value' => 'acf/aflpp-meta-fixture']]],
            'fields' => [['key' => 'field_aflpp_block_text', 'name' => 'aflpp_block_text', 'type' => 'text']],
        ]);
        $response = $send($postId, [
            'base' => $base,
            'content' => '<!-- wp:acf/aflpp-meta-fixture '
                . '{"name":"acf/aflpp-meta-fixture","id":"block_aflpp_fixture",'
                . '"data":{"field_aflpp_block_text":"Unsaved block meta"}} /-->',
        ]);
        $check($response->get_status() === 200, 'ACF post-meta blocks must use their native content-save hooks.');
        parse_str(wp_parse_url($response->get_data()['url'], PHP_URL_QUERY), $blockQuery);
        $blockRevision = (int) $blockQuery['aflpp_revision'];
        $check(
            get_post_meta($blockRevision, 'aflpp_block_text', true) === 'Unsaved block meta',
            'Native ACF block hooks must save only to the preview revision.'
        );
        $check($live->fingerprint($postId) === $base, 'Native ACF block preview must preserve the parent.');
        $reader->bindPreview($postId, $blockRevision);
        $originalPost = $GLOBALS['post'] ?? null;
        try {
            $GLOBALS['post'] = get_post($postId);
            $html = do_blocks(get_post($blockRevision)->post_content);
            $check(str_contains($html, 'Unsaved block meta'), 'Native ACF block rendering must read preview metadata.');
        } finally {
            $GLOBALS['post'] = $originalPost;
            $reader->unbindPreview();
        }
    }
    WP_CLI::success('ACF preview saves, paginated merging, native post-meta blocks and source isolation passed.');
} finally {
    if (is_int($postId) && $postId) {
        wp_delete_post($postId, true);
    }
    if (is_int($user) && $user) {
        wp_delete_user($user);
    }
    wp_set_current_user($originalUser);
}
