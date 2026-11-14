# A Floating Live Preview Panel

See your changes in a floating preview while you edit WordPress posts, pages and
supported custom post types, or look through their saved versions.

**Development status:** not a verified release. Local authenticated Gutenberg
flows have been exercised with Flynt and ACF on WordPress 7.1.2 and 7.2-beta5.
This is not a full browser, theme or plugin compatibility guarantee.

## Requirements

- WordPress 6.7+ and PHP 8.3+.
- Permission to edit a frontend-viewable post. Live editing requires the post Block Editor or classic editor and enabled revisions; saved previews use WordPress's native revision browser.
- A same-origin admin and frontend, and a browser with ES modules. Live editing additionally requires working authenticated WordPress REST requests and Web Locks in a secure context.
- The Site Editor and unsaved changes to separate entities such as synced patterns are not supported.

ACF is optional. A general browser, theme or ACF compatibility range has not been
verified. Composer and Node.js are not required to run the plugin.

## Installation

Use a disposable local or staging WordPress installation while this is in development.

1. Install the attached GitHub release ZIP or WordPress.org package in `wp-content/plugins/a-floating-live-preview-panel/` and activate **A Floating Live Preview Panel**. For a Git checkout or GitHub's automatic **Source code** ZIP, run `npm ci && npm run build` in the plugin directory first; generated assets are not included in source archives.
2. Open a post, page or frontend-viewable custom post type in its Block Editor or classic editing screen. New posts need a native draft save first; the Block Editor panel becomes available without reloading. The plugin does not force saves or enable revisions for you.
3. Use the compact preview window or **Live preview** launcher. Edit supported fields and the preview refreshes after a short pause.
4. Use WordPress's normal save, update or publish controls to save your changes to the post.

## Usage

Move the window by its plain titlebar or drag the closed **Live preview** launcher;
they share a preferred corner. Each fits independently within the current viewport,
so the launcher can reach the top and sides without reserving space for its hidden
panel. Docked side and bottom spacing follows the editor's responsive outer gutter.
Resize from usable borders and corners; docked edges that cannot move keep their
anchor. The small move grip, launcher and single keyboard resize control at the
boundary support arrow keys, with Shift for larger steps.
Closing the window stops live updates without discarding editor fields and focuses
the launcher. Keyboard opening moves focus to **Preview actions**, without trapping
focus; pointer opening does not automatically focus a panel action.
WordPress's native **Preview** button keeps the panel and its last frame visible,
waits for outstanding live writes, and normally resumes live updates afterward.
It retains WordPress's normal behavior, including saving changes to your own drafts.
**Save**, **Update** and **Publish** also keep an open panel and its last frame visible
while live writes drain and WordPress validates and submits the form. Live updates
pause during this action and resume if browser, WordPress or ACF validation rejects
it. Classic saves use WordPress's normal editor reload. Block Editor saves and
autosaves keep the editor open, wait for any legacy meta-box saves, then resume
previewing against the acknowledged saved state. An explicitly closed panel stays
closed. If the saved state cannot be confirmed, preserve your edits and reload;
the panel never guesses a new baseline or prevents WordPress from saving.

- **Preview actions** uses native WordPress controls, with **View** for display actions and **Settings** for remembering and scrolling options. **Position** saves a preferred bottom-left, bottom-center or bottom-right preset, even when layout remembering is off. Dragging freely clears the active dock selection without erasing the preferred preset. Resizing keeps the selected dock. **Size → Small / Large** offers click/tap and keyboard alternatives to border resizing. **Reset size and position** restores Small, compact, bottom-right and saves that preset without changing whether layouts are remembered. **Open preview in a new tab**, **Fill the screen** and **Picture-in-picture** appear where available.
- **Picture-in-picture** appears only in browsers that support Document Picture-in-Picture, not just video PiP. Its tooltip explains: “Open the preview in a window that stays on top.” Its icon-only shortcut sits inside the preview's bottom-right corner, fading in only when the pointer is near the button, or appearing immediately on keyboard focus. It stays visible on devices without hover, and reduced-motion settings disable the fade. The pop-out uses the browser's native **Back to tab** and close controls to return inline. **Update preview** stays visible in the pop-out header, including its loading indicator. Its **⋮** menu contains **Close live preview**, which stops the preview instead of merely closing the pop-out. A normal WordPress page reload closes PiP; use the same **Picture-in-picture** action to open it again. There is no PiP persistence or reload-specific behavior.
- **Desktop**, **Tablet** and **Mobile** use a native WordPress toolbar with pressed states and arrow-key navigation. They change the preview's viewport width, not its device or user agent.
- Loading and no-frame recovery use a centered native Placeholder. Problems with a retained frame appear in a native Notice below the header, without covering the preview. Unresolved problems remain visible; incidental window-operation notices can be dismissed.
- **Remember if the preview is open** is on by default. Turning it off starts the preview open on each new screen load without changing its layout. Visibility, viewport, **Scroll to changes** and layout preferences are independent and stored per user across posts, both editors and the revision browser. Preferences remain after deactivation; uninstalling through WordPress removes the plugin's server-stored preferences.
- **Remember size and position** is on by default. It restores compact dimensions, custom placement or responsive docking, the shared panel/launcher anchor and expanded/compact mode. The initial layout is Small, compact, bottom-right. Turning remembering off leaves the current layout untouched and discards its saved geometry; subsequent screen loads start Small and compact at the preferred **Position** preset. Moving, resizing or expanding then lasts only for the current page; closing and reopening without reloading keeps that layout. Re-enabling saves the current layout rather than reviving an older one. Restored layouts fit inside the current window without overwriting preferred bounds; fullscreen and PiP are never reopened automatically.
- **Scroll to changes** is on by default. It follows detected content, structure and layout-attribute changes without theme-specific integration. Content changes take priority over incidental runtime presentation changes; presentation-only edits remain detectable. It normally centers shorter changed content and shows taller content from its beginning. Detection and header handling are best-effort; disable it to retain manual positioning.

