# A Floating Live Preview Panel

A floating live frontend preview while editing WordPress posts, pages and eligible
custom post types in the classic editor.

**Development status:** not a verified release. The full authenticated
editor-to-frontend workflow still needs integration testing.

## Requirements

- WordPress 6.7+ and PHP 8.3+.
- Classic post-editing screens, revisions enabled for the edited post, and permission to edit it. The Block Editor and Site Editor are not supported.
- A same-origin admin and frontend, with working authenticated WordPress REST requests.
- A browser in a secure context, with ES modules and Web Locks support.

ACF is optional. A general browser, theme or ACF compatibility range has not been
verified. Composer and Node.js are not required to run the plugin.

## Installation

Use a disposable local or staging WordPress installation while this is in development.

1. Place the plugin in `wp-content/plugins/a-floating-live-preview-panel/` and activate **A Floating Live Preview Panel**.
2. Open a saved post, page or frontend-viewable custom post type in its classic editing screen. Save a new post as a draft first; the plugin does not enable revisions for you.
3. Use the compact preview window or **Live preview** launcher. Edit supported fields and the preview refreshes after a short pause.
4. Use WordPress's normal save, update or publish controls to save your changes to the post.

## Usage

Move the window by its title or drag the closed **Live preview** launcher; they share
one position. Resize using the visible grip at the free top corner. The title,
launcher and resize grip support arrow keys, with Shift for larger steps.
Closing the window stops live updates without discarding editor fields and focuses
the launcher; opening it moves focus to **Preview actions**, without trapping focus.
WordPress's native **Preview** button keeps the panel and its last frame visible,
waits for outstanding live writes, and normally resumes live updates afterward.
It retains WordPress's normal behavior, including saving changes to your own drafts.
**Save**, **Update** and **Publish** also keep an open panel and its last frame visible
while live writes drain and WordPress validates and submits the form. Live updates
pause during this action and resume if browser, WordPress or ACF validation rejects
it. A successful save uses WordPress's normal editor reload and restores remembered
panel preferences; an explicitly closed panel stays closed.

- **Preview actions** uses native WordPress controls. **Position** remembers bottom-left, bottom-center or bottom-right docking; dragging freely clears the dock selection. Resizing keeps the selected dock. **Size → Small / Large** offers click/tap and keyboard alternatives to dragging the resize grip. **Reset size and position** restores the default compact, bottom-right panel. **Open preview in new tab**, fullscreen and pop-out **PiP** (Picture-in-Picture) appear where available.
- **Pop out preview (PiP)** appears only in browsers that support Document Picture-in-Picture, not just video PiP. Its icon-only shortcut sits inside the preview's bottom-right corner, fading in only when the pointer is near the button, or appearing immediately on keyboard focus. It stays visible on devices without hover, and reduced-motion settings disable the fade. The pop-out uses the browser's native **Back to tab** and close controls to return inline. Its **⋮** menu contains **Refresh preview** and **Close live preview**; the latter stops the preview instead of merely closing the pop-out. A normal WordPress page reload closes PiP; use the same **Pop out preview (PiP)** action to open it again. There is no PiP persistence or reload-specific behavior.
- **Desktop**, **Tablet** and **Mobile** use a native WordPress toolbar with pressed states and arrow-key navigation. They change the preview's viewport width, not its device or user agent.
- **Remember preview visibility** is on by default. Visibility, viewport and **Scroll to changes** preferences are per user across posts. Compact size and position, docking and expanded/compact mode are also remembered. Restored layouts fit inside the current window; fullscreen and PiP are never reopened automatically. Preferences remain after deactivation; uninstalling through WordPress removes the plugin's server-stored preferences.
- **Scroll to changes** is on by default. It follows detected content, structure and layout-attribute changes without theme-specific integration. It normally centers shorter changed content and shows taller content from its beginning. Detection and header handling are best-effort; disable it to retain manual positioning.

## Data and limitations

Live updates write a separate internal preview revision per user and post, not the
saved parent post or WordPress's recovery autosave, and do not publish changes.
Preview revisions stay out of the normal revision history and do not trigger the
newer-autosave notice. They are reused on refresh and deleted when the parent post
is updated or permanently deleted. Existing recovery autosaves are left untouched.

