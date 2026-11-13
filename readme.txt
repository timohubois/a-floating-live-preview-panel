=== A Floating Live Preview Panel ===
Contributors: timohubois
Tags: preview, editor
Requires PHP: 8.3
Stable tag: trunk
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

A floating live frontend preview while editing posts, pages and eligible custom post types.

== Description ==

A Floating Live Preview Panel adds a movable, resizable frontend preview to classic WordPress editing screens. Your theme and plugins render the output through WordPress's native preview routing, including redirects and browser-native output such as PDFs.

Live updates write a separate internal preview revision, not the saved parent post or WordPress's recovery autosave, and do not publish changes. Preview revisions do not appear in the normal revision history or trigger the newer-autosave notice. Use the normal WordPress save, update or publish controls to save your changes to the post.

**Features**

* Move, resize or dock the preview without leaving the editor. Keyboard movement and resizing are supported.
* Switch between Desktop, Tablet and Mobile viewport widths without reloading the preview.
* Follow changed content automatically, or turn off Scroll to changes to retain manual positioning.
* Remember preview visibility and device viewport per user. Fullscreen and pop-out Picture-in-Picture are available where supported.

**Before you start**

Requires PHP 8.3+, a saved post in a frontend-viewable post type, revisions enabled for that post, and permission to edit it. The Block Editor and Site Editor are not supported. ACF is optional.

The admin and frontend must share an origin, authenticated WordPress REST requests must work, and the browser must support ES modules and Web Locks in a secure context. Composer and Node.js are not required to run the plugin.

**Development status:** not a verified release. The full authenticated editor-to-frontend workflow still needs integration testing. A minimum WordPress version and a general browser, theme or ACF compatibility range have not been verified.

== Installation ==

Use a disposable local or staging WordPress installation while this is in development.

1. Place the plugin in /wp-content/plugins/a-floating-live-preview-panel/ and activate **A Floating Live Preview Panel**.
2. Open a saved post, page or frontend-viewable custom post type in its classic editing screen. Save a new post as a draft first; the plugin does not enable revisions for you.
3. Use the compact preview window or **Live preview** launcher. Edit supported fields and the preview refreshes after a short pause.
4. Move the window by its title or resize from an edge or corner. Use **Preview actions** for docking, other display modes or **Open preview in new tab**.
5. Use WordPress's normal save, update or publish controls to save your changes to the post.

== Frequently Asked Questions ==

= Which fields update live? =

Title, content, excerpt and supported post-local ACF fields. Other metadata, related content and global settings are not live inputs. ACF support depends on compatible field and revision APIs; not every field type has been verified. Paginated repeaters use ACF's native row merging to preserve unloaded saved rows and edits retained across pages.

= Does this replace saving or publishing? =

No. It writes a separate internal preview revision per user and post, without updating the saved parent post, overwriting recovery autosaves or publishing changes. Preview revisions are reused on refresh and deleted when the parent post is updated or permanently deleted. WordPress's normal server autosave continues independently, including its usual updates to your own drafts. Closing the preview does not discard editor fields.

= What happens when I use WordPress's Preview button? =

The panel and its last frame stay visible while outstanding live writes finish. Native Preview retains WordPress's normal behavior, including saving changes to your own drafts, and live updates normally resume afterward. A request-specific cookie containing state fingerprints, not editor content, acknowledges completion; it is cleared on completion and expires after one minute.

If native Preview saves additions, deletions or reordering in a draft's paginated ACF repeaters, the panel keeps its last frame but asks you to reload. ACF's remaining row changes still refer to the old saved order. Copy any later edits, then reload the editor before saving again.

= Does it work with the Block Editor? =

No. It supports classic post-editing screens, not the Block Editor or Site Editor.

= What does Scroll to changes do? =

It follows the first detected content, structure or layout-attribute change in recognized HTML previews, without theme-specific integration. Shorter changes are normally centered; taller ones are shown from their beginning. It respects site scrolling behavior, but complex headers may still obscure content. Changes made only through stylesheets or frontend state may be missed, and dynamic output at load can introduce unrelated differences. Turn it off to retain manual positioning. PDF page, zoom and scroll state are browser-owned and may reset on refresh.

= What preferences are remembered? =

Preview visibility, the last device viewport and Scroll to changes are stored per WordPress user across posts. Remember preview visibility and Scroll to changes are on by default; the initial viewport is Desktop. Disable remembering to start compact and open on each editor load. Window size and position reset on a new editor load. Deactivation keeps preferences; uninstalling through WordPress removes the plugin's server-stored preferences.

= What happens when I uninstall the plugin? =

Uninstalling through WordPress removes internal preview revisions and their metadata, and only this plugin's namespace in persisted user preferences. On multisite, cleanup covers all sites. Saved posts, normal revisions, recovery autosaves and unrelated preferences are preserved. Deactivation alone does not remove data. Browser-local WordPress preference backups cannot be directly erased by PHP; cleaned server preferences receive a fresh timestamp.

= What happens with multiple editor tabs? =

**Preview here** switches preview ownership after pending writes finish. Each tab keeps its own fields; values are not copied or merged. Handover is cooperative within the same browser. If it fails, preserve unsaved edits and close the other preview manually before retrying. Other browsers and devices are not coordinated; this is not a collaborative editing tool.

= Why is the preview blank or not updating? =

Check edit permission, revisions, REST authentication and browser support. Site and browser embedding restrictions still apply; do not weaken them to force an embedded preview. Use **Open preview in new tab** when an authorized preview cannot be embedded. **Preview refreshed** means a document loaded, not that its content was verified or published; login or error pages can also load.

= Is the preview isolated from the editor? =

No. The preview is not sandboxed. Frontend scripts run with normal browser permissions, and same-origin scripts can access the editor. Only use trusted theme and plugin code.

== Want to contribute? ==

For compatibility reports, include the WordPress and PHP versions, browser, editor, theme, any active ACF version and steps to reproduce. Keep credentials and private site data out of reports.

== License ==

GPLv3 or later. Bundled icons are an unchanged subset of [Gutenberg's @wordpress/icons 20.0.0](https://github.com/WordPress/gutenberg/tree/55ab503b80b1561f48414b2eb209c25b793a9e8a/packages/icons) by the WordPress Contributors, licensed GPL-2.0-or-later.
