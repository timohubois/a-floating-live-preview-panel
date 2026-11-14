=== A Floating Live Preview Panel ===
Contributors: timohubois
Tags: preview, editor
Requires at least: 6.7
Requires PHP: 8.3
Stable tag: trunk
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

See your changes in a floating preview while you edit posts, pages and supported custom post types.

== Description ==

A Floating Live Preview Panel adds a movable, resizable frontend preview to WordPress's post Block Editor, classic editing screens and the native revision browser. Your theme and plugins render the output through WordPress's native preview routing, including redirects and browser-native output such as PDFs.

Live updates write a separate internal preview revision, not the saved parent post or WordPress's recovery autosave, and do not publish changes. Preview revisions do not appear in the normal revision history or trigger the newer-autosave notice. Use the normal WordPress save, update or publish controls to save your changes to the post.

**Features**

* Move, resize or dock the preview without leaving the editor. Keyboard movement and resizing are supported.
* Preview the selected To revision while navigating WordPress's revision browser, without restoring it or changing saved content.
* Switch between Desktop, Tablet and Mobile viewport widths without reloading the preview.
* Follow changed content automatically, or turn off Scroll to changes to retain manual positioning.
* Remember whether the preview is open, its size and position, and the preview page width for each user. Use full screen or Picture-in-picture where supported.

**Before you start**

Requires WordPress 6.7+, PHP 8.3+, a saved post in a frontend-viewable post type, and permission to edit it. Live editing requires the post Block Editor or classic editor and enabled revisions. ACF is optional.

The admin and frontend must share an origin and the browser must support ES modules. Live editing additionally requires working authenticated WordPress REST requests and Web Locks in a secure context. Composer and Node.js are not required to run the plugin.

**Development status:** not a verified release. An installed ZIP has passed core-only browser smoke tests on WordPress 6.7 and 7.1.4 with PHP 8.3 and the default Twenty Twenty-Five theme, covering both editors, featured images, native saves/autosaves and read-only revision previews. Stable-WordPress ACF PRO 6.8.11 checks also passed with its datastore disabled and enabled. Earlier Flynt/ACF checks used WordPress 7.1.2 and 7.2-beta5; administrator classic integration was rechecked with Ask the Origin 1.1.2. These focused checks do not establish a general browser, theme or ACF compatibility range; see README.md for the verified scope.

== Installation ==

Use a disposable local or staging WordPress installation while this is in development.

1. Place the plugin in /wp-content/plugins/a-floating-live-preview-panel/ and activate **A Floating Live Preview Panel**.
2. Open a post, page or frontend-viewable custom post type in its Block Editor or classic editing screen. New posts need a native draft save first; the Block Editor panel becomes available without reloading. The plugin does not force saves or enable revisions for you.
3. Use the compact preview window or **Live preview** launcher. Edit supported fields and the preview refreshes after a short pause.
4. Move the window by its plain titlebar or drag the closed **Live preview** launcher; they share one position. Resize from usable borders and corners. Arrow keys work on the move grip, launcher and single boundary resize control; hold Shift for larger steps. Use **Preview actions** for **Position**, **Size → Small / Large**, other display modes or **Open preview in a new tab**.
5. Use WordPress's normal save, update or publish controls to save your changes to the post.

== Frequently Asked Questions ==

= Can I preview saved revisions? =

Yes. Open WordPress's native revision browser and use **Revision preview**. The panel follows the right-hand **To** selection when you move the slider or use Previous/Next. Its caption identifies the displayed revision by date and author. Comparison and Restore remain native WordPress controls; browsing the preview does not restore content, write internal revisions or overwrite recovery autosaves. The same panel controls and per-user preferences apply.

Title, content, excerpt, revision-enabled post metadata and stored ACF values come from the selected revision. The current-post entry uses saved parent data. Themes, styles, global settings, related content and unrevisioned metadata remain current; this is not a complete historical site snapshot. Missing historical fields cannot be reconstructed. Reload the revision browser if a source is removed or its preview URL expires.

= Which fields update live? =

Both editors preview title, content, excerpt and supported post-local ACF fields. The Block Editor supplies serialized blocks in visual or code mode and previews featured-image selection, replacement and removal. ACF meta boxes use native form values and the shared ACF save integration; ACF blocks retain their native content-save hooks, including post-meta storage. Arbitrary non-ACF metadata, taxonomies, template selections and unsaved separate entities are not live inputs. Native ACF/legacy meta-box saving remains intact; saved values become the new baseline. ACF support depends on compatible field and revision APIs; not every field type has been verified. Paginated repeaters use ACF's native row merging to preserve unloaded saved rows and edits retained across pages.

Unsaved excerpts are captured, but renderers that reload the saved post by ID may still show the saved excerpt. Core's Post Excerpt block does this on WordPress 6.7 and 7.1.4 even in native Preview of a published post. The panel retains that native behavior rather than replacing the renderer; a native save or own-draft autosave can change the saved value.

The plugin respects ACF's opt-in datastore when already enabled; it never enables it or edits Gutenberg's metadata to prepare a preview. After native meta-box saving, the panel waits for ACF to replace its paginated rows before resuming. If that reload fails, it retains the last preview and asks you to reload rather than resetting ACF's row markers. Live previews do not provide crash recovery: Gutenberg skips legacy meta boxes during native autosave, and ACF datastore recovery behavior remains ACF's responsibility.

= Are ACF, Timber or Flynt required? =

