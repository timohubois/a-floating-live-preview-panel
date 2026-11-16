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

Save new posts as drafts before opening the preview. Live updates require revisions to be enabled. The panel works in the post editor, not the Site Editor. Changes to shared content, such as synced patterns, are not previewed until saved.

== Installation ==

1. Upload the built plugin folder to /wp-content/plugins/a-floating-live-preview-panel/ and activate **A Floating Live Preview Panel** under **Plugins**. A Git checkout or automatic source ZIP requires an asset build first; see the [repository README](https://github.com/timohubois/a-floating-live-preview-panel/#installation). Composer and Node.js are not required to run a built package.
2. Open a post, page or supported custom post type in its Block Editor or classic editor. Save new posts as drafts first; the Block Editor panel becomes available without reloading.
3. Open **Live preview**, edit a supported field and the preview refreshes after a short pause.
4. Move the panel by its titlebar and resize it from its borders or corners. Use **Preview options** for docking, reset and other settings.
5. Save your work using WordPress's normal save, update or publish controls.

The plugin does not force saves or enable revisions. WordPress's normal **Preview** button remains available.

== Frequently Asked Questions ==

= Which changes can I preview? =

Both editors support live previews of the title, content, excerpt and supported ACF fields. The Block Editor also previews changes to the author, publication date, categories, tags and featured image. Changing the date in the preview does not schedule or publish the post.

Template selections, other custom fields and unsaved changes to shared content such as synced patterns are not included. Related-post lists and archive queries still use saved content.

= Do I need ACF, Timber, Yoast SEO or Flynt? =

No. The plugin works with WordPress on its own.

If you use ACF, supported fields can update live, including paginated repeaters. Timber support lets standard post and term reads use preview values; custom theme queries may still show saved values. Yoast SEO support previews primary-term changes and breadcrumbs where your theme displays them, not SEO titles, meta descriptions or analysis scores.

Flynt is not required and has no separate integration.

= Can I preview older revisions? =

Yes. Open WordPress's revision history and choose **Revision preview**. The panel displays the revision selected on the right-hand **To** side. Browsing does not restore a revision or change your saved post.

The preview uses historical content and stored fields with your current theme and settings. Dates, categories, tags and fields that were not saved with the revision remain current. It is a content preview, not a snapshot of the whole site.

= Does the preview save my work? =

No. Use WordPress's normal **Save**, **Update** or **Publish** controls.

Live updates use a separate internal preview revision without changing the saved post or replacing WordPress's recovery autosave. WordPress's normal autosaves continue independently. Closing the panel does not discard your edits, but the preview is not a backup or recovery tool.

= What happens when I save or use WordPress's Preview button? =

The panel pauses live updates while WordPress saves or opens its normal preview, then resumes. Classic editor saves reload the page as usual. WordPress's normal **Preview** button remains available.

If the panel cannot confirm a save or reload ACF fields, copy any unsaved edits before reloading the editor. In the classic editor, also reload after using native Preview if it saved additions, removals or reordering in a paginated ACF repeater; copy any later edits first.

= How do the device buttons and zoom work? =

Computer uses a 1280 × 800 viewport, Tablet 768 × 1024 and Phone 390 × 844. Click the selected Tablet or Phone button again to rotate it. These presets change the page width and height; they do not emulate a device or touch input.

**Auto** fits the page within the panel without enlarging it beyond screen-pixel 1:1. **Fit to panel** can enlarge it, and **Fill width** fits its width. **Choose zoom** sets a fixed percentage from 10 to 400.

Zoom scales the preview without changing its layout width or responsive breakpoints. At 100%, one page CSS pixel occupies one physical screen pixel. Use the outer scrollbars when the preview is larger than the panel.

= What does Scroll to my changes do? =

It follows changes in the preview so you do not have to keep finding the text you are editing. Turn it off to keep your scroll position.

The panel can reveal changes inside native Details blocks and content hidden until found. It does not operate custom tabs, sliders or other interactive widgets. If it cannot locate a change confidently, it keeps the current position or scrolls to a surrounding section. Turning following back on refreshes the preview to establish a new starting point.

= Which settings are remembered? =

The panel remembers your open/closed state, size, position, docking preference, viewport, zoom, device orientation and Scroll to my changes setting across posts and editors.

Use **Preview options** to turn remembering on or off or reset the window. Reset restores the default size and bottom-right position. Fullscreen and **Keep on top** do not reopen automatically.

= Can I use the panel with a keyboard? =

Yes. Focus the move grip or closed launcher and use the arrow keys to move it. Use the resize control with arrow keys to resize it. Hold Shift for larger steps.

Device buttons support arrow-key navigation. Escape closes the Zoom popover, and closing the panel returns focus to its launcher.

= What happens if I edit the same post in multiple tabs? =

Choose **Use preview here** to move live preview to that tab. Each tab keeps its own edits; changes are not copied or merged.

This coordination works only within the same browser, not across browsers or devices. If switching fails, copy any unsaved edits and close the other preview before trying again.

= Why is the preview unavailable, blank or not updating? =

Save the post first and make sure you can edit it, its post type has a frontend preview, and revisions are enabled.

Live updates need an HTTPS connection (or a trusted local development address), a browser with ES module and Web Locks support, and access to WordPress's REST API while signed in. The editor and frontend must use the same origin: the same protocol, domain and port.

Site security settings may prevent the page from being embedded. Do not weaken them to enable the panel; use WordPress's normal **Preview** button instead.

A **Preview updated** message means a page loaded, not that its contents were checked. If it shows a login or error page, resolve that first.

= Is the preview sandboxed? =

No. Theme and plugin scripts run normally in the preview and can access the editor because both share the same origin. Only use trusted theme and plugin code.

= What happens when I deactivate or delete the plugin? =

Deactivation keeps preview data and preferences. Deleting the plugin through WordPress removes its internal preview revisions and server-stored preferences, including across a Multisite network.

Your posts, normal revisions and recovery autosaves are preserved. Browser-local preference backups may remain.

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
