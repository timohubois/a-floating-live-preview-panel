=== A Floating Live Preview Panel ===
Contributors: timohubois
Tags: preview, editor
Requires at least: 6.7
Tested up to: 7.1
Stable tag: 1.0.0
Requires PHP: 8.3
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

See your changes in a floating preview while you edit posts, pages and supported custom post types.

== Description ==

A Floating Live Preview Panel adds a movable, resizable frontend preview to WordPress's post Block Editor, classic editing screens and native revision browser. Your theme and plugins render the output through WordPress's normal preview routing.

Live updates use a separate internal preview revision. They do not publish changes, update the saved post or overwrite WordPress's recovery autosave. Use the normal **Save**, **Update** or **Publish** controls to save your work.

**Features**

* Move, resize or dock the preview without leaving the editor, with keyboard movement and resizing.
* Preview saved revisions while navigating WordPress's revision browser, without restoring or changing content.
* Switch between Computer, Tablet and Phone viewports. Click the selected Tablet or Phone button again to rotate it.
* Choose Auto, Fit to panel, Fill width or a custom zoom. Viewport dimensions stay fixed while visual scale changes.
* Follow detected content changes automatically, or turn off Scroll to my changes to retain manual positioning.
* Remember visibility, layout, viewport and scrolling preferences per user. Use fullscreen or Keep on top where supported.

**Before you start**

Requires WordPress 6.7+, PHP 8.3+, a saved post in a frontend-viewable post type and permission to edit it. Live editing also requires enabled revisions. ACF, Timber, Yoast SEO and Flynt are optional.

The admin and frontend must share an origin. The browser must support ES modules; live editing additionally requires authenticated WordPress REST requests and Web Locks in a secure context. The Site Editor and unsaved changes to separate entities such as synced patterns are not supported.

Check your intended workflow on a local or staging site before using the plugin on a live site. Focused installed-package checks passed on WordPress 6.7 and 7.1.4 with PHP 8.3 and Twenty Twenty-Five; optional integration checks are configuration-specific, not a general browser, theme or plugin compatibility guarantee.

== Installation ==