No. The preview uses WordPress's normal frontend rendering APIs. Optional compatibility files explicitly own third-party behavior: ACF handles supported post-local fields and their save/read contracts; Timber makes its post imports read title, content and excerpt from the authorized preview source. These integrations do not change preview permissions or replace theme rendering. Flynt is a local test theme, not a separate integration or requirement. Each adapter checks its own required APIs before use and removes its temporary hooks when the write or preview request ends. Missing dependencies leave core previews working; submitted ACF values without its save APIs produce a clear error rather than being discarded. This is not a guarantee across all dependency versions; see README.md for ownership and scope.

= Does this replace saving or publishing? =

No. It writes a separate internal preview revision per user and post, without updating the saved parent post, overwriting recovery autosaves or publishing changes. Preview revisions are reused on refresh and deleted when the parent post is updated or permanently deleted. WordPress's normal server autosave continues independently, including its usual updates to your own drafts. Closing the preview does not discard editor fields.

= What happens when I save, update or publish? =

An open panel keeps its last frame while outstanding live writes finish and WordPress validates and submits the form. Live updates pause during this action and resume if browser, WordPress or ACF validation rejects it. Classic saves use the normal editor reload. Block Editor saves and autosaves keep the editor open, wait for legacy meta-box saves, then resume previewing against the acknowledged saved state. A panel you explicitly closed stays closed. If the saved state cannot be confirmed, preserve your edits and reload; the panel never guesses a new baseline or prevents WordPress from saving.

= What happens when I use WordPress's Preview button? =

The panel and its last frame stay visible while outstanding live writes finish. Native Preview retains WordPress's normal behavior, including saving changes to your own drafts, and live updates normally resume afterward. Block Editor native REST saves and autosaves use request-specific fingerprint receipts. Classic Preview and block-editor legacy meta-box saves use an acknowledgement cookie containing fingerprints, not editor content; it is cleared on completion and expires after one minute.

In the classic editor, if native Preview saves additions, deletions or reordering in a draft's paginated ACF repeaters, the panel keeps its last frame but asks you to reload. ACF's remaining row changes still refer to the old saved order. Copy any later edits, then reload the editor before saving again.

= Does it work with the Block Editor? =

Yes, for posts, pages and frontend-viewable custom post types that use the post Block Editor. Title, serialized block content, excerpt, supported post-local ACF fields and featured images update live, and new posts become eligible after their first native save. The Site Editor and unsaved changes to separate entities such as synced patterns are excluded. Saved post revisions can also be previewed through WordPress's native revision browser.

= What does Scroll to changes do? =

It follows the first detected content, structure or layout-attribute change in recognized HTML previews, without theme-specific integration. Shorter changes are normally centered; taller ones are shown from their beginning. It respects site scrolling behavior, but complex headers may still obscure content. Changes made only through stylesheets or frontend state may be missed, and dynamic output at load can introduce unrelated differences. Turn it off to retain manual positioning. PDF page, zoom and scroll state are browser-owned and may reset on refresh.

= Which settings are remembered? =

Whether the preview is open, the preview page width, Scroll to changes and layout settings are stored per WordPress user across posts, both editors and the revision browser. Remember if the preview is open, Remember size and position and Scroll to changes are on by default; the initial viewport is Desktop and the initial panel is Small, compact, bottom-right. Disabling Remember if the preview is open starts the preview open on each new screen load, independently of its layout.

Remember size and position restores compact dimensions, custom placement or responsive docking, the shared panel/launcher anchor and expanded/compact mode. Turning it off leaves the current layout untouched and discards its saved geometry. Each new screen load then starts Small and compact at your preferred Position preset. Preset choices are always saved; dragging does not erase that preference. Closing and reopening without reloading keeps the current layout. Re-enabling remembering saves the current layout instead of restoring an old one. Reset size and position restores Small, compact, bottom-right and saves that preset without changing the remembering preference. Restored layouts fit the current window without overwriting preferred bounds; full screen and Picture-in-picture never reopen automatically.

Deactivation keeps preferences; uninstalling through WordPress removes the plugin's server-stored preferences.

= What happens when I uninstall the plugin? =

Uninstalling through WordPress removes internal preview revisions and their metadata, and only this plugin's namespace in persisted user preferences. On multisite, cleanup covers all sites. Saved posts, normal revisions, recovery autosaves and unrelated preferences are preserved. Deactivation alone does not remove data. Browser-local WordPress preference backups cannot be directly erased by PHP; cleaned server preferences receive a fresh timestamp.

= What happens with multiple editor tabs? =

**Use preview here** switches preview ownership after pending writes finish. Each tab keeps its own fields; values are not copied or merged. Handover is cooperative within the same browser. If it fails, preserve unsaved edits and close the other preview manually before retrying. Other browsers and devices are not coordinated; this is not a collaborative editing tool.

= Why is the preview blank or not updating? =

Check edit permission, revisions, REST authentication and browser support. Site and browser embedding restrictions still apply; do not weaken them to force an embedded preview. Use **Open preview in a new tab** when an authorized preview cannot be embedded. **Preview updated** means a document loaded, not that its content was verified or published; login or error pages can also load.

= Is the preview isolated from the editor? =

No. The preview is not sandboxed. Frontend scripts run with normal browser permissions, and same-origin scripts can access the editor. Only use trusted theme and plugin code.

== Want to contribute? ==

For compatibility reports, include the WordPress and PHP versions, browser, editor, theme, any active ACF version and steps to reproduce. Keep credentials and private site data out of reports.

== License ==

GPLv3 or later. Bundled icons are an unchanged subset of [Gutenberg's @wordpress/icons 20.0.0](https://github.com/WordPress/gutenberg/tree/55ab503b80b1561f48414b2eb209c25b793a9e8a/packages/icons) by the WordPress Contributors, licensed GPL-2.0-or-later.
