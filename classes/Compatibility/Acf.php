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
    private bool $readOnly = false;

    /** Load ACF's classic JavaScript API before the admin entry point. */
    public function editorDependencies(): array
    {
        return $this->isAvailable() ? ['acf-input'] : [];
    }

    public function isAvailable(): bool
    {
        return function_exists('acf');
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
            !is_array($input['acf']) || !function_exists('acf_save_post')
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
        // Preserve row keys and status markers so ACF merges paginated edits with the seeded saved rows.
        $payload['acf'] = $input['acf'];
        $payload['_acf_nonce'] = $input['_acf_nonce'];
        $payload['_acf_changed'] = '1'; // Preserve ACF's classic-preview save context.
        if (isset($input['_acf_fields'])) {
            $payload['_acf_fields'] = $input['_acf_fields'];
        }
        add_action('acf/save_post', [$this, 'recordSave'], PHP_INT_MAX);
        return $payload;
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

    /** The coordinator still owns and verifies the exact preview revision. */
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

    /** Bind only an authorized source; saved history must also reject redirected ACF writes. */
    public function bindPreview(int $postId, int $sourceId, bool $readOnly = false): void
    {
        $this->previewPostId = $postId;
        $this->sourceId = $sourceId;
        $this->readOnly = $readOnly;
        add_filter('acf/validate_post_id', [$this, 'readPostId'], PHP_INT_MAX, 2);
        if ($readOnly) {
            add_filter('acf/pre_update_metadata', [$this, 'preventSourceWrite'], PHP_INT_MAX, 2);
            add_filter('acf/pre_delete_metadata', [$this, 'preventSourceWrite'], PHP_INT_MAX, 2);
        }
    }

    /** Cover values, field references and repeater children without affecting other ACF objects. */
    public function preventSourceWrite($check, $postId)
    {
        if (!$this->readOnly) {
            return $check;
        }
        $target = acf_decode_post_id($postId);
        return $target['type'] === 'post' && (int) $target['id'] === $this->sourceId ? false : $check;
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
