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

    public function __construct()
    {
        add_filter('aflpp_preview_payload', [$this, 'preparePayload'], 10, 2);
        add_action('aflpp_preview_meta_seeded', [$this, 'clearRevisionCache']);
        add_filter('aflpp_preview_save_error', [$this, 'verifySave'], 10, 2);
        add_action('aflpp_preview_source', [$this, 'bindPreview'], 10, 3);
    }

    /** Load ACF's field JavaScript API before either editor entry point. */
    public function editorDependencies(): array
    {
        return $this->isAvailable() ? ['acf-input'] : [];
    }

    public function isAvailable(): bool
    {
        return function_exists('acf');
    }

    /** Extend an authorized, unslashed REST payload using ACF's normal form context. */
    public function preparePayload(array|WP_Error $payload, array $input): array|WP_Error
    {
        $this->resetSave();
        if (is_wp_error($payload)) {
            return $payload;
        }
        $this->saving = array_key_exists('acf', $input);
        if (!$this->saving) {
            return $payload;
        }
        if (
            !$this->isAvailable() || !is_array($input['acf']) || !function_exists('acf_save_post')
            || !isset($input['_acf_nonce']) || !is_string($input['_acf_nonce'])
            || !wp_verify_nonce($input['_acf_nonce'], 'post')
            || (isset($input['_acf_fields']) && !is_array($input['_acf_fields']))
        ) {
            return new WP_Error(
                'aflpp_acf_unavailable',
                __('The preview can’t read your custom fields.', 'a-floating-live-preview-panel'),
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
        if (!$store) {
            return;
        }
        // ACF's flush helper targets one named field, not a source (including absent/default values).
        // Keep invalidation source-scoped rather than resetting unrelated objects' cached values.
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

    private function resetSave(): void
    {
        remove_action('acf/save_post', [$this, 'recordSave'], PHP_INT_MAX);
        $this->saving = false;
        $this->savedId = 0;
    }

    /** The coordinator still owns and verifies the exact preview revision. */
    public function verifySave(?WP_Error $error, int $revisionId): ?WP_Error
    {
        try {
            if ($error || !$this->saving) {
                return $error;
            }
            if (!$revisionId || $this->savedId !== $revisionId) {
                return new WP_Error(
                    'aflpp_acf_not_saved',
                    __('We couldn’t add your field changes to the preview.', 'a-floating-live-preview-panel'),
                    ['status' => 409]
                );
            }
            return null;
        } finally {
            $this->resetSave();
        }
    }

    /** Bind only an authorized source; saved history must also reject redirected ACF writes. */
    public function bindPreview(int $postId, int $sourceId, bool $readOnly = false): void
    {
        $this->unbindPreview();
        // Check at use time: optional plugins may load after our bootstrap.
        if (
            !$this->isAvailable() || !function_exists('acf_decode_post_id') || !function_exists('acf_get_metadata')
            || $postId < 1 || $sourceId < 1
        ) {
            return;
        }
        $this->previewPostId = $postId;
        $this->sourceId = $sourceId;
        $this->readOnly = $readOnly;
        add_filter('acf/validate_post_id', [$this, 'readPostId'], PHP_INT_MAX, 2);
        // ACF post-meta blocks use the lower-level value APIs without validating a post ID first.
        add_filter('acf/pre_load_metadata', [$this, 'readMetadata'], PHP_INT_MAX, 4);
        $this->clearRevisionCache($postId);
        if ($readOnly) {
            add_filter('acf/pre_update_metadata', [$this, 'preventSourceWrite'], PHP_INT_MAX, 2);
            add_filter('acf/pre_delete_metadata', [$this, 'preventSourceWrite'], PHP_INT_MAX, 2);
        }
        add_action('shutdown', [$this, 'unbindPreview'], PHP_INT_MAX);
    }

    /** Keep read overlays through rendering, then remove only this adapter's hooks and cached values. */
    public function unbindPreview(): void
    {
        remove_filter('acf/validate_post_id', [$this, 'readPostId'], PHP_INT_MAX);
        remove_filter('acf/pre_load_metadata', [$this, 'readMetadata'], PHP_INT_MAX);
        remove_filter('acf/pre_update_metadata', [$this, 'preventSourceWrite'], PHP_INT_MAX);
        remove_filter('acf/pre_delete_metadata', [$this, 'preventSourceWrite'], PHP_INT_MAX);
        remove_action('shutdown', [$this, 'unbindPreview'], PHP_INT_MAX);
        foreach (array_unique([$this->previewPostId, $this->sourceId]) as $postId) {
            if ($postId) {
                $this->clearRevisionCache($postId);
            }
        }
        $this->previewPostId = 0;
        $this->sourceId = 0;
        $this->readOnly = false;
    }

    /** Cover values, field references and repeater children without affecting other ACF objects. */
    public function preventSourceWrite($check, $postId)
    {
        if (!$this->readOnly || !$this->sourceId || !function_exists('acf_decode_post_id')) {
            return $check;
        }
        $target = acf_decode_post_id($postId);
        return $target['type'] === 'post' && (int) $target['id'] === $this->sourceId ? false : $check;
    }

    public function readMetadata($value, $postId, string $name, bool $hidden)
    {
        if (
            $value !== null || !$this->previewPostId || !$this->sourceId
            || !function_exists('acf_decode_post_id') || !function_exists('acf_get_metadata')
        ) {
            return $value;
        }
        $target = acf_decode_post_id($postId);
        if (
            $target['type'] !== 'post' || (int) $target['id'] !== $this->previewPostId
            || $this->sourceId === $this->previewPostId
        ) {
            return $value;
        }
        // ACF's null sentinel prevents a missing source field from falling back to saved parent data.
        return acf_get_metadata($this->sourceId, $name, $hidden) ?? '__return_null';
    }

    public function readPostId($postId, $original)
    {
        if (!$this->previewPostId || !$this->sourceId) {
            return $postId;
        }
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