### Revision browser

Open WordPress's native revision browser (`wp-admin/revision.php`) and use the
**Revision preview** panel or launcher. The same window controls, viewport widths
and per-user preferences apply here. The panel follows the selected right-hand
**To** revision when using the slider or Previous/Next buttons. Comparing two
revisions still shows one frontend preview: the To version, not a visual diff.
The caption identifies the displayed revision by date and author; it retains the
previous identity until a replacement loads.

Browsing previews does not restore revisions, update saved content, create internal
preview revisions or replace recovery autosaves. WordPress's comparison and Restore
controls remain unchanged. Revision previews do not acquire the editor's live-write
lock, so they can run alongside an editor preview.

Historical title, content, excerpt, revision-enabled post metadata and stored ACF
values come from the selected source. The current-post entry uses saved parent data,
not the latest autosave. Themes, styles, global settings, related content and
unrevisioned metadata remain current: this is old content rendered by today's site,
not a historical site snapshot. Fields absent from a revision cannot be reconstructed.
If a source is deleted, permission changes or its URL expires, reload the revision
browser. Embedding and theme-specific output limitations below also apply.

## Data and limitations

Live updates write a separate internal preview revision per user and post, not the
saved parent post or WordPress's recovery autosave, and do not publish changes.
Preview revisions stay out of the normal revision history and do not trigger the
newer-autosave notice. They are reused on refresh and deleted when the parent post
is updated or permanently deleted. Existing recovery autosaves are left untouched.

Both editors preview title, content, excerpt and supported post-local ACF fields.
The Block Editor supplies serialized blocks in either visual or code mode and also
previews featured-image selection, replacement and removal. ACF meta-box values use
the same field-save integration as classic editing; ACF blocks keep their native
content-save hooks, including blocks configured to store values in post metadata.
Arbitrary non-ACF metadata, taxonomies, template selections and unsaved separate
entities are not live inputs. Native ACF/legacy meta-box saving remains intact;
saved values become the new baseline.
When the editor switches to an unsupported entity, the panel visibly pauses without
a loading spinner and retains its last frame. Returning to the original post resumes
live updates.
WordPress's normal server autosave continues independently, including its usual
updates to your own drafts. Native REST saves carry request-specific fingerprint
receipts. A rejected REST save permits continued previewing only when a matching
receipt confirms that the saved fingerprint stayed unchanged: even a 4xx can follow
a partial post update. Failed saves never advance the baseline. Classic Preview
and block-editor legacy meta-box saves use a short-lived
acknowledgement cookie containing fingerprints, not editor content; it is cleared
on completion and expires after one minute.

