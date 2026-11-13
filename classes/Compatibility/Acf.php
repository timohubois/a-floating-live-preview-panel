<?php

namespace AFloatingLivePreviewPanel\Compatibility;

use WP_Error;

/** Keep ACF's field, save and preview contracts outside the preview coordinator. */
final class Acf
{
    private bool $saving = false;
    private int $savedId = 0;
    private int $previewPostId = 0;
    private int $sourceId = 0;

    /** Load ACF's classic JavaScript API before the admin entry point. */
    public function editorDependencies(): array
    {
        return function_exists('acf') ? ['acf-input'] : [];
    }

    /** Import the optional module only when ACF is available, with its own cache version. */
    public function editorModule(string $file): ?string
    {
        if (!function_exists('acf')) {
            return null;
        }
        return add_query_arg(
            'ver',
            (string) filemtime(dirname($file) . '/assets/compatibility/acf.js'),
            plugins_url('assets/compatibility/acf.js', $file)
        );
    }

    /** Extend an authorized, unslashed REST payload using ACF's normal form context. */
    public function preparePayload(array $payload, array $input): array|WP_Error
    {
        $this->saving = array_key_exists('acf', $input);
        $this->savedId = 0;
        if (!$this->saving) {
            return $payload;
        }
        if (
            !is_array($input['acf']) || !function_exists('acf_restrict_save_input')
            || !isset($input['_acf_nonce']) || !is_string($input['_acf_nonce'])
            || !wp_verify_nonce($input['_acf_nonce'], 'post')
            || (isset($input['_acf_fields']) && !is_array($input['_acf_fields']))
        ) {
            return new WP_Error(
                'aflpp_acf_unavailable',
                __('ACF preview support is unavailable or expired.', 'a-floating-live-preview-panel'),
                ['status' => 400]
            );
        }
        foreach (acf_get_field_groups(['post_id' => $payload['post_ID']]) as $group) {
            if ($this->hasPaginatedRepeater(acf_get_fields($group))) {
                return new WP_Error(
                    'aflpp_acf_pagination_unsupported',
                    __(
                        'Live preview does not support paginated ACF repeaters yet. Use WordPress Preview.',
                        'a-floating-live-preview-panel'
                    ),
                    ['status' => 422]
                );
            }
        }
        $payload['acf'] = $input['acf'];
        $payload['_acf_nonce'] = $input['_acf_nonce'];
        $payload['_acf_changed'] = '1'; // Keep ACF-only autosaves alive.
        if (isset($input['_acf_fields'])) {
            $payload['_acf_fields'] = $input['_acf_fields'];
        }
        add_action('acf/save_post', [$this, 'recordSave'], PHP_INT_MAX);
        return $payload;
    }

    private function hasPaginatedRepeater(array $fields): bool
    {
        foreach ($fields as $field) {
            if (($field['type'] ?? '') === 'repeater' && !empty($field['pagination'])) {
                return true;
            }
            if ($this->hasPaginatedRepeater($field['sub_fields'] ?? [])) {
                return true;
            }
            foreach ($field['layouts'] ?? [] as $layout) {
                if ($this->hasPaginatedRepeater($layout['sub_fields'] ?? [])) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Metadata seeding must also invalidate this revision's request-local ACF value cache. */
    public function clearRevisionCache(int $revisionId): void
    {
        if (!function_exists('acf_get_store')) {
            return;
        }
        $store = acf_get_store('values');
        foreach (array_keys($store->get_data()) as $key) {
            if (str_starts_with($key, $revisionId . ':')) {
                $store->remove($key);
            }
        }
    }

    public function recordSave($postId): void
    {
        $this->savedId = (int) $postId;
    }

    /** The coordinator still owns and verifies the exact autosave revision. */
    public function verifySave(int $revisionId): ?WP_Error
    {
        if (!$this->saving) {
            return null;
        }
        remove_action('acf/save_post', [$this, 'recordSave'], PHP_INT_MAX);
        $this->saving = false;
        if (!$revisionId || $this->savedId !== $revisionId) {
            return new WP_Error(
                'aflpp_acf_not_saved',
                __('ACF values were not saved to the preview revision.', 'a-floating-live-preview-panel'),
                ['status' => 409]
            );
        }
        return null;
    }

    /** Called only after core authentication, revision ownership and state checks succeed. */
    public function bindPreview(int $postId, int $sourceId): void
    {
        $this->previewPostId = $postId;
        $this->sourceId = $sourceId;
        add_filter('acf/validate_post_id', [$this, 'readPostId'], PHP_INT_MAX, 2);
    }

    public function readPostId($postId, $original)
    {
        if (is_object($original)) {
            // Match ACF's post-object distinction; users, terms and comments keep their own IDs.
            if (!isset($original->post_type, $original->ID)) {
                return $postId;
            }
            $original = $original->ID;
        }
        if (
            (is_numeric($original) && (int) $original === $this->previewPostId)
            || (!$original && is_numeric($postId) && get_the_ID() === $this->previewPostId)
        ) {
            return $this->sourceId;
        }
        return $postId;
    }
}
