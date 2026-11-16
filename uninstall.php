<?php

/** Remove plugin-owned preview data without touching content or recovery autosaves. */

namespace AFloatingLivePreviewPanel;

defined('WP_UNINSTALL_PLUGIN') || exit;

// The deactivated plugin has not registered this status; WP_Query ignores unregistered statuses.
register_post_status('aflpp-preview', ['internal' => true]);

$aflppCleanupSite = static function (): void {
    global $wpdb;

    $offset = 0;
    do {
        $revisions = get_posts([
            'post_type' => 'revision',
            'post_status' => 'aflpp-preview',
            'posts_per_page' => 100,
            'offset' => $offset,
            'orderby' => 'ID',
            'order' => 'ASC',
            'fields' => 'ids',
        ]);
        foreach ($revisions as $revisionId) {
            $revision = get_post($revisionId);
            if (
                !$revision || $revision->post_type !== 'revision' || $revision->post_status !== 'aflpp-preview'
                || !wp_delete_post_revision($revisionId)
            ) {
                // Skip unexpected records or vetoed deletions rather than retrying them forever.
                ++$offset;
            }
        }
    } while (count($revisions) === 100);

    $metaKey = $wpdb->get_blog_prefix() . 'persisted_preferences';
    $page = 1;
    do {
        $userIds = get_users([
            'blog_id' => 0,
            // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- Bounded, uninstall-only preference scan.
            'meta_key' => $metaKey,
            'number' => 100,
            'paged' => $page++,
            'orderby' => 'ID',
            'order' => 'ASC',
            'fields' => 'ID',
        ]);
        foreach ($userIds as $userId) {
            $preferences = get_user_meta($userId, $metaKey, true);
            if (!is_array($preferences) || !array_key_exists('a-floating-live-preview-panel', $preferences)) {
                continue;
            }
            $previous = $preferences;
            unset($preferences['a-floating-live-preview-panel']);
            // Prefer the cleaned server copy over WordPress's older browser-local preference backup.
            $preferences['_modified'] = current_datetime()->format('Y-m-d\TH:i:s.vP');
            update_user_meta($userId, $metaKey, wp_slash($preferences), $previous);
        }
    } while (count($userIds) === 100);
};

if (!is_multisite()) {
    $aflppCleanupSite();
    return;
}

$aflppOffset = 0;
do {
    $aflppSiteIds = get_sites([
        'fields' => 'ids',
        'number' => 100,
        'offset' => $aflppOffset,
        'orderby' => 'id',
        'order' => 'ASC',
    ]);
    foreach ($aflppSiteIds as $aflppSiteId) {
        switch_to_blog($aflppSiteId);
        try {
            $aflppCleanupSite();
        } finally {
            restore_current_blog();
        }
    }
    $aflppOffset += count($aflppSiteIds);
} while (count($aflppSiteIds) === 100);