1. Upload the built plugin folder to /wp-content/plugins/a-floating-live-preview-panel/ and activate **A Floating Live Preview Panel** under **Plugins**. A Git checkout or automatic source ZIP requires an asset build first; see the [repository README](https://github.com/timohubois/a-floating-live-preview-panel/#installation). Composer and Node.js are not required to run a built package.
2. Open a post, page or supported custom post type in its Block Editor or classic editor. Save new posts as drafts first; the Block Editor panel becomes available without reloading.
3. Open **Live preview**, edit a supported field and the preview refreshes after a short pause.
4. Move the panel by its titlebar and resize it from its borders or corners. Use **Preview options** for docking, reset and other settings.
5. Save your work using WordPress's normal save, update or publish controls.

The plugin does not force saves or enable revisions. WordPress's normal **Preview** button remains available.

== Frequently Asked Questions ==

= Which fields update live? =

Both editors preview title, content, excerpt and supported post-local ACF fields. The Block Editor also previews author, publication date/time, taxonomy assignments and featured-image selection, replacement and removal. Dates affect the preview, not publishing status or scheduling.

Arbitrary non-ACF metadata, template selections and unsaved separate entities are not live inputs. Standard term lists and supported Timber term reads can use unsaved assignments; direct relationship queries and related/archive queries remain saved.

= Are ACF, Timber, Yoast or Flynt required? =

No. Core previews work without them. Optional ACF support uses native field and revision APIs, including paginated repeater merging and post-meta block saving. Not every field type or dependency version has been verified. The plugin respects ACF's datastore setting; it does not enable it.

Optional Timber support adapts standard post imports and term lists, not theme-specific Post subclasses or arbitrary relationship queries. Optional Yoast support uses its existing Block Editor primary-term controls and native breadcrumb renderer; the theme must already output breadcrumbs. SEO title, meta description and analysis scores are not live inputs. Flynt is a test theme, not a separate integration or requirement.

= Can I preview saved revisions? =

Yes. Open WordPress's native revision browser and use **Revision preview**. The panel follows the right-hand **To** selection and identifies the displayed revision by date and author. Comparison and Restore remain native WordPress controls. Browsing does not restore content, write live-preview revisions or overwrite recovery autosaves.

Title, content, excerpt, revision-enabled metadata and stored ACF values come from the selected source. The current-post entry uses saved parent data. Themes, styles, global settings, dates, taxonomy assignments and unrevisioned metadata remain current. Missing historical fields cannot be reconstructed; this is not a complete historical site snapshot.

= Does this replace saving, autosave or crash recovery? =

No. Live previews write a separate internal revision per user and post. These revisions stay out of normal revision history, do not trigger the newer-autosave notice, and are reused on refresh. They are deleted when the parent post is updated or permanently deleted.

WordPress's normal autosaves continue independently, including their usual updates to your own drafts. Closing the preview does not discard editor fields. The panel is not crash recovery; native editor and ACF recovery limitations still apply.

= What happens when I save or use WordPress's Preview button? =

An open panel keeps its last frame while outstanding live writes finish and WordPress saves or opens native Preview. Live updates pause and resume after the saved state is confirmed, or if validation rejects the save. Classic saves reload the editor normally. Block Editor saves wait for legacy meta-box saving and ACF row reloads where needed. An explicitly closed panel stays closed.

If the saved state or ACF row reload cannot be confirmed, preserve your edits and reload. The panel does not guess a new baseline or prevent WordPress from saving. In the classic editor, native Preview that saves structural changes to a draft's paginated ACF repeaters also requires reloading before further saving; copy any later edits first.

= How do viewports and zoom work? =

Computer uses 1280 × 800 CSS pixels, Tablet 768 × 1024 and Phone 390 × 844. Click the selected Tablet or Phone button again to rotate it; each remembers its own orientation. These are representative viewport sizes, not device, user-agent or touch emulation.

**Auto** fits the whole viewport, capped at screen-pixel 1:1. **Fit to panel** fits both dimensions and can enlarge beyond 100%. **Fill width** fills the canvas width while preserving the full viewport height. **Choose zoom** accepts whole percentages from 10 to 400 and stays fixed when you resize the panel.

Every mode preserves CSS viewport dimensions, media queries and text wrapping. At exactly 100%, one preview CSS pixel occupies one physical screen pixel; the displaying window's device pixel ratio is detected automatically. Use the outer canvas scrollbars, or focus the canvas and use arrow keys, when the viewport extends beyond it. The webpage keeps its own scroll position inside the frame.

= What does Scroll to my changes do? =

It compares submitted values and rendered output to locate changed content, structure or attributes without theme-specific mapping. Following reveals enclosing native details disclosures and hidden="until-found" containers through their beforematch contract. Other hidden changes fall back to a visible ancestor; custom widgets are not clicked automatically. Native exclusive groups may close another item. Late initialization, transitions and lazy content are not guaranteed to settle before scrolling. Ambiguous matches retain position rather than guessing. Dynamic output, transformed values and complex headers can limit accuracy.

Turn it off to retain manual positioning and skip comparison snapshots. Turning it on refreshes once to establish a baseline. Known non-content regions, including Xdebug diagnostics, are excluded from comparison without hiding their output. PHP integrations can customize this policy with `aflpp_preview_comparison_excluded_selectors`.

= Which settings are remembered? =

Visibility, size and position, viewport, zoom mode, custom percentage, Tablet and Phone orientations, and Scroll to my changes are stored per user across posts, both editors and the revision browser. Remember open or closed, Remember size and position, and Scroll to my changes are on by default. The initial panel is compact, bottom-right, 480 × 393 px, with Computer at Auto zoom.

Disabling visibility remembering starts the preview open on each new screen load. Disabling layout remembering leaves the current layout untouched but discards saved geometry; later loads use the default size at the preferred docking preset. Docking presets are saved independently. Reset preview window restores the default compact size and bottom-right preset without changing the remembering setting. Fullscreen and Keep on top never reopen automatically.

= Can I use the controls with a keyboard? =

Yes. Arrow keys move the focused move grip or closed launcher and resize through the boundary resize control; hold Shift for larger steps. Opening by keyboard focuses Preview options without trapping focus. Closing returns focus to the launcher. Device buttons use arrow-key navigation, and Escape closes the Zoom popover and restores focus.

= What happens with multiple editor tabs? =

**Use preview here** switches ownership after pending writes finish. Each tab keeps its own fields; values are not copied or merged. Coordination is limited to the same browser. If handover fails, preserve unsaved edits and close the other preview before retrying. Other browsers and devices are not coordinated; this is not collaborative editing.

= Why is the preview blank or not updating? =

Check edit permission, enabled revisions, REST authentication and browser support. Site and browser embedding restrictions still apply; do not weaken them to force embedding. Use WordPress's normal **Preview** button when a preview cannot be embedded.

**Preview updated** means a document loaded, not that its content was verified or published. Login and error pages can also load. PDFs and other browser-native output may have limited scrolling or state restoration.

= Is the preview isolated from the editor? =

No. The preview is not sandboxed. Frontend scripts run with normal browser permissions, and same-origin scripts can access the editor. Only use trusted theme and plugin code.

= What happens when I disable or remove it? =

Deactivation retains preview data and preferences. Uninstalling through WordPress removes internal preview revisions, their metadata and only this plugin's namespace in persisted user preferences. On Multisite, cleanup covers all sites. Saved posts, normal revisions, recovery autosaves and unrelated preferences are preserved. Browser-local preference backups cannot be directly erased by PHP.

== Want to contribute? ==

Report issues or contribute on [GitHub](https://github.com/timohubois/a-floating-live-preview-panel/). Include WordPress and PHP versions, browser, editor, theme, optional integration versions and steps to reproduce. Keep credentials and private site data out of reports.

== Changelog ==

= 1.0.0 =
* Initial release with floating live previews in the Block Editor and classic editor.
* Preview saved revisions without restoring or changing content.
* Add responsive viewport presets, zoom, change following and per-user window preferences.
* Integrate supported ACF fields, Timber post reads and Yoast primary terms and breadcrumbs.

== License ==

GPLv3 or later. Bundled icons are an unchanged subset of [Gutenberg's @wordpress/icons 20.0.0](https://github.com/WordPress/gutenberg/tree/55ab503b80b1561f48414b2eb209c25b793a9e8a/packages/icons) by the WordPress Contributors, licensed GPL-2.0-or-later.
