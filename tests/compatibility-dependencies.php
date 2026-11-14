<?php

/** Run with `wp eval-file tests/compatibility-dependencies.php`; no database fixtures are created. */

namespace AFloatingLivePreviewPanel\Compatibility;

use RuntimeException;
use WP_CLI;

if (!defined('WP_CLI') || !WP_CLI || !\class_exists(Acf::class) || !\class_exists(Timber::class)) {
    throw new RuntimeException('Run through WP-CLI with A Floating Live Preview Panel active.');
}

// Hide optional APIs without deactivating real site plugins or changing their configuration.
final class CompatibilityDependenciesFixture
{
    public static array $missingFunctions = [];
    public static bool $missingTimber = false;
}

function function_exists(string $name): bool
{
    return !in_array($name, CompatibilityDependenciesFixture::$missingFunctions, true) && \function_exists($name);
}

function class_exists(string $name): bool
{
    return !($name === 'Timber\\Timber' && CompatibilityDependenciesFixture::$missingTimber)
        && \class_exists($name);
}

$check = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException(esc_html($message));
    }
};
$acf = new Acf();
$timber = new Timber();
try {
    CompatibilityDependenciesFixture::$missingFunctions = [
        'acf', 'acf_save_post', 'acf_get_store', 'acf_decode_post_id', 'acf_get_metadata',
    ];
    CompatibilityDependenciesFixture::$missingTimber = true;
    $acf->bindPreview(123, 456, true);
    $timber->bindPreview(123, 456);
    $check(!$acf->isAvailable() && $acf->editorDependencies() === [], 'Absent ACF must not enqueue its assets.');
    $check(
        !has_filter('acf/validate_post_id', [$acf, 'readPostId'])
        && !has_filter('acf/pre_load_metadata', [$acf, 'readMetadata'])
        && !has_filter('acf/pre_update_metadata', [$acf, 'preventSourceWrite'])
        && !has_filter('acf/pre_delete_metadata', [$acf, 'preventSourceWrite'])
        && !has_filter('timber/post/import_data', [$timber, 'readPost'])
        && !has_action('shutdown', [$acf, 'unbindPreview'])
        && !has_action('shutdown', [$timber, 'unbindPreview']),
        'Unavailable integrations must not install third-party read/write hooks or shutdown cleanup.'
    );
    $check(
        $acf->readPostId(123, 123) === 123 && $acf->readMetadata(null, 123, 'field', false) === null
        && $acf->preventSourceWrite(null, 123) === null
        && $timber->readPost(['post_title' => 'Saved'], (object) ['ID' => 123]) === ['post_title' => 'Saved'],
        'Unbound callbacks must be safe no-ops without calling optional dependency APIs.'
    );
    $acf->clearRevisionCache(456);
    $payload = ['post_title' => 'Core content'];
    $check($acf->preparePayload($payload, []) === $payload, 'Missing ACF must not affect core-only writes.');
    $error = $acf->preparePayload($payload, ['acf' => []]);
    $check(
        is_wp_error($error) && $error->get_error_code() === 'aflpp_acf_unavailable'
        && $acf->verifySave($error, 0) === $error && !has_action('acf/save_post', [$acf, 'recordSave']),
        'Submitted ACF data without ACF must fail clearly, not disappear silently or leave a save monitor.'
    );

    // An ACF installation missing a required read API must also remain inert.
    CompatibilityDependenciesFixture::$missingFunctions = ['acf_decode_post_id'];
    $acf->bindPreview(123, 456, true);
    $check(
        !has_filter('acf/validate_post_id', [$acf, 'readPostId'])
        && !has_filter('acf/pre_load_metadata', [$acf, 'readMetadata']),
        'Partial optional APIs must not install callbacks that would call missing functions.'
    );
    $acf->unbindPreview();
    $timber->unbindPreview();
    WP_CLI::success('Missing ACF, missing Timber, partial APIs and inert callback contracts passed.');
} finally {
    $acf->unbindPreview();
    $timber->unbindPreview();
    CompatibilityDependenciesFixture::$missingFunctions = [];
    CompatibilityDependenciesFixture::$missingTimber = false;
}