- **Block Editor ACF fields:** native form serialization preserves ACF's field keys, empty values, signed field lists and paginated row changes. The optional ACF PRO datastore is respected when already enabled; the plugin never enables it or changes Gutenberg's edited metadata to prepare a preview. After a native meta-box save, previewing pauses with its last frame until ACF replaces its paginated rows. If ACF's reload fails, the panel remains paused and asks you to reload; it never resets row markers or guesses that a delay was sufficient. Live preview storage is not recovery storage: legacy meta boxes are not sent by Gutenberg's native autosave, and ACF datastore recovery behavior remains ACF's responsibility.
- **Classic live ACF fields:** support depends on compatible field and revision APIs; not every field type has been verified. Paginated repeaters use ACF's native row merging to preserve unloaded saved rows and edits retained across pages. If native Preview saves draft repeater additions, deletions or reordering, the panel retains its last frame but requires an editor reload: ACF's remaining row changes still refer to the old saved order. Copy any later edits before reloading, and reload before saving again.
- **Frontend output:** your theme and plugins determine the result, including redirects and browser-native output such as PDFs. Scroll restoration and change-following only apply to recognized HTML previews. Changes made only through stylesheets or frontend state may be missed; dynamic output at load can introduce unrelated differences. PDF page, zoom and scroll state may reset on refresh.
- **Isolated editors:** authorized HTML previews opt into an isolated Block Editor's `Document-Isolation-Policy` when the frontend is not already isolated, preserving document access for scrolling without disabling core's client-side media processing. Existing frontend isolation policies are retained. Cross-origin subresources follow the resulting policy. Non-isolated screens do not request it.
- **Trusted code only:** the preview is not sandboxed. Same-origin frontend scripts can access the editor. Use trusted theme and plugin code.
- **Embedding:** site and browser restrictions still apply. Do not weaken them to force embedding; use **Open preview in a new tab** when needed. **Preview updated** reports a document load, not verified content or publication.
- **Multiple tabs:** **Use preview here** switches preview ownership between editor tabs after pending writes finish. Fields are not copied or merged. Coordination is limited to the same browser, not other browsers or devices; this is not a collaborative editing tool.

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

All authored JavaScript and panel CSS live in `src/`. WordPress's standard tooling builds four entries: `src/classic-editor.js`, `src/block-editor.js`, `src/revisions.js` and `src/preview-navigation.js`. The admin entries import public APIs from `@wordpress/components`, `@wordpress/element`, `@wordpress/data`, `@wordpress/preferences`, `@wordpress/api-fetch` and `@wordpress/hooks`; selected official icons live in `src/panel/icons.js`. WordPress supplies the installed runtime instead of bundling another copy of React or its components:

```sh
npm ci
npm run build
```

Rebuild after changing anything in `src/`; `npm start` watches those inputs during development. All plugin browser code is bundled, including editor/revision coordination, scrolling and the ACF adapter. ACF is initialized only when available. There are no runtime imports from `src/` or PHP-configured module URLs.

`build/` contains only generated assets and is ignored by Git. Build it locally before using a checkout or running the JavaScript tests, and rebuild after pulling source changes. Never edit generated files by hand. The complete directory, including CSS and generated `.asset.php` dependency/version metadata, must still ship in installable packages. The admin bundles intentionally contain the same shared panel source; they load on different screens and need no separate shared runtime. Distribution excludes `src/` and development dependencies; `.distignore` deliberately does not exclude `build/`.

Native component CSS is still enqueued separately and copied into PiP, including WordPress's combined admin stylesheets and runtime-generated component styles. CSSOM-only rules are copied as CSS text so native spinners retain their strokes and animation. Package imports do not replace this stylesheet handling.

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

The PHP integration check requires PHP's DOM extension and a disposable single-site
WordPress installation with this plugin active; it refuses multisite before creating
fixtures. It checks the rendered panel's accessibility, creates and removes its own
users, posts and revisions, verifies source permissions, custom
post statuses and nonce separation, and checks that preview reads leave saved posts,
recovery autosaves and metadata unchanged. With ACF active, it also checks historical
fields and rejects attempted ACF updates/deletions of the saved source without
blocking live-editor or unrelated writes:

```sh
wp eval-file /path/to/a-floating-live-preview-panel/tests/revisions.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/block-editor.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/preview-isolation.php
```

The block-editor fixture checks native REST save receipts, source conflicts,
authorization, first-save eligibility, draft/published autosaves, unchanged validation
rejections, metadata errors after partial post updates, and isolated serialized-block
previews. Client adapter tests cover pre-save draining, request correlation, legacy
meta-box acknowledgement and failure handling, including malformed fingerprints and
read-only errors in strict mode. The HTTP-free preview-isolation fixture checks that
existing site policies are preserved with both core APIs and the older-core fallback.
Frame/scroll tests cover isolation opt-in, incidental presentation changes, content
edits and presentation-only edits. These do not replace authenticated browser testing
of native editor controls.

The optional ACF fixture checks shared live-field saves, paginated repeater merging,
native post-meta block saving/rendering and source isolation. It exits successfully with a skip message when ACF Pro with
repeater support is absent:

