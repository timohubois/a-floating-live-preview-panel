<?php

/** Run with `wp eval-file tests/compatibility.php`; optional dependencies are not required. */

use AFloatingLivePreviewPanel\Compatibility\Acf;
use AFloatingLivePreviewPanel\Compatibility\Timber;
use AFloatingLivePreviewPanel\LivePreview;

if (!defined('WP_CLI') || !WP_CLI || !class_exists(LivePreview::class) || is_multisite()) {
    throw new RuntimeException('Run through WP-CLI on a single-site installation with this plugin active.');
}
require_once ABSPATH . 'wp-admin/includes/user.php';
$check = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException(esc_html($message));
    }
};
$originalUser = get_current_user_id();
$originalHooks = [];
$hooks = [
    'aflpp_live_preview_form_values', 'aflpp_live_preview_custom_fields_initialized',
    'aflpp_live_preview_preparation_error', 'aflpp_frontend_live_preview_source_selected',
    'aflpp_frontend_saved_preview_source_selected',
];
foreach ($hooks as $hook) {
    $originalHooks[$hook] = isset($GLOBALS['wp_filter'][$hook]) ? clone $GLOBALS['wp_filter'][$hook] : null;
    remove_all_filters($hook);
}
$user = 0;
$postId = 0;
$live = new LivePreview();
try {
    $check(!defined('DOING_AUTOSAVE'), 'Run this fixture before any native autosave.');
    $user = wp_insert_user([
        'user_login' => 'aflpp_compatibility_' . wp_generate_password(12, false, false),
        'user_pass' => wp_generate_password(32), 'role' => 'administrator',
    ]);
    $check(!is_wp_error($user), 'Could not create a fixture user.');
    wp_set_current_user($user);
    $postId = wp_insert_post([
        'post_type' => 'post', 'post_status' => 'draft', 'post_author' => $user,
        'post_title' => 'AFLPP compatibility fixture', 'post_content' => 'Saved content',
    ], true);
    $check(!is_wp_error($postId) && $postId > 0, 'Could not create a fixture post.');
    update_post_meta($postId, 'aflpp_compatibility_seed', 'Saved metadata');
    $base = $live->fingerprint($postId);
    $input = ['base' => $base, 'post_title' => "Editor's draft", 'content' => '<p>Unsaved content</p>'];
    $send = static function (array $data, ?string $nonce = null) use ($postId): WP_REST_Response {
        $request = new WP_REST_Request('POST', '/a-floating-live-preview-panel/v1/posts/' . $postId . '/preview');
        $request->set_header('X-WP-Nonce', $nonce ?? wp_create_nonce('wp_rest'));
        $request->set_body_params($data);
        return rest_do_request($request);
    };
    $revisionId = static function (WP_REST_Response $response): int {
        parse_str(wp_parse_url($response->get_data()['url'], PHP_URL_QUERY), $query);
        return (int) $query['aflpp_revision'];
    };

    $history = wp_get_post_revisions($postId);
    // No compatibility subscribers: the preview engine must work on its own.
    $response = $send($input);
    $check($response->get_status() === 200, 'Core-only previews must not require a compatibility adapter.');
    $id = $revisionId($response);
    $check(
        get_post($id)->post_title === $input['post_title'] && get_post($id)->post_content === $input['content'],
        'Core-only writes must retain native title/content handling.'
    );

    $events = [];
    $saveError = null;
    $lastSave = null;
    add_filter('aflpp_live_preview_form_values', static function (
        $payload,
        array $context
    ) use (
        $check,
        $postId,
        &$events
    ) {
        $events[] = 'payload';
        if (is_wp_error($payload)) {
            return $payload;
        }
        $check(
            array_keys($context) === ['post', 'source', 'input']
            && $context['post'] === ['id' => $postId] && $context['source'] === null
            && $payload['post_title'] === "Editor's draft"
            && $context['input']['post_title'] === "Editor's draft",
            'Payload filters must receive the authorized parent and unslashed editor/form values.'
        );
        $context['post']['id'] = 999;
        $payload['content'] = '<p>Adapted editor content</p>';
        return $payload;
    }, 10, 2);
    add_action('aflpp_live_preview_custom_fields_initialized', static function (
        array $context
    ) use (
        $check,
        $postId,
        &$events
    ): void {
        $events[] = 'seeded';
        $check(!defined('DOING_AUTOSAVE'), 'Native preview writes must not set the autosave flag.');
        $id = $context['source']['id'];
        $revision = get_post($id);
        $check(
            array_keys($context) === ['post', 'source']
            && $context['post'] === ['id' => $postId] && $revision->post_type === 'revision'
            && $revision->post_status === 'aflpp-preview' && (int) $revision->post_parent === $postId
            && get_post_meta($id, 'aflpp_compatibility_seed', true) === 'Saved metadata',
            'Cache hooks must receive only identities after saved fields initialize the owned source.'
        );
    });
    add_filter('aflpp_live_preview_preparation_error', static function (
        $error,
        array $context
    ) use (
        $check,
        &$events,
        &$lastSave,
        &$saveError
    ) {
        $check(!defined('DOING_AUTOSAVE'), 'Preview cleanup must leave the autosave flag undefined.');
        $check(array_keys($context) === ['post', 'source'], 'Verification must not retain submitted input.');
        $events[] = 'finished';
        $lastSave = [$error, $context];
        return $error ?? $saveError;
    }, 20, 2);
    $response = $send($input);
    $check($response->get_status() === 200, 'A compatible payload extension must succeed.');
    $id = $revisionId($response);
    $check(
        $events === ['payload', 'seeded', 'finished']
        && $lastSave === [null, ['post' => ['id' => $postId], 'source' => ['id' => $id]]]
        && get_post($id)->post_content === '<p>Adapted editor content</p>',
        'Preview lifecycle hooks must run in order around the isolated write.'
    );

    $before = $events;
    $check($send($input, 'invalid')->get_status() === 403, 'Invalid REST nonces must remain rejected.');
    $check(
        $send(array_replace($input, ['base' => str_repeat('a', 64)]))->get_status() === 409,
        'Conflicted preview sources must remain rejected.'
    );
    wp_set_current_user(0);
    $check($send($input)->get_status() === 401, 'Anonymous users must not reach compatibility callbacks.');
    wp_set_current_user($user);
    $check($events === $before, 'Rejected permissions, nonces and conflicts must not run compatibility hooks.');

    // ACF's adapter is present even when ACF itself is not installed: it must preserve prior errors.
    $acf = new Acf();
    $rejected = new WP_Error('aflpp_test_payload', 'Fixture payload rejection.', ['status' => 400]);
    $reject = static fn () => $rejected;
    add_filter('aflpp_live_preview_form_values', $reject, 5);
    $events = [];
    $response = $send($input);
    $check(
        $response->get_status() === 400 && $response->get_data()['code'] === $rejected->get_error_code()
        && $events === ['payload', 'finished']
        && $lastSave === [$rejected, ['post' => ['id' => $postId], 'source' => null]],
        'Payload errors must survive later adapters and finish preparation without seeding or writing.'
    );
    remove_filter('aflpp_live_preview_form_values', $reject, 5);

    if (function_exists('acf_save_post')) {
        // A later adapter may reject after ACF has prepared its native save monitor.
        add_filter('aflpp_live_preview_form_values', $reject, 20);
        $response = $send($input + ['acf' => [], '_acf_nonce' => wp_create_nonce('post')]);
        $check(
            $response->get_data()['code'] === $rejected->get_error_code()
            && !has_action('acf/save_post', [$acf, 'recordSave']),
            'Rejected payloads must clean up ACF preparation state and preserve the rejection.'
        );
        remove_filter('aflpp_live_preview_form_values', $reject, 20);
    }

    // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Snapshot request globals in the CLI fixture.
    $originalPost = $_POST;
    $throw = static function (): void {
        throw new RuntimeException('Fixture preparation exception.');
    };
    add_filter('aflpp_live_preview_form_values', $throw, 20);
    try {
        $data = function_exists('acf_save_post') ? ['acf' => [], '_acf_nonce' => wp_create_nonce('post')] : [];
        $send($input + $data);
        throw new RuntimeException('The preparation exception was swallowed.');
    } catch (RuntimeException $error) {
        $check($error->getMessage() === 'Fixture preparation exception.', 'Preparation exceptions must propagate.');
        $check(
            // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Assert restored CLI globals, not editor input.
            $_POST === $originalPost && !has_action('acf/save_post', [$acf, 'recordSave']),
            'Preparation exceptions must restore form globals and remove temporary ACF save monitors.'
        );
        $check(
            $lastSave[1] === ['post' => ['id' => $postId], 'source' => null],
            'Exceptions before source initialization must keep a null cleanup source.'
        );
    } finally {
        remove_filter('aflpp_live_preview_form_values', $throw, 20);
    }

    $live->deletePreviews($postId);
    $previousSource = null;
    foreach ([false, true] as $reuse) {
        $initializedSource = null;
        $lastSave = null;
        $throwInitialized = static function (array $context) use (&$initializedSource): void {
            $initializedSource = $context['source'];
            $context['source']['id'] = 999;
            throw new RuntimeException('Fixture initialized-source exception.');
        };
        add_action('aflpp_live_preview_custom_fields_initialized', $throwInitialized, 20);
        try {
            $send($input + $data);
            throw new RuntimeException('The initialized-source exception was swallowed.');
        } catch (RuntimeException $error) {
            $check(
                $error->getMessage() === 'Fixture initialized-source exception.',
                'Exceptions after source initialization must propagate.'
            );
            $check(
                $initializedSource !== null && get_post($initializedSource['id']) !== null
                && $lastSave[1] === ['post' => ['id' => $postId], 'source' => $initializedSource],
                'Cleanup must retain the established source after initialization throws, ignoring context mutations.'
            );
            $check(
                !$reuse || $initializedSource === $previousSource,
                'The failure path must also preserve the identity of a reused source.'
            );
            $check(
                // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Check restored CLI globals, not request input.
                $_POST === $originalPost && !has_action('acf/save_post', [$acf, 'recordSave']),
                'Initialized-source exceptions must restore form globals and remove temporary ACF save monitors.'
            );
            $check(
                $live->fingerprint($postId) === $base,
                'Failed initialization must leave the saved parent unchanged.'
            );
            $check(!wp_get_post_autosave($postId, $user), 'Failed initialization must not create recovery autosaves.');
            $previousSource = $initializedSource;
        } finally {
            remove_action('aflpp_live_preview_custom_fields_initialized', $throwInitialized, 20);
        }
    }
    $response = $send($input);
    $check($response->get_status() === 200, 'A later write must work after preparation cleanup.');
    $id = $revisionId($response);
    $check(!has_action('acf/save_post', [$acf, 'recordSave']), 'Successful writes must remove the save monitor.');

    $saveError = new WP_Error('aflpp_test_save', 'Fixture save verification failure.', ['status' => 409]);
    add_filter('aflpp_live_preview_preparation_error', static fn () => $saveError, 5);
    $response = $send($input);
    $check(
        $response->get_status() === 409 && $response->get_data()['code'] === $saveError->get_error_code(),
        'Failed integration save verification must not return a successful preview URL.'
    );
    $check($live->fingerprint($postId) === $base, 'Compatibility hooks must leave the saved parent unchanged.');
    $check(!wp_get_post_autosave($postId, $user), 'Compatibility hooks must not create recovery autosaves.');
    $check(
        array_keys(wp_get_post_revisions($postId)) === array_keys($history),
        'Preview writes must not add or remove normal history revisions.'
    );

    if ($acf->isAvailable()) {
        $acf->bindPreview($postId, $id, true);
        $check(
            has_filter('acf/pre_update_metadata', [$acf, 'preventSourceWrite']) === PHP_INT_MAX
            && has_action('shutdown', [$acf, 'unbindPreview']) === PHP_INT_MAX,
            'Saved-source guards must be installed for read-only rendering.'
        );
        $acf->bindPreview($postId, $id, false);
        $check(
            !has_filter('acf/pre_update_metadata', [$acf, 'preventSourceWrite'])
            && !has_filter('acf/pre_delete_metadata', [$acf, 'preventSourceWrite']),
            'Rebinding to live preview must remove old saved-source write guards.'
        );
    }
    $acf->unbindPreview();
    $acf->unbindPreview();
    $check(
        !has_filter('acf/validate_post_id', [$acf, 'readPostId'])
        && !has_filter('acf/pre_load_metadata', [$acf, 'readMetadata'])
        && !has_action('shutdown', [$acf, 'unbindPreview'])
        && $acf->readPostId($postId, $postId) === $postId,
        'ACF cleanup must remove its own read hooks, reset state and be safe to repeat.'
    );
    $timber = new Timber();
    $timber->bindPreview($postId, $id);
    $check(
        (has_filter('timber/post/import_data', [$timber, 'readPost']) === PHP_INT_MAX)
            === class_exists(\Timber\Timber::class),
        'Timber read hooks must be installed only when Timber is available.'
    );
    $timber->bindPreview($postId, 0);
    $timber->unbindPreview();
    $check(
        !has_filter('timber/post/import_data', [$timber, 'readPost'])
        && !has_action('shutdown', [$timber, 'unbindPreview'])
        && $timber->readPost(['post_title' => 'Unchanged'], get_post($postId)) === ['post_title' => 'Unchanged'],
        'Timber cleanup must remove its own read hooks and discard the previous source.'
    );
    // Save the parent in this same process, before any native autosave can set the flag.
    $savedContent = 'Content saved after preview';
    $updated = wp_update_post(['ID' => $postId, 'post_content' => $savedContent], true);
    $check($updated === $postId, 'Could not save the fixture after preparing the preview.');
    $newHistory = array_diff_key(wp_get_post_revisions($postId), $history);
    $revision = reset($newHistory);
    $check(
        count($newHistory) === 1 && $revision->post_content === $savedContent && !wp_is_post_autosave($revision),
        'An ordinary save after preview must create a normal history revision in the same process.'
    );
    WP_CLI::success('Core-only previews, compatibility lifecycle, scoped hooks, errors and later saves passed.');
} finally {
    if (isset($acf)) {
        $acf->unbindPreview();
    }
    if (isset($timber)) {
        $timber->unbindPreview();
    }
    foreach ($originalHooks as $hook => $callbacks) {
        if ($callbacks === null) {
            unset($GLOBALS['wp_filter'][$hook]);
        } else {
            $GLOBALS['wp_filter'][$hook] = $callbacks;
        }
    }
    if (is_int($postId) && $postId) {
        wp_delete_post($postId, true);
    }
    if (is_int($user) && $user) {
        wp_delete_user($user);
    }
    wp_set_current_user($originalUser);
}