Live inputs are title, content, excerpt and supported post-local ACF fields. Other
metadata, related content and global settings are not live inputs. WordPress's
normal server autosave continues independently, including its usual updates to
your own drafts. Native Preview completion is acknowledged by a request-specific
cookie containing state fingerprints, not editor content. It is cleared on completion
and expires after one minute.

- **ACF:** support depends on compatible field and revision APIs; not every field type has been verified. Paginated repeaters use ACF's native row merging to preserve unloaded saved rows and edits retained across pages. If native Preview saves draft repeater additions, deletions or reordering, the panel retains its last frame but requires an editor reload: ACF's remaining row changes still refer to the old saved order. Copy any later edits before reloading, and reload before saving again.
- **Frontend output:** your theme and plugins determine the result, including redirects and browser-native output such as PDFs. Scroll restoration and change-following only apply to recognized HTML previews. Changes made only through stylesheets or frontend state may be missed; dynamic output at load can introduce unrelated differences. PDF page, zoom and scroll state may reset on refresh.
- **Trusted code only:** the preview is not sandboxed. Same-origin frontend scripts can access the editor. Use trusted theme and plugin code.
- **Embedding:** site and browser restrictions still apply. Do not weaken them to force embedding; use **Open preview in new tab** when needed. **Preview refreshed** reports a document load, not verified content or publication.
- **Multiple tabs:** **Preview here** switches preview ownership between editor tabs after pending writes finish. Fields are not copied or merged. Coordination is limited to the same browser, not other browsers or devices; this is not a collaborative editing tool.

## Uninstall

Deactivation keeps preview data and preferences. Uninstalling through WordPress
removes the plugin's internal preview revisions and their metadata, plus only its
namespace in persisted user preferences. On multisite, cleanup covers all sites.
Saved posts, normal revisions, recovery autosaves and unrelated preferences are
preserved. WordPress's browser-local preference backups cannot be directly erased
by the PHP uninstaller; cleaned server preferences receive a fresh timestamp.

## Development

Use PHP 8.3+ and Composer for the development checks:

```sh
composer install
composer check-platform-reqs
composer php:lint
```

The editor entry (`assets/editor-bootstrap.js`) and existing panel modules (`assets/preview-panel/*.js`) are built with WordPress's standard tooling. They import public APIs from `@wordpress/components`, `@wordpress/element`, `@wordpress/data` and `@wordpress/preferences`; selected official icons are imported in `src/icons.js`. WordPress supplies the installed runtime instead of bundling another copy of React or its components:

```sh
npm ci
npm run build
```

Rebuild after changing the editor entry, panel JavaScript or icon imports. Ship `assets/build/editor-bootstrap.js` and its generated `.asset.php` dependency/version metadata with the plugin; do not edit them by hand. Preview coordination (`assets/editor-preview.js`), preview scrolling and the optional ACF adapter remain separately loaded native modules. Docking, geometry and cross-document PiP integration remain custom.

Native component CSS is still enqueued separately and copied into PiP, including WordPress's combined admin stylesheets. Package imports do not replace this stylesheet handling.

The public panel APIs and built asset loading are checked against WordPress 6.7 and 7.1.4 core assets, including in-page, fullscreen and native PiP controls. This is not a full authenticated editor-to-frontend compatibility guarantee.

Node.js is needed only for development, not on the WordPress site. After installing the development dependencies, run the JavaScript regression tests with:

```sh
node --test tests/*.mjs
```

The browser-based tests also require Chromium (`CHROMIUM_BIN` can override its
path). To exercise the event tests with real WordPress jQuery and Quicktags code,
point `WORDPRESS_ROOT` at a local WordPress core directory:

```sh
WORDPRESS_ROOT=/path/to/wordpress node --test tests/editor-events.mjs
```

Verify the editor-to-preview workflow on a disposable WordPress site with the theme
and optional ACF fields you intend to use.

## License

GPLv3 or later. See [LICENSE](LICENSE).

Bundled icons are an unchanged subset of
[`@wordpress/icons` 20.0.0](https://github.com/WordPress/gutenberg/tree/55ab503b80b1561f48414b2eb209c25b793a9e8a/packages/icons)
by the WordPress Contributors, licensed GPL-2.0-or-later.