```sh
wp eval-file /path/to/a-floating-live-preview-panel/tests/acf.php
```

### GitHub Actions and releases

The workflows use the same 10up WordPress.org deployment and GitHub release actions
as the other plugins, with an explicit asset build before packaging:

- **Commit Checks** runs on branch pushes and pull requests and is reused for release
  tags. It uses Node.js 24 and PHP 8.3, builds the assets, runs PHP lint and JavaScript
  tests (using the runner's Chrome), and runs the PHP fixtures in a disposable
  single-site WordPress installation. A separate job checks the built distribution
  with WordPress Plugin Check. Optional ACF and Timber coverage still requires the
  corresponding dependencies on a test site.
- **Deploy and Release Plugin** runs on numeric tags such as `1.0.0`, without a `v`
  prefix. The tag, plugin header version and `readme.txt` stable tag must match;
  development placeholders must be updated before releasing. It waits for the
  checks, builds again in the deploy job, deploys via
  `10up/action-wordpress-plugin-deploy`, and attaches that action's ZIP to the GitHub
  release. Jobs do not share local generated files. Packaging uses `.distignore`,
  so the ignored local `build/` directory is included, while development files are
  excluded. The archive is checked for matching versions and built assets.
- **Publish listing assets and readme** is a manual workflow restricted to `main`;
  it updates the WordPress.org listing without a plugin release.

Configure the repository secrets `SVN_USERNAME` and `SVN_PASSWORD` before publishing
and ensure the WordPress.org slug is available to that account. GitHub's normal
workflow token is used for GitHub releases. Install the attached release ZIP or the
WordPress.org package, not GitHub's automatic source ZIP. These workflows do not
replace authenticated editor-to-frontend browser testing or verify the general
compatibility claims above.

### Structure and ownership

- `a-floating-live-preview-panel.php` explicitly loads the PHP classes; `classes/Plugin.php` connects the owners. No Composer autoloader is required at runtime.
- `classes/Admin/ClassicEditor.php`, `BlockEditor.php` and `RevisionBrowser.php` connect their respective native screens. `Admin/Panel.php` owns shared assets, labels and the PHP view in `views/panel.php`.
- `classes/Preview/LivePreview.php` owns internal preview revision writes, fingerprints, native-save coordination and cleanup. `Preview/FrontendPreview.php` authorizes reads and overlays only the selected source on frontend output. Live-source ownership and token verification stay together in `LivePreview`.
- `classes/Compatibility/Acf.php` owns the optional ACF save/read contracts; `src/compatibility/acf.js` bridges its browser events; `block-editor-acf.js` captures native meta-box forms and observes ACF's own post-save row replacement. Small Timber read handling stays beside frontend content reads rather than becoming another integration class.
- `src/preview/live-preview.js` shares live writes, frames and Web Locks between editor adapters. `classic-editor/live-preview.js` captures classic/ACF fields; `classic-editor/native-editor.js` observes native Preview, heartbeat and validation. `block-editor/editor.js` reads public editor selectors and coordinates native saves through the awaited pre-save hook and narrowly scoped API-fetch middleware.
- `src/revisions/preview.js` owns read-only revision selection. It never acquires editor locks or writes previews. It follows core's `wp.revisions.view.frame.model`; guard and verify that integration when changing supported WordPress versions.
- `src/panel/window.js` owns window presentation, focus, preferences, fullscreen and PiP. `panel/geometry.js` owns preferred bounds, docking, resizing and temporary viewport fitting; pointer/keyboard event binding stays with the window. `controls.js` renders public WordPress components and `viewport.js` sizes the preview viewport.
- `src/preview/frame.js` owns iframe replacement and cancellation; `scroll.js` enhances only recognized preview HTML. These are shared by the separate editor and revision lifecycles.

Keep PHP class names and filenames in PascalCase and browser filenames in kebab-case. Group source by responsibility, not separate generic JavaScript/CSS buckets. Preserve runtime identifiers such as preference keys, REST paths and the `aflpp-` CSS namespace when reorganizing internals. Extract concrete shared behavior, not generic controller or module frameworks.

Verify both screen-to-preview workflows on a disposable WordPress site with the
theme and optional ACF fields you intend to use.

## License

GPLv3 or later. See [LICENSE](LICENSE).

Bundled icons are an unchanged subset of
[`@wordpress/icons` 20.0.0](https://github.com/WordPress/gutenberg/tree/55ab503b80b1561f48414b2eb209c25b793a9e8a/packages/icons)
by the WordPress Contributors, licensed GPL-2.0-or-later.
