<?php

/** Run with `wp eval-file tests/editor-extensions.php`; no database fixtures are created. */

use AFloatingLivePreviewPanel\Compatibility\Acf;
use AFloatingLivePreviewPanel\Compatibility\Yoast;
use AFloatingLivePreviewPanel\Panel;

if (!defined('WP_CLI') || !WP_CLI || !class_exists(Panel::class)) {
    throw new RuntimeException('Run through WP-CLI with A Floating Live Preview Panel active.');
}
$check = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException(esc_html($message));
    }
};
$screenHooks = [
    'classic-editor' => 'aflpp_classic_editor_preview_config',
    'block-editor' => 'aflpp_block_editor_preview_config',
    'revision-browser' => 'aflpp_revision_browser_preview_config',
];
$dependencyHooks = [];
foreach ($screenHooks as $entry => $hook) {
    $dependencyHooks[$entry] = str_replace('_config', '_script_dependencies', $hook);
}
$hooks = [];
foreach (
    array_merge(array_values($screenHooks), array_values($dependencyHooks), [
        'aflpp_live_preview_form_values', 'aflpp_live_preview_custom_fields_initialized',
        'aflpp_live_preview_preparation_error', 'aflpp_frontend_live_preview_source_selected',
        'aflpp_frontend_saved_preview_source_selected',
    ]) as $hook
) {
    $hooks[$hook] = isset($GLOBALS['wp_filter'][$hook]) ? clone $GLOBALS['wp_filter'][$hook] : null;
    remove_all_filters($hook);
}
$scripts = $GLOBALS['wp_scripts'] ?? null;
$styles = $GLOBALS['wp_styles'] ?? null;
$GLOBALS['wp_scripts'] = new WP_Scripts();
$GLOBALS['wp_styles'] = new WP_Styles();
try {
    $acf = new Acf();
    new Yoast();
    if ($acf->isAvailable()) {
        $check($acf->editorDependencies() === [], 'An unregistered optional script must not withhold the core entry.');
        wp_register_script('acf-input', false, ['jquery']);
        $check($acf->editorDependencies() === ['acf-input'], 'Registered ACF assets must precede the entry.');
    }
    $panel = new Panel(dirname(__DIR__) . '/a-floating-live-preview-panel.php');
    $base = ['postId' => 123, 'base' => str_repeat('a', 64), 'strings' => []];
    $context = ['post' => ['id' => 123], 'source' => null];
    $revisionDependencies = apply_filters($dependencyHooks['revision-browser'], ['revisions'], $context);
    $check(
        apply_filters('aflpp_revision_browser_preview_config', $base, $context) === $base
        && $revisionDependencies === ['revisions'],
        'Read-only revision screens must not acquire live field assets or configuration.'
    );
    $seen = [];
    $configured = [];
    foreach ($screenHooks as $entry => $hook) {
        add_filter($hook, static function (
            array $config,
            array $received
        ) use (
            $entry,
            $context,
            $check,
            &$configured
        ): array {
            $check($received === $context, 'Screen configuration must receive only core-owned identities.');
            $received['post']['id'] = 999;
            $configured[] = $entry;
            $config['vendorOne'] = $entry;
            return $config;
        }, 20, 2);
        add_filter($hook, static function (array $config): array {
            $config['vendorTwo'] = ['empty' => '', 'label' => '</script><script>unsafe</script>'];
            return $config;
        }, 30);
        add_filter($dependencyHooks[$entry], static function (
            array $dependencies,
            array $received
        ) use (
            $entry,
            $check,
            &$seen
        ): array {
            $check(
                array_keys($received) === ['post', 'source', 'config']
                && $received['post'] === ['id' => 123] && $received['source'] === null,
                'Asset context must preserve core identities separately from the contributed configuration.'
            );
            $seen[] = [$entry, $received['config']['vendorOne']];
            wp_register_script('aflpp-fixture-one', false, ['wp-hooks']);
            return array_merge($dependencies, ['aflpp-fixture-one']);
        }, 20, 2);
        add_filter($dependencyHooks[$entry], static function (array $dependencies): array {
            wp_register_script('aflpp-fixture-two', false, ['wp-hooks']);
            return array_merge($dependencies, ['aflpp-fixture-two']);
        }, 30);
    }
    foreach (
        [
            'classic-editor' => ['jquery', 'autosave'],
            'block-editor' => ['wp-data'],
            'revision-browser' => ['revisions'],
        ] as $entry => $deps
    ) {
        wp_deregister_script('a-floating-live-preview-panel');
        $panel->enqueue($entry, $base, $deps);
        $script = wp_scripts()->registered['a-floating-live-preview-panel'];
        foreach (array_merge($deps, ['aflpp-fixture-one', 'aflpp-fixture-two']) as $dependency) {
            $check(in_array($dependency, $script->deps, true), 'Extensions must preserve existing dependencies.');
        }
        $inline = implode("\n", wp_scripts()->get_data('a-floating-live-preview-panel', 'before'));
        $json = substr($inline, strpos($inline, ' = ') + 3, -1);
        $config = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        $check($config['vendorOne'] === $entry && $config['vendorTwo']['empty'] === '', 'Both contributors must run.');
        $check(
            $config['postId'] === $base['postId'] && $config['base'] === $base['base'],
            'Core identity stays intact.'
        );
        $check(!str_contains($inline, '</script>'), 'Contributed configuration must retain inline-script escaping.');
        $check(isset($config['strings']['failed']), 'Shared labels must still be merged after contributions.');
        if ($entry === 'revision-browser') {
            $check(
                !isset($config['acfEnabled']) && !isset($config['yoastPrimaryTaxonomies']),
                'History stays integration-neutral.'
            );
            $check(!in_array('acf-input', $script->deps, true), 'History does not load live ACF assets.');
        }
    }
    $check($configured === array_keys($screenHooks), 'Only the selected screen configuration filter must run.');
    $check(
        $seen === [
            ['classic-editor', 'classic-editor'], ['block-editor', 'block-editor'],
            ['revision-browser', 'revision-browser'],
        ],
        'Only the selected screen asset filter must run with its already-filtered configuration.'
    );
    WP_CLI::success('External configuration/assets, contributors, ordering, escaping and revision isolation passed.');
} finally {
    foreach ($hooks as $hook => $previous) {
        if ($previous === null) {
            unset($GLOBALS['wp_filter'][$hook]);
        } else {
            $GLOBALS['wp_filter'][$hook] = $previous;
        }
    }
    $GLOBALS['wp_scripts'] = $scripts;
    $GLOBALS['wp_styles'] = $styles;
}
