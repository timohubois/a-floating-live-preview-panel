=== Floating Live Preview ===
Contributors: timohubois
Tags: preview, editor
Requires PHP: 8.3
Stable tag: trunk
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

A floating live frontend preview while editing posts, pages and eligible custom post types.

== Description ==

Floating Live Preview adds a movable, resizable frontend preview to classic WordPress editing screens. Your theme and plugins render the output through WordPress's native preview routing, including redirects and browser-native output such as PDFs.

Live updates write the current user's autosave revision, not the saved parent post, and do not publish changes. Use the normal WordPress save, update or publish controls to save your changes to the post.

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

1. Place the plugin in /wp-content/plugins/floating-live-preview/ and activate **Floating Live Preview**.
2. Open a saved post, page or frontend-viewable custom post type in its classic editing screen. Save a new post as a draft first; the plugin does not enable revisions for you.
3. Use the compact preview window or **Live preview** launcher. Edit supported fields and the preview refreshes after a short pause.
4. Move the window by its title or resize from an edge or corner. Use **Preview actions** for docking, other display modes or **Open preview in new tab**.
5. Use WordPress's normal save, update or publish controls to save your changes to the post.

== Frequently Asked Questions ==

= Which fields update live? =

Title, content, excerpt and supported post-local ACF fields. Other metadata, related content and global settings are not live inputs. ACF support depends on compatible field and revision APIs; not every field type has been verified. Paginated repeaters are unsupported; use ordinary WordPress Preview for those forms.

= Does this replace saving or publishing? =

No. It writes the current user's autosave revision, without updating the saved parent post or publishing changes. WordPress's normal server autosave pauses while the preview panel is open and resumes after closing it and finishing any pending preview write. Closing the preview does not discard editor fields.

= Does it work with the Block Editor? =

No. It supports classic post-editing screens, not the Block Editor or Site Editor.

= What does Scroll to changes do? =

It follows the first detected text or media change in recognized HTML previews. Shorter changes are normally centered; taller ones are shown from their beginning. It respects site scrolling behavior, but complex headers may still obscure content. Styling-only changes may be missed and dynamic output can introduce unrelated differences. Turn it off to retain manual positioning. PDF page, zoom and scroll state are browser-owned and may reset on refresh.

= What preferences are remembered? =

Preview visibility, the last device viewport and Scroll to changes are stored per WordPress user across posts. Remember preview visibility and Scroll to changes are on by default; the initial viewport is Desktop. Disable remembering to start compact and open on each editor load. Window size and position reset on a new editor load. Deactivation and deletion do not remove stored preferences.

= What happens with multiple editor tabs? =

**Take over** switches preview ownership after pending writes finish. Each tab keeps its own fields; values are not copied or merged. Handover is cooperative within the same browser. If it fails, preserve unsaved edits and close the other preview manually before retrying. Other browsers and devices are not coordinated; this is not a collaborative editing tool.

= Why is the preview blank or not updating? =

Check edit permission, revisions, REST authentication and browser support. Site and browser embedding restrictions still apply; do not weaken them to force an embedded preview. Use **Open preview in new tab** when an authorized preview cannot be embedded. **Preview refreshed** means a document loaded, not that its content was verified or published; login or error pages can also load.

= Is the preview isolated from the editor? =

No. The preview is not sandboxed. Frontend scripts run with normal browser permissions, and same-origin scripts can access the editor. Only use trusted theme and plugin code.

== Want to contribute? ==

For compatibility reports, include the WordPress and PHP versions, browser, editor, theme, any active ACF version and steps to reproduce. Keep credentials and private site data out of reports.

== License ==

GPLv3 or later. Bundled icons are an unchanged subset of [Gutenberg's @wordpress/icons 20.0.0](https://github.com/WordPress/gutenberg/tree/55ab503b80b1561f48414b2eb209c25b793a9e8a/packages/icons) by the WordPress Contributors, licensed GPL-2.0-or-later.
