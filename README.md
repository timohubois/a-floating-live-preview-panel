# A Floating Live Preview Panel

A floating live frontend preview while editing WordPress posts, pages and eligible
custom post types in the classic editor.

**Development status:** not a verified release. The full authenticated
editor-to-frontend workflow still needs integration testing.

## Requirements

- PHP 8.3+.
- Classic post-editing screens, revisions enabled for the edited post, and permission to edit it. The Block Editor and Site Editor are not supported.
- A same-origin admin and frontend, with working authenticated WordPress REST requests.
- A browser in a secure context, with ES modules and Web Locks support.

ACF is optional. A minimum WordPress version and a general browser, theme or ACF
compatibility range have not been verified. Composer and Node.js are not required
to run the plugin.

## Installation

Use a disposable local or staging WordPress installation while this is in development.

1. Place the plugin in `wp-content/plugins/a-floating-live-preview-panel/` and activate **A Floating Live Preview Panel**.
2. Open a saved post, page or frontend-viewable custom post type in its classic editing screen. Save a new post as a draft first; the plugin does not enable revisions for you.
3. Use the compact preview window or **Live preview** launcher. Edit supported fields and the preview refreshes after a short pause.
4. Use WordPress's normal save, update or publish controls to save your changes to the post.

## Usage

Move the window by its title and resize from its edges or corners. The title and
resize handles also support keyboard focus and arrow keys, with Shift for larger steps.
Closing the window stops live updates without discarding editor fields.

- **Preview actions** offers docking, reset size and position, and **Open preview in new tab**. Fullscreen and pop-out Picture-in-Picture appear where supported.
- **Desktop**, **Tablet** and **Mobile** change the preview's viewport width, not its device or user agent.
- **Remember preview visibility** is on by default. Visibility, viewport and **Scroll to changes** preferences are per user across posts; window size and position reset on a new editor load. Preferences remain after deactivation; uninstalling through WordPress removes the plugin's server-stored preferences.
- **Scroll to changes** is on by default. It normally centers shorter changed content and shows taller content from its beginning. Detection and header handling are best-effort; disable it to retain manual positioning.

## Data and limitations

Live updates write a separate internal preview revision per user and post, not the
saved parent post or WordPress's recovery autosave, and do not publish changes.
Preview revisions stay out of the normal revision history and do not trigger the
newer-autosave notice. They are reused on refresh and deleted when the parent post
is updated or permanently deleted. Existing recovery autosaves are left untouched.

Live inputs are title, content, excerpt and supported post-local ACF fields. Other
metadata, related content and global settings are not live inputs. WordPress's
normal server autosave continues independently, including its usual updates to
your own drafts.

- **ACF:** support depends on compatible field and revision APIs; not every field type has been verified. Paginated repeaters use ACF's native row merging to preserve unloaded saved rows and edits retained across pages.
- **Frontend output:** your theme and plugins determine the result, including redirects and browser-native output such as PDFs. Scroll restoration and change-following only apply to recognized HTML previews. Styling-only changes may be missed; dynamic output can introduce unrelated differences. PDF page, zoom and scroll state may reset on refresh.
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

There is no JavaScript build step. Optional scroll-detection regression tests use
Node.js and Chromium (`CHROMIUM_BIN` can override the browser executable):

```sh
node --test tests/preview-scroll.mjs
```

Verify the editor-to-preview workflow on a disposable WordPress site with the theme
and optional ACF fields you intend to use.

## License

GPLv3 or later. See [LICENSE](LICENSE).

Bundled icons are an unchanged subset of
[`@wordpress/icons` 20.0.0](https://github.com/WordPress/gutenberg/tree/55ab503b80b1561f48414b2eb209c25b793a9e8a/packages/icons)
by the WordPress Contributors, licensed GPL-2.0-or-later.
