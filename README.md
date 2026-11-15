# A Floating Live Preview Panel

See your changes in a floating preview while you edit WordPress posts, pages and
supported custom post types, or look through their saved versions.

**Development status:** not a verified release. An installed ZIP has passed
core-only browser smoke tests on WordPress 6.7 and 7.1.4 with PHP 8.3 and the default
Twenty Twenty-Five theme. Stable-WordPress ACF PRO 6.8.11 checks also passed with
its datastore disabled and enabled. Earlier Flynt/ACF checks used WordPress 7.1.2
and 7.2-beta5; administrator classic integration was rechecked with Ask the Origin
1.1.2. These are focused checks, not a full compatibility guarantee.

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
the launcher. Keyboard opening moves focus to **Preview options**, without trapping
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

- **Preview options** uses native WordPress controls, with **Preview window** for display actions and **Settings** for remembering and scrolling options. **Move preview to** saves a preferred bottom-left, bottom-center or bottom-right preset, even when layout remembering is off. Dragging freely clears the active dock selection without erasing the preferred preset. Resizing keeps the selected dock. **Reset preview window** restores the default 480 × 340 px panel, compact, bottom-right and saves that preset without changing whether layouts are remembered. **Use full screen** and **Keep on top** appear where available. The remembering, scrolling and reset actions include short, visible explanations. There is no separate new-tab action; WordPress’s normal Preview button is unchanged.
- **Keep on top** appears only in browsers that support Document Picture-in-Picture, not just video PiP. Its tooltip explains: “Open the preview in a window that stays on top.” Its icon-only shortcut sits inside the preview's bottom-right corner, fading in only when the pointer is near the button, or appearing immediately on keyboard focus. It stays visible on devices without hover, and reduced-motion settings disable the fade. The pop-out uses the browser's native **Back to tab** and close controls to return inline. **Update preview** stays visible in the pop-out header, including its loading indicator. Its **⋮** menu contains **Close live preview**, which stops the preview instead of merely closing the pop-out. A normal WordPress page reload closes PiP; use the same **Keep on top** action to open it again. There is no PiP persistence or reload-specific behavior.
- **Computer**, **Tablet** and **Phone** use a native WordPress toolbar with pressed states and arrow-key navigation. Their representative viewports are 1280 × 800, 768 × 1024 and 390 × 844 CSS pixels. Clicking a different device selects it; clicking the already selected Tablet or Phone button rotates it between portrait and landscape. Computer stays in landscape. The selected Tablet or Phone icon turns with the orientation and its tooltip names the next action. Tablet and Phone each remember their own orientation; there is no separate rotate button. Switching devices or rotating never resizes the panel. This sizes the viewport, not the device, user agent or touch capabilities.
- **How the screen fits** offers **Automatic** (the default), **Fit to window** and **Fit to width** in a native WordPress select. All three keep the selected CSS-pixel width and height fixed: resizing the panel changes only visual zoom, not media queries, text wrapping, `vh` units or viewport proportions. Automatic compensates for the current window’s `devicePixelRatio`: 100% maps each viewport CSS pixel to one physical screen pixel, using a CSS transform of `1 / devicePixelRatio`. It uses that size when the whole viewport fits and otherwise scales it down. Fit to window fits the complete viewport and can enlarge beyond 100%. Fit to width fills the available canvas width, also allowing enlargement; it never shortens or stretches the iframe height. If the viewport extends below the panel, use the outer canvas scrollbar or Tab to the canvas and use the arrow keys to inspect it. The webpage scrolls separately inside its own viewport. Empty canvas around the preview is expected. The readout shows the selected CSS-pixel width × height and zoom relative to physical screen pixels, consistently across all three fitting modes. Monitor changes, browser zoom and PiP adoption update the DPR reference automatically. This is screen-pixel 1:1 sizing, not calibrated handset dimensions in centimetres or device-DPR emulation. These controls work in the floating panel, expanded view, fullscreen and PiP; narrow footers wrap rather than clip. The earlier capped whole-screen preference is restored as Automatic.
- Loading and no-frame recovery use a centered native Placeholder. Problems with a retained frame appear in a native Notice below the header, without covering the preview. Unresolved problems remain visible; incidental window-operation notices can be dismissed.
- **Remember open or closed** is on by default. Turning it off starts the preview open on each new screen load without changing its layout. Visibility, viewport, fitting, tablet and phone orientations, **Scroll to my changes** and layout preferences are independent and stored per user across posts, both editors and the revision browser. Preferences remain after deactivation; uninstalling through WordPress removes the plugin's server-stored preferences.
- **Remember size and position** is on by default. It restores compact dimensions, custom placement or responsive docking, the shared panel/launcher anchor and expanded/compact mode. The initial layout is 480 × 340 px, compact, bottom-right. Turning remembering off leaves the current layout untouched and discards its saved geometry; subsequent screen loads start with the default compact size at the preferred **Move preview to** preset. Moving, resizing or expanding then lasts only for the current page; closing and reopening without reloading keeps that layout. Re-enabling saves the current layout rather than reviving an older one. Restored layouts fit inside the current window without overwriting preferred bounds; fullscreen and PiP are never reopened automatically.
- **Scroll to my changes** is on by default. It follows identifiable content, structure and layout-attribute changes without theme-specific integration. Where available, it compares response HTML captured before frontend scripts run, rather than their initialization mutations. Content changes take priority over presentation changes. Non-content regions, including Xdebug diagnostic tables, are excluded by default without hiding their output. The PHP [comparison exclusion filter](#comparison-exclusions) can extend or replace that complete policy. If no directly visible change can be targeted, it falls back to the changed element’s nearest visible ancestor; this may be a broader container and never opens hidden widgets. Ambiguous changes retain the current position instead of guessing. It normally centers shorter changed content and shows taller content from its beginning. Detection and header handling are best-effort; disable it to retain manual positioning.

### Revision browser

Open WordPress's native revision browser (`wp-admin/revision.php`) and use the
**Revision preview** panel or launcher. The same window controls, viewport settings
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
previews author, publication date/time and taxonomy assignment changes, plus
featured-image selection, replacement and removal. Publication dates update the
preview, not the post's scheduling or publication state. Taxonomy support covers
native term lists, Post Terms blocks and standard Timber `post.category`,
`post.categories()` and `post.terms()` reads. Direct relationship queries remain
saved. ACF meta-box values use the same field-save
integration as classic editing; ACF blocks keep their native content-save hooks,
including blocks configured to store values in post metadata.
With Yoast SEO, the Block Editor also previews native primary-term selections and
the configured taxonomy breadcrumb trail without persisting unsaved SEO data.
Other arbitrary non-ACF metadata, template selections and unsaved separate
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
- **Excerpt rendering:** core's native Post Excerpt block uses the authorized preview excerpt, or generates one from preview content when it is cleared. The same adaptation supports selected saved revisions while preserving other-post contexts, native filters, excerpt length and read-more links. It is scoped to core's native registered renderer: custom renderers and other theme/plugin reads that reload saved posts by ID are not adapted automatically. Native WordPress Preview outside the panel remains unchanged, including its stale published-post excerpt behavior reproduced on WordPress 6.7 and 7.1.4.
- **Frontend output:** your theme and plugins determine the result, including redirects and browser-native output such as PDFs. Scroll restoration and change-following only apply to recognized HTML previews. Changes made only through stylesheets or frontend state may be missed; dynamic output at load can introduce unrelated differences. PDF page, zoom and scroll state may reset on refresh.
- **Isolated editors:** authorized HTML previews opt into an isolated Block Editor's `Document-Isolation-Policy` when the frontend is not already isolated, preserving document access for scrolling without disabling core's client-side media processing. Existing frontend isolation policies are retained. Cross-origin subresources follow the resulting policy. Non-isolated screens do not request it.
- **Trusted code only:** the preview is not sandboxed. Same-origin frontend scripts can access the editor. Use trusted theme and plugin code.
- **Embedding:** site and browser restrictions still apply. Do not weaken them to force embedding; use WordPress’s normal **Preview** button when needed. **Preview updated** reports a document load, not verified content or publication.
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

All authored JavaScript and panel CSS live in `src/`. WordPress's standard tooling builds four entries: `src/classic-editor.js`, `src/block-editor.js`, `src/revision-browser.js` and `src/preview-navigation.js`. The admin entries import public APIs from `@wordpress/components`, `@wordpress/element`, `@wordpress/data`, `@wordpress/preferences`, `@wordpress/api-fetch` and `@wordpress/hooks`; selected official icons live in `src/panel/icons.js`. WordPress supplies the installed runtime instead of bundling another copy of React or its components:

```sh
npm ci
npm run build
```

Rebuild after changing anything in `src/`; `npm start` watches those inputs during development. All plugin browser code is bundled, including editor/revision coordination, scrolling and the ACF adapter. ACF is initialized only when available. There are no runtime imports from `src/` or PHP-configured module URLs.

`build/` contains only generated assets and is ignored by Git. Build it locally before using a checkout or running the JavaScript tests, and rebuild after pulling source changes. Never edit generated files by hand. The complete directory, including CSS and generated `.asset.php` dependency/version metadata, must still ship in installable packages. The admin bundles intentionally contain the same shared panel source; they load on different screens and need no separate shared runtime. Distribution excludes `src/` and development dependencies; `.distignore` deliberately does not exclude `build/`.

Native component CSS is still enqueued separately and copied into PiP, including WordPress's combined admin stylesheets and runtime-generated component styles. CSSOM-only rules are copied as CSS text so native spinners retain their strokes and animation. Package imports do not replace this stylesheet handling.

The public panel APIs and built asset loading are checked against WordPress 6.7 and 7.1.4 core assets, including in-page, fullscreen and native PiP controls. This is not a full authenticated editor-to-frontend compatibility guarantee.

Node.js 24.5+ is needed only for development, not on the WordPress site. The ownership tests use native Web Locks and BroadcastChannel. After installing the development dependencies, run the JavaScript regression tests with:

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
wp eval-file /path/to/a-floating-live-preview-panel/tests/author.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/date-terms.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/preview-fields.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/core-blocks.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/compatibility.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/compatibility-dependencies.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/editor-extensions.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/timber-terms.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/yoast.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/preview-isolation.php
wp eval-file /path/to/a-floating-live-preview-panel/tests/preview-source.php
```

The block-editor fixture checks native REST save receipts, source conflicts,
authorization, first-save eligibility, draft/published autosaves, unchanged validation
rejections, metadata errors after partial post updates, and isolated serialized-block
previews. Client adapter tests cover pre-save draining, request correlation, legacy
meta-box acknowledgement and failure handling, including malformed fingerprints and
read-only errors in strict mode. The HTTP-free preview-isolation fixture checks that
existing site policies are preserved with both core APIs and the older-core fallback.
The HTTP-free preview-source fixture checks the HTML API wire format, Unicode/entity
escaping, element identities, native buffering/opt-out on supporting core, older-core
buffering, large responses and unchanged non-HTML, error and partial response fallbacks.
Frame/scroll tests cover isolation and capture opt-in, nested insertion/deletion,
repeated content, ambiguity, initialization noise, source-to-live element mapping,
generic visible-container fallbacks with directly visible changes taking precedence,
unchanged widget state, and non-executing source parsing. These do not replace
authenticated browser testing of native editor controls.

The core-blocks fixture renders the actual native Post Excerpt block with explicit,
cleared, whitespace-only and empty excerpts. It checks preview-content generation,
native filter order, formatting, length/more behavior against a saved control post,
unrelated post contexts and Query Loops, original permalinks, cache/global isolation,
permissions and renderer lifecycle. The revisions fixture also checks explicit and
generated historical block excerpts and rebinding to current saved data without writes.

The optional ACF fixture checks shared live-field saves, paginated repeater merging,
native post-meta block saving/rendering and source isolation. It exits successfully with a skip message when ACF Pro with
repeater support is absent:

```sh
wp eval-file /path/to/a-floating-live-preview-panel/tests/acf.php
```

Uninstall checks are destructive and require both an explicit opt-in and the dedicated
`aflpp_test_` table prefix on a disposable installation. They check revision/user batches,
preserved content, recovery autosaves and unrelated preferences, including multisite.
CI runs them on single-site WordPress, then converts that disposable site to multisite
and runs them again. Never point them at a project database:

```sh
AFLPP_TEST_UNINSTALL=1 wp eval-file /path/to/a-floating-live-preview-panel/tests/uninstall.php
```

### Installed-ZIP verification

The built distribution, not a checkout or symlink, was installed on disposable
single-site WordPress 6.7 and 7.1.4 installations with PHP 8.3.36, Chromium and each
version's bundled Twenty Twenty-Five theme. ACF, Timber and Flynt were absent. A QA
helper selected the classic editor through core's native filter and exposed
read-only saved-parent/recovery hashes; no Classic Editor plugin was required.

Both installations passed authenticated checks for:

- Gutenberg title/content rendering and excerpt capture, with native save/reopen.
- Native featured-image picker selection and edited-attribute replacement/removal,
  isolated from saved metadata until Save.
- Gutenberg and administrator classic native autosaves, including own-draft parent
  updates, published-post recovery preservation and the genuine recovery notice.
- Continued live editing after native saves/autosaves, with saved-parent and recovery
  hashes distinguishing native writes from panel writes.
- Historical/current revision selection with zero live-preview POST writes and the
  packaged revision-browser entry loaded.

The 364-test JavaScript suite and five core PHP fixtures passed against both core
versions; the optional ACF fixture skipped as expected. Core checksums passed, and
browser runs recorded no PHP errors. A separate native-preview comparison reproduced
core's stale Post Excerpt reads on both versions; the focused follow-up below adapts
panel sources without changing ordinary native Preview.

The same ZIP also passed the Gutenberg and classic browser suites on WordPress
7.1.4 with ACF PRO 6.8.11, using separate fixtures with the datastore disabled and
enabled. These checks covered native field capture, datastore API edits without
changing Gutenberg transport metadata, paginated row edits/additions, real native
autosaves, save/reopen, featured images, and delayed/failed native row reloads.
The datastore-only API case skipped when disabled. All six PHP fixtures passed
with ACF active, including native post-meta block saving/rendering and source
isolation. The ACF fixture now gives unsigned inputs a matching Page field-group
location, as ACF 6.8.11 requires; that fixture also passed with ACF 6.8.10.

The remaining administrator classic integration check passed on the existing
Flynt / WordPress 7.2-beta5 / ACF PRO 6.8.10 site with Ask the Origin 1.1.2 and this
plugin active together. A fresh administrator's real heartbeat sent the post form's
nonce, with one core `_wpnonce` and a separate toolbar `ask_the_origin_nonce`.
Native draft autosave, save/reopen, continued ACF editing and published-post recovery
preservation/notices passed. Ask the Origin's saved settings stayed unchanged.

A rebuilt ZIP with the focused core Post Excerpt adapter passed two authenticated
browser workflows per core-only version (6.7 and 7.1.4), plus sign-in setup: published
Gutenberg explicit/cleared/empty excerpts through real autosave and save/reopen;
and historical explicit/generated/current saved excerpts with zero live-preview
POST writes. Parent/recovery hashes distinguished isolated updates from native
writes, and native Preview still reproduced core's unadapted saved excerpt. All
six core PHP fixtures and 364 JavaScript tests passed per version; optional ACF
coverage skipped on these core-only installations. Focused core-blocks, revisions
and ACF PHP fixtures also passed on the existing Flynt / WordPress 7.2-beta5 /
ACF PRO 6.8.10 development site. This follow-up did not repeat the earlier ACF
browser matrix.

These results do not establish a general theme/browser/ACF range or verify other
PHP versions, multisite editor workflows or production deployment. Disposable browser
servers used PHP 8.3.36; the PHP integration fixtures used WP-CLI's PHP 8.3.33. Older
Flynt/ACF browser evidence remains separate and configuration-specific.

### GitHub Actions and releases

The workflows use the same 10up WordPress.org deployment and GitHub release actions
as the other plugins, with an explicit asset build before packaging:

- **Commit Checks** runs on branch pushes and pull requests and is reused for release
  tags. PHP lint runs separately. The integration matrix uses PHP 8.3 and Node.js 24
  on WordPress 6.7 and the latest stable WordPress, each without Timber and with an
  isolated Timber 2.x dependency. Every matrix job builds the assets, runs JavaScript
  tests using the runner's Chrome and that WordPress version's jQuery/Quicktags, and
  runs the PHP fixtures in a disposable single-site installation. Timber jobs verify
  that the dependency is loaded so its real integration assertions cannot silently
  skip. ACF Pro is not installed: the workflow explicitly reports its optional fixture
  as skipped, not verified. ACF checks still require a separate test site with ACF Pro.
  A separate job checks the built distribution with WordPress Plugin Check.
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

### Architectural principles

Keep the plugin a thin, native-first shell around normal WordPress frontend
rendering, with a narrow isolation layer for unsaved editor state. Native Preview
is the reference for frontend behavior on supported inputs, not a command the panel
repeatedly executes: panel refreshes must not update the saved parent post, create
or overwrite recovery autosaves, or cause a newer-autosave notice. WordPress's own
saving, autosave, validation and genuine recovery notices remain untouched. A known
native preview-read defect may have an explicit, source-scoped compatibility
adaptation while leaving native rendering and ordinary requests intact; the Post
Excerpt case below is one such bounded adaptation, not a global preview rewrite.

The live path is editor capture, an isolated preview source, authorized frontend
reads, then normal theme rendering. Saved-revision browsing reuses the authorized
read and presentation paths without capturing editor values or writing previews.

- Apply YAGNI: build for concrete supported workflows, not hypothetical editors, entities or integrations. DRY means sharing actual common behavior, not forcing distinct editor/revision lifecycles into configurable controllers. Do not add provider frameworks, integration registries, speculative interfaces or classes merely for symmetry.
- Prefer existing public WordPress and integration contracts over custom field formats, renderers or copies of native save workflows. Small explicit mappings are appropriate where native editor attributes and storage differ; do not build a universal field framework merely to hide those differences.
- Keep temporary-source storage, authorization and cleanup together. The plugin owns that isolation boundary and preview presentation/refresh coordination; WordPress and the active theme own normal frontend rendering. Optional integrations own their narrowly scoped adaptations.
- Keep editor and compatibility adapters thin. Every custom adaptation should have a concrete reason it cannot be delegated through a suitable native contract, plus focused regression coverage. Calling a native API inside a large custom workflow does not by itself meet this principle.
- Surface missing native contracts and maintenance costs before adding another workaround. Agree an explicit support limit where appropriate rather than silently accumulating special cases or dropping existing support. A missing native contract requires an explicit support-limit or bounded-exception decision; it is not permission to add private dependencies. The accepted ACF exceptions below do not authorize new ones.
- Treat these as constraints for new work and simplification reviews, not a claim that every current implementation detail is already minimal. Keep verified behavior and documented limitations distinct from architectural intent.

### Structure and ownership

- `a-floating-live-preview-panel.php` explicitly loads the PHP classes; `classes/Plugin.php` connects the owners. PHP owners live directly in `classes/`, with only compatibility adaptations grouped in a subdirectory. No Composer autoloader is required at runtime.
- `classes/ClassicEditor.php`, `BlockEditor.php` and `RevisionBrowser.php` connect their respective native screens. `classes/Panel.php` owns shared assets, labels, the configurable comparison-exclusion defaults and the PHP view in `views/panel.php`; the view remains a plain markup template, not a separate rendering layer.
- `classes/LivePreview.php` owns internal preview revision writes, fingerprints, native-save coordination and cleanup. `classes/FrontendPreview.php` authorizes reads and overlays only the selected source on frontend output. Live-source ownership and token verification stay together in `LivePreview`.
- `classes/Compatibility/` lists explicit core and third-party adaptations: `CoreBlocks.php` delegates native Post Excerpt rendering with the authorized source's fields; `Acf.php` owns ACF field preparation, save verification, cache invalidation and source reads; `Timber.php` and `TimberPost.php` own Timber post imports and term lists; `Yoast.php` owns native primary-term preparation and breadcrumb trails, including a scoped indexable write guard. The PHP preview owners expose lifecycle hooks and do not depend on these implementations. `src/compatibility/acf-editor.js` registers ACF's editor hooks; `acf-fields.js` bridges ACF browser events, and `acf-block-editor.js` captures native meta-box forms and observes ACF's own post-save row replacement. `src/compatibility/yoast.js` registers editor hooks and reads Yoast's native primary-term store without dispatching editor changes.
- `src/screens/` contains native screen integrations. `classic-editor.js` captures core classic fields; `classic-native-editor.js` observes native Preview, heartbeat and validation. `block-editor.js` reads public editor selectors and coordinates native saves through the awaited pre-save hook and narrowly scoped API-fetch middleware. Neither editor names optional plugins. `editor-extensions.js` scopes native WordPress hooks and cleanup to an editor lifetime. Both editors use `src/preview/live-preview.js` for shared live writes, frames and Web Locks.
- `src/screens/revision-browser.js` owns read-only revision selection. It never acquires editor locks or writes previews. It follows core's `wp.revisions.view.frame.model`; guard and verify that integration when changing supported WordPress versions.
- `src/panel/window.js` owns window presentation, focus, preferences, fullscreen and PiP. `panel/geometry.js` owns preferred bounds, docking, resizing and temporary viewport fitting; pointer/keyboard event binding stays with the window. `controls.js` renders public WordPress components and `viewport.js` sizes the preview viewport.
- `src/preview/frame.js` owns iframe replacement and cancellation; `scroll.js` enhances only recognized preview HTML. These are shared by the separate editor and revision lifecycles. Following iframe loads opt into `aflpp_source=1`; ordinary/new-tab previews do not. `FrontendPreview` uses the native template-enhancement buffer on WordPress 6.9+, or a preview-only `template_include` buffer on older core, to attach inert JSON source data to the existing authorization marker. Response-local `data-aflpp-node` attributes map that source to live elements without theme-specific classes. Invalid/partial/non-HTML responses, explicit response contracts and native buffering opt-outs retain DOM-based comparison. Capture availability transitions establish a fresh baseline rather than comparing source HTML with a live DOM. Missing or cloned live identities do not invent a target. This adds response payload and buffering work, not an additional request or persistent storage.

Keep PHP class names and filenames in PascalCase and browser filenames in kebab-case. Group browser modules by responsibility: `screens/` connects native screens, `preview/` manages preview updates and documents, `panel/` presents the floating window, and `compatibility/` contains optional integrations. Shared behavior stays with its owner rather than in generic helpers, utilities or separate JavaScript/CSS buckets. Preserve runtime identifiers such as preference keys, REST paths and the `aflpp-` CSS namespace when reorganizing internals. Extract concrete shared behavior, not generic controller or module frameworks.

The four JavaScript files directly in `src/` remain the build entries: `classic-editor`,
`block-editor`, `revision-browser` and `preview-navigation`. The admin entries initialize
screen integrations, import panel styles and handle startup failures; the navigation
entry runs inside the frontend preview. Screen behavior lives in `screens/`, separate
from startup. Only the shared live coordinator is named `preview/live-preview.js`;
`screens/revision-browser.js` is read-only, not another live editor. Compatibility
filenames put the integration first: `compatibility/acf-fields.js` and
`compatibility/acf-block-editor.js`. Tests follow the corresponding feature/integration
names where they target an owner.

`src/` contains authored assets; `build/` contains generated assets with the same
entry basenames. WordPress tooling intentionally adds `.asset.php` dependency files
and `-rtl.css` stylesheets; do not rename those suffixes or hand-edit generated files.
The native WordPress script handle `revisions` remains a dependency of our
`revision-browser` entry; it is not an obsolete plugin asset. The build test rejects
old or unexpected output filenames so a rename cannot leave stale release assets.

### Compatibility ownership and supported scope

The plugin owns an isolated preview data source feeding normal WordPress rendering.
It does not repeatedly invoke native Preview or replace the theme's renderer. Saved
posts and recovery autosaves remain WordPress-owned; the preview owners authorize,
select, write and clean up only their own temporary sources.

Compatibility is explicit, not hidden inside the preview engine:

| Integration owner | Supported adaptation | Boundary |
| --- | --- | --- |
| `Compatibility/CoreBlocks.php` | Delegates core's native Post Excerpt callback with a private block/post copy carrying the authorized source's title/content/excerpt and the original parent's identity. Cleared excerpts use native generation from preview content. Live author selections use the same private-copy approach for native Post Author, Post Author Name, Post Author Biography and Avatar callbacks. Publication dates use the public post-data binding on newer core, or a private Post Date callback copy on older core. | Only the matched original post and native registered callbacks; other post contexts, explicit avatar users, actual block contexts, globals, caches and custom renderers stay untouched. No renderer copy, global ID substitution or persistence. |
| `Compatibility/Acf.php` and `src/compatibility/acf*.js` | Post-local form values, native ACF save verification, revision value-cache invalidation, selected-source field reads and saved-history write guards; browser events and legacy meta-box coordination. | ACF is optional. Support depends on ACF's field/revision APIs; this is not support for every field type, options pages, related entities or a complete historical site snapshot. |
| `Compatibility/Timber.php` and `TimberPost.php` | Overlays title/content/excerpt, live author and publication dates through `timber/post/import_data`. Uses the public post-class hook to delegate native `terms()` with the authorized post's selections, covering `post.category`, categories, tags and custom taxonomies. Preserves parent identity, other import data and unrelated posts. | The term bridge replaces only the standard `Timber\Post` class for the selected live post; theme-specific subclasses stay untouched. It adapts only the term query inside that call, never shared relationship caches or other posts. Native relationship-dependent query modes remain saved. No Twig renderer or theme changes. Normal metadata and ACF reads retain their respective owners. |
| `Compatibility/Yoast.php` and `src/compatibility/yoast.js` | Validates native primary-term selections, stores them only on the owned live revision, and adapts the selected post's primary metadata and breadcrumb links. Uses Yoast's native renderer and parent breadcrumb surface. | Optional; existing Gutenberg controls only. Changes the configured main-taxonomy trail, preserves custom titles and parent hierarchy, and blocks lazy saves of this post's indexable/primary models. Bulk metadata, indexed repositories, other posts and saved-history taxonomy behavior stay native. No analysis-score, SEO title or meta-description capture. |

Flynt is a local test theme, not a plugin integration or runtime requirement. A
compatibility class identifies a deliberate integration, not a guarantee across all
versions of that dependency. Add a concrete owner and regression tests when adding
third-party behavior; do not put its hooks in the shared preview owners or introduce a generic
integration registry. The shared comparison-exclusion defaults are configuration policy, not an
adaptation of dependency rendering/read/write APIs: they may identify recognizable non-author
output such as Xdebug diagnostics, while the matcher itself stays dependency-neutral.
`Plugin.php` instantiates the built-in owners without passing compatibility objects into editors. Owners contribute assets/configuration and browser
behavior through the same WordPress hooks that external plugins and themes can use.
Compatibility setup is imported by the browser entry points, not the core screen modules.

### Core Post Excerpt read adaptation

Core's explicit context-ID lookup can bypass the main preview object. Upstream
[#37648](https://github.com/WordPress/gutenberg/pull/37648) used the global preview
object to fix excerpts; [#49495](https://github.com/WordPress/gutenberg/pull/49495)
restored the explicit ID for legitimate other-post contexts. Reverting to the global
post would repeat that regression.

`CoreBlocks` binds only after `FrontendPreview` authorizes and selects a source.
It temporarily wraps only the registered `render_block_core_post_excerpt` callback,
then delegates to that unchanged native function. For the exact original-post ID,
only the callback's private block copy receives a cloned parent post carrying the
selected text fields. Native `get_the_excerpt()` and `get_the_permalink()` accept that
`WP_Post`; it retains the parent's ID, post type, slug, saved author and saved dates.
Unsaved author/date choices therefore cannot change date- or author-based excerpt URLs.
The actual block context remains an integer ID. Native excerpt generation, filters,
formatting, length and read-more processing run once through core's own pipeline.

This relies on that renderer forwarding its post context to object-aware native
functions, as checked on WordPress 6.7 and 7.1.4. It is not a general object-valued
block-context contract. Keep the assumption and its tests in this owner, revisit
it when core changes, and remove it when native preview reads preserve both source
and explicit post context. Rebinding and shutdown release the owned callback;
cleanup must not overwrite a later theme/plugin renderer. Ordinary/rejected requests
remain inactive, and other-post contexts are never replaced by the global post or
a revision ID. This exception does not authorize cached-post mutation or a copied
block renderer.

### Live author selections

Gutenberg's public `author` attribute is captured and observed alongside the other
live fields. The preview endpoint validates user IDs and the post type's native
`edit_others_posts` capability before writing. The effective post author is stored
in `_aflpp_post_author` metadata on the isolated source; its `post_author` continues
to identify the editor who owns that source. Reused sources reseed the saved author
when the input is omitted, and author changes invalidate the previous source token.

Frontend post objects and Timber imports overlay that selection only for live
previews. Core's native author and avatar blocks reload the saved post by ID, so
`CoreBlocks` delegates their unchanged callbacks with a private parent-post copy,
using a separate display copy so excerpt routing keeps the saved author/date. This relies on
those callbacks passing `postId` to `get_post_field()`; it is not a general
object-valued block-context contract. Custom callbacks are not wrapped. Explicit
avatar users, comment authors, author archives and unrelated posts remain native.
Rebinding and shutdown release only owned callbacks.

Saved-history previews retain the current saved post author: a native revision's
author identifies its editor, not a historical post-author selection. The focused
regression covers live author rendering, links, permissions, revision ownership,
isolation, fallback, save/reopen and history on the local WordPress 7.2-beta5 / PHP
8.3 site, alongside client capture tests. The previous 6.7/7.1.4 browser matrix was
not repeated for this addition.

### Live publication dates and taxonomy assignments

Gutenberg's public `date` attribute uses WordPress's REST local/UTC conversion,
including explicit timezone offsets. A null date (or empty ACF form value) means
publish immediately and displays the current time. Omitted input reseeds the saved
date. `_aflpp_post_date` stores both display fields on the isolated revision;
revision creation/modification timestamps, saved post status, scheduling events and
recovery autosaves are not changed. Last-modified fields remain those of the saved
post. Frontend post objects and Timber imports receive the selected publication
date, not the internal revision's creation time. Native Post Date blocks use the
public `block_bindings_source_value` filter for `core/post-data` on newer core;
older native callbacks receive a private post/block copy. Their linked dates retain
the saved-parent URL through object-identity-scoped permalink filters, released in
`finally` even after errors. Explicit block dates and other-post contexts are
preserved. Arbitrary saved-post-by-ID reads and general permalink routing are not simulated.

The Block Editor configuration maps each assignable REST-enabled taxonomy to its
native editor attribute, including custom `rest_base` values. A small JSON `terms`
map preserves empty lists through both JSON and ACF's native form transport.
The endpoint validates registered taxonomies, existing term IDs and taxonomy/per-term
assignment capabilities before writing. It stores the effective lists in
`_aflpp_terms` metadata, never real term relationships; it does not create terms.
Omitted taxonomies reseed saved assignments on every refresh.

`FrontendPreview` overlays `get_the_terms` after WordPress has populated its native
relationship cache. Unchanged assignments retain the native result, including its
ordering and earlier list filters; changed lists retain registered taxonomy
ordering. This supports standard term-list functions and Post Terms blocks without
putting unsaved relationships in shared caches or changing term counts. The optional Timber adapter also supports `post.category`,
`post.categories()` and `post.terms()` for categories, tags and custom taxonomies.
It selects a small standard-Post subclass through `timber/post/class` and delegates
Timber's native `terms()` implementation. Temporary `pre_get_terms` and
`terms_pre_query` hooks adapt only its matching query and are removed in `finally`,
including after errors. Native aliases, term objects, links, grouping, include/exclude
filters, ordering and limits stay native. Empty selections short-circuit that query;
`include => [0]` is not a safe empty-result sentinel on older WordPress.

**Scope limits:** theme-specific Timber Post subclasses are not replaced.
Relationship-dependent term query modes (`all_with_object_id`, `term_order` and
`exclude_tree`) retain saved reads. Direct relationship queries (`wp_get_object_terms`,
`has_term`, including Timber's `has_term()`, and archive/related-post queries) are not
intercepted. A theme can naturally use the previewed lists as inputs to its own related
query; the queried posts' relationships still come from saved data. No shared
relationship cache is substituted. New terms created through Gutenberg itself remain
native editor writes.

Saved-history previews retain current saved publication dates and taxonomy
assignments; native revisions do not record historical selections of these fields.
Fingerprints include stored term assignments, so external term-only changes expire
old live sources and require a fresh baseline. They use stored post properties,
not `WP_Post::to_array()`'s filtered term-list convenience fields.

`tests/date-terms.php` covers date conversions, immediate/reset/omitted values,
draft/published/scheduled posts, native blocks, term replacement/removal, custom
taxonomies, permissions, cache/source isolation, counts, scheduling, history,
conflicts and native save/reopen. It also checks registered non-default taxonomy
ordering, date/author-based pretty permalinks, nested date reads and exception cleanup.
`tests/preview-fields.php` rejects failed author/date/term writes on fresh and reused
sources, accepts unchanged-value updates, rejects post-save corruption and verifies
retry/recovery isolation. The endpoint reads snapshots back before returning a URL.
PHP integration checks passed on disposable
core-only WordPress 6.7 and 7.1.4 sites and the local WordPress 7.2-beta5 ACF/Timber
site with PHP 8.3. Client regressions cover capture, observation and ACF transport.
Those PHP/client checks do not by themselves verify authenticated editor behavior;
the focused local browser coverage is described below.

`tests/timber-terms.php` uses real Timber imports and Twig rendering to check the
category byline, links, tag loops, custom taxonomies, clearing/rebinding, saved
fallback, query filtering/grouping, unrelated posts, custom-class preservation,
nested native reads, term counts, recovery data and hook cleanup after exceptions.
It skips explicitly without Timber. The focused fixture passed with Timber 2.5.1
on disposable WordPress 6.7 and 7.1.4 sites, and with Timber 2.4.1 on the local
WordPress 7.2-beta5 Flynt site. The latter also rendered its actual
`BlockPostHeader/index.twig` and verified the selected category replaced the saved
one. This fixture is PHP/Twig coverage; separate authenticated editor checks are
described below.

### Yoast primary terms and breadcrumbs

`src/compatibility/yoast.js` reads `getPrimaryTaxonomyId()` from Yoast's own
`yoast-seo/editor` store. It observes primary-only changes and uses the same JSON
or ACF multipart preview transport. Missing stores, another post context and
uninitialized controls omit the field and retain saved values. Native unset and
unassigned selections become `0`; no second primary-category control is added.

`Compatibility/Yoast.php` validates the `yoast_primary_terms` JSON object against
native, REST-enabled, assignable primary taxonomies, existing terms, the submitted
or saved assignments, and per-term permissions. It writes directly to the owned
preview revision and verifies the result. Omitted values are reseeded from saved
bulk metadata, so rebinding cannot copy a previous live override back into the
baseline. Selected-post `WPSEO_Primary_Term` / `yoast_get_primary_term_id()` reads
use the preview selection; bulk metadata and indexed repositories stay native.

The `wpseo_breadcrumb_links` adapter replaces only the configured main-taxonomy
trail, including term ancestors and native custom breadcrumb titles. A read-only
`wpseo_breadcrumb_indexables` observer identifies the original ancestry, so custom
links to other terms in that same taxonomy are not mistaken for the native trail. When no
primary is selected, it follows Yoast's deepest-term/root-order fallback. It
updates default post breadcrumb text from the preview title, but preserves explicit
Yoast breadcrumb titles, other posts, custom crumbs, disabled main taxonomies,
unchanged baselines and saved-history taxonomy behavior. Parent-post hierarchy
keeps precedence. Yoast still owns settings, rendering, wrappers and later filters;
plugin-generated term text follows its HTML-text contract with safe allowed markup.

A scoped `wpseo_should_save_indexable` guard prevents the selected post's native
lazy builds/upgrades from saving preview-derived fields, permalinks or hierarchy.
Its primary models are also denied saves. Native primary builders still see saved
bulk metadata, not preview clears. Missing post models get a read-only taxonomy
trail or reuse the native parent's breadcrumb surface. Other models retain their
native save decision. Rebinding and shutdown release the read and write hooks.

**Scope limits:** the theme must already output Yoast breadcrumbs; the adapter
does not add a breadcrumb UI or enable it. Ordinary Timber `post.category` remains
a category-list read, not an implicit primary-category lookup. Direct indexed
reads remain saved. SEO title/meta-description capture and analysis scores are not
part of this adapter; analysis stays Yoast-owned. No Flynt changes are needed.

`tests/yoast.php` checks real primary getters, breadcrumb generation and native
`yoast_breadcrumb()` HTML, primary-only edits, assignment replacement/removal,
custom taxonomies and REST bases, ancestors, fallback, custom titles, earlier
same-taxonomy custom link filters, parent hierarchy, permissions, failed writes,
rebinding, history and saved/recovery-data
isolation. It snapshots Yoast's indexable, primary-term and hierarchy tables and
exercises stale and missing post models without persisting preview data. The
fixture passes with Yoast 28.8 on disposable WordPress 7.1.4 (indexing enabled) and
the local WordPress 7.2-beta5 development installation (indexing disabled), PHP 8.3.
Yoast 28.8 requires WordPress 7.0+, so WordPress 6.7 only verifies the inert optional
dependency path. Focused authenticated Gutenberg checks also passed on Flynt's
local WordPress 7.2-beta5 / Timber 2.4.1 / Yoast 28.8 devstack: native category and
primary controls, clearing, Save/reopen and later unsaved changes; store-driven
author/date edits checked actual native blocks and Flynt's author byline. A real
blocked metadata write produced a retryable error, retained the last good frame
and recovered through Try again. Saved parent and recovery receipts remained
unchanged during unsaved previews. The
browser fixture temporarily output Yoast's native breadcrumbs without changing
Flynt; it does not claim the theme already outputs them. These checks are not an
installed-package test or a guarantee across all Yoast versions.

### Native-first bridge review

The focused review checked WordPress 7.2-beta5 and ACF PRO 6.8.10 source. Relevant
entry points are core's `wp-admin/edit-form-blocks.php` and `core/edit-post` store;
ACF's repeater `listenForSavedMetaBoxes()` / `ajaxLoadPage()` methods in
`assets/build/js/pro/acf-pro-input.min.js`; and `acf_flush_value_cache()` in
`includes/acf-value-functions.php`. This is not a new version-range or authenticated
browser compatibility guarantee.

| Bridge | Native contract considered | Result and remaining boundary |
| --- | --- | --- |
| Recognizing native legacy meta-box requests | Core builds its endpoint with `admin_url('post.php')`. | `classes/BlockEditor.php` supplies that URL. Request matching no longer reads the private `_wpMetaBoxUrl` global or copies its nonce logic. Core still sends the request; the plugin only scopes its acknowledgement to the same-origin endpoint, loader request, post ID and `editpost` action. |
| Native meta-box capture and acknowledgement | `core/edit-post` selectors `getActiveMetaBoxLocations()` and `isSavingMetaBoxes()`. | WordPress now chooses the active locations to capture, including an empty list. The existing location fallback is retained only when the selector is absent. These APIs do not supply signed form values or a request-correlated saved-data fingerprint, so native `FormData` capture and the acknowledgement receipt remain necessary. We do not call `requestMetaBoxUpdates()` to prepare previews: that would perform a real native save. The native form markup and loader request shape remain version-sensitive seams. |
| ACF paginated row reload after a native save | Native save state and ACF lifecycle actions. | ACF starts a separate AJAX row reload after `isSavingMetaBoxes()` becomes false. In the inspected implementation, `remount` occurs per returned row and does not cover an empty result; no whole-refresh completion action was found. Keep the existing scoped row-replacement observer, including zero-row results, rather than guessing from elapsed time or calling ACF's private refresh methods. Row markup remains an implementation dependency, not a stable public contract. |
| ACF pending structural pagination edits | Field value reads and normal ACF change actions. | These do not supply the pending add/delete/reorder deltas across loaded and unloaded rows. Keep the existing native row-marker check that protects Classic Preview handover; do not build another row-state model or reset ACF's deltas. The marker classes remain a version-sensitive assumption. |
| Request-local ACF source cache invalidation | `acf_flush_value_cache($postId, $fieldName)` and the values-store `reset()`. | The flush helper clears one named field, not all cached values for a post/revision, including absent/default fields. Resetting the whole store would affect unrelated objects. Keep the existing source-prefix invalidation; the cache-key prefix remains an explicit internal assumption, not a newly guaranteed API. |

#### Accepted ACF compatibility exceptions

**Decision: preserve the current ACF features and accept only the three bounded
adaptations above.** Native-first does not mean public-contract-only at the expense
of supported behavior. These are deliberate compatibility obligations, not unresolved
items that must be removed regardless of feature cost, and not stable public APIs:

- `src/compatibility/acf-block-editor.js` may observe paginated row replacement to
  resume after ACF's own reload, including empty results. It must not trigger or
  reimplement that reload.
- `src/compatibility/acf-fields.js` may inspect pending structural row markers so the
  Classic Preview handover requires a reload only when necessary. It must not
  reconstruct ACF's row state or reset its deltas.
- `classes/Compatibility/Acf.php` may recognize value-cache key prefixes to invalidate
  only the preview's parent/source values. It must not reset unrelated objects' caches.

Conditions of this decision:

- Keep these assumptions inside their ACF compatibility owners. WordPress and ACF
  retain normal saving, autosave, validation and field-value interpretation; WordPress
  and the active theme retain rendering. The exceptions do not broaden permissions
  or allow panel refreshes to change saved posts or recovery autosaves.
- Maintain focused regressions when changing a bridge: empty, deleted and reordered
  paginated rows; reused preview sources; fresh raw/formatted/default field values;
  and isolation from unrelated posts. Tests establish behavior in the checked
  environments, not stability across all ACF versions or coverage of every field type.
- If native save or row-reload acknowledgement cannot be confirmed, retain the last
  frame, explain the problem and require an editor reload instead of guessing a new
  baseline or using a timer as proof. Reload is a synchronization fallback, not a
  general substitute for correct server-side cache invalidation; known cache-contract
  incompatibilities need an explicit support decision rather than stale output.
- Do not impose blanket reloads on working flows merely to remove these dependencies.
  New private assumptions, broader support or reductions in existing behavior require
  a separate review and explicit decision. Do not add a custom field/repeater engine,
  vendor fork or generic integration framework.
- Replace each exception when a suitable public ACF contract covers its actual needs:
  whole-refresh completion including empty results, pending structural deltas, or
  source-scoped cache invalidation. Verify equivalent behavior and autosave isolation
  before retiring that bridge; an API with a similar name is not enough.

The safe simplifications delegate request identification and active form locations
to WordPress. They do not change native save URLs/nonces, create another save workflow
or alter preview isolation.

### Editor integration hooks

Plugins and themes may ship their own adapters. There is no discovery mechanism,
manifest or integration registry: load PHP normally and register browser setup through
WordPress hooks. Built-in ACF and Yoast integrations use this same contract. Core
editors do not import, construct or inspect optional plugin integrations.

#### PHP hook context

PHP filters receive the extendable value first and context second:
`$value, array $context`. PHP actions receive only `array $context`. Register two
accepted arguments for filters when your callback needs context.

Every PHP context starts with these core-owned identities, in this documented order:

```php
[
    'post' => ['id' => 42],
    'source' => null, // Or ['id' => 901] when this operation has established a source.
]
```

`post` identifies the original post. `source` identifies the prepared or selected
preview source; it is not a mutable selection instruction. Form-value filters add
`input` after these identities; script-dependency filters add `config`. Other hooks
receive identities only. There is no screen/mode discriminator: subscribe to the
appropriate feature hook. Key order aids readability; callbacks should access keys
by name, not position.

Context is separate from the filter's returned value. Mutating a callback's context
does not replace core's post or source identity. Integrations still run as trusted PHP
code, not inside a security sandbox. Original editor input remains untrusted.
This context does not restructure native form fields or browser configuration.
The request's existing `base` key remains its saved-state fingerprint, not a context
envelope.

#### PHP configuration and assets

Only the selected screen's hooks run:

| Configuration filter | Arguments and contract |
| --- | --- |
| `aflpp_classic_editor_preview_config` | `array $config, array $context`. Extend Classic Editor live-preview configuration before JSON encoding. |
| `aflpp_block_editor_preview_config` | `array $config, array $context`. Extend Block Editor live-preview configuration before JSON encoding. |
| `aflpp_revision_browser_preview_config` | `array $config, array $context`. Extend read-only revision-browser configuration; this screen does not capture edits or prepare live previews. |

Configuration context contains `post` and a null `source`. Use
`$context['post']['id']` for core's post identity. Preserve the configuration's core
identity, endpoint, nonce, baseline and availability values where present, existing
integration keys and labels. Shared panel labels are merged afterward.

| Script-dependency filter | Arguments and contract |
| --- | --- |
| `aflpp_classic_editor_preview_script_dependencies` | `string[] $dependencies, array $context`. Add scripts for Classic Editor preview. |
| `aflpp_block_editor_preview_script_dependencies` | `string[] $dependencies, array $context`. Add scripts for Block Editor preview. |
| `aflpp_revision_browser_preview_script_dependencies` | `string[] $dependencies, array $context`. Add scripts for the read-only revision browser. |

Dependency context contains `post`, a null `source` and `config`: that screen's
already-filtered configuration. Register scripts with `wp_register_script()` and append
their handles, preserving previous dependencies. Generated WordPress runtime
dependencies are merged afterward. Register a common callback on multiple screen
hooks if you support more than one screen; no entry argument or screen check is needed.

Register an external script as an entry dependency so its setup listener exists before
synchronous editor initialization. The external script must declare `wp-hooks` and any
other WordPress packages it uses. It must register setup without reading the panel's
configuration global: dependencies execute before the entry's inline configuration.
The setup callback receives the complete configuration later. Register it at script
execution, not in a DOM-ready callback, asynchronous import or timer.

```php
add_filter('aflpp_classic_editor_preview_script_dependencies', function (
    array $dependencies,
    array $context
): array {
    wp_register_script(
        'vendor-preview',
        plugins_url('preview.js', __FILE__),
        ['wp-hooks'],
        '1.0.0',
        true
    );
    $dependencies[] = 'vendor-preview';
    return $dependencies;
}, 10, 2);
```

A theme can use `get_theme_file_uri()` instead of `plugins_url()`. Enqueue integration
styles through normal WordPress APIs. Do not declare an unavailable optional script
as a dependency: WordPress will also withhold the dependent entry.

#### Comparison exclusions

`aflpp_preview_comparison_excluded_selectors` filters the complete `string[]` exclusion
policy for Classic, Block Editor and read-only revision previews. It runs once while
building the selected screen's configuration, after its configuration filter and before
its script-dependency filter. Arguments follow the standard contract:
`array $selectors, array $context`, with `post.id` and a null `source`.

Defaults are `script`, `style`, `noscript`, `template`, `link`, `meta`, `nav`,
`[role="navigation"]`, `[aria-live]`, `input[type="hidden"]` and `table.xdebug-error`.
Matching elements and their descendants do not participate in comparison; their actual
rendered output is never hidden or changed. Attribute normalization, content-root
selection and ambiguous-match handling remain comparison logic, not this policy.
Current attribute normalization ignores IDs, `aria-*`, event handlers and nonce/token
attributes; edits limited to those values do not trigger change-following.

A site-specific plugin, MU plugin or theme can extend the policy without browser code:

```php
add_filter('aflpp_preview_comparison_excluded_selectors', static function (
    array $selectors,
    array $context
): array {
    $selectors[] = '[data-vendor-runtime]';
    return $selectors;
}, 10, 2);
```

Preserve previous contributors when appending. Callbacks may also remove selectors or
return a replacement list; return `[]` to remove every configured exclusion. The final
list is delivered as `comparisonExcludedSelectors`; JavaScript does not merge another
default list back in. Prefer component/integration selectors across the site rather
than post-ID lists. Context is available only if a real conditional exception is needed.
With source capture, selectors match pre-JavaScript HTML; otherwise they match the loaded
document, so choose stable markup selectors rather than script-only state.

Invalid PHP return shapes (not an array of nonempty strings) retain the shipped
defaults; sparse keys are reindexed before JSON encoding. Syntactically invalid CSS
selectors are ignored individually in the browser without disabling valid exclusions
or scrolling. Keep exclusions limited to known non-author output: editing an excluded
region will not trigger change-following.

#### Browser setup and lifecycle

Register synchronously with the action for the editor you support:

- `wp.hooks.addAction('aflpp.classicEditor.previewSetup', 'vendor/integration', callback)`
- `wp.hooks.addAction('aflpp.blockEditor.previewSetup', 'vendor/integration', callback)`

Only that editor's setup action runs, once per live editor session. There is no live
editor setup action in the read-only revision browser. An adapter supporting both
editors registers both actions; it does not need to inspect a `screen` discriminator.

Both setup contexts contain:

- `config`: the final configuration for that editor.
- `hooks`: a native `wp.hooks.createHooks()` instance private to this editor session.
- `changed()`: notify the core preview that integration inputs or readiness changed;
  never refresh, save or acquire preview ownership independently.
- `onDestroy(callback)`: register cleanup immediately after installing listeners or
  subscriptions. Cleanup runs once, in reverse registration order, on teardown or
  setup failure; one failed cleanup does not prevent the others.

Classic setup additionally supplies `form`, `watchEditor(tinyMceEditor)` and
`cancelNativeSave()`. These connect native field editors and validation without
replacing WordPress saves. Block setup does not supply these form helpers; its local
observation and value filters receive public editor selectors instead.

Use the context's **local** `hooks`, not global `wp.hooks`, for the hooks below.
Callbacks are synchronous and use normal WordPress namespaces/priorities. Multiple
integrations may contribute; preserve earlier results and use distinct payload keys.

##### Classic Editor local hooks

| Local hook | Arguments and contract |
| --- | --- |
| `previewFormBody` (filter) | `URLSearchParams body, FormData nativeValues`. Append owned fields to the existing core form body. Preserve repeated keys, empty values and earlier contributors; return the body, never `null`. Core sets the baseline afterward. Do not override core fields. |
| `previewPauseReason` (filter) | `string reason`. Preserve an existing nonempty reason or return your own waiting message; return an empty string when ready. Call `changed()` when readiness changes. |
| `nativePreviewHandoffError` (filter) | `Error\|undefined error, boolean saved`. Preserve prior errors. Return an error when an acknowledged native Preview changed the saved baseline in a way that makes retained integration inputs unsafe. Core owns baseline verification. |
| `nativeSaveValidationPending` (filter) | `boolean validating`. Preserve a previous `true`, or return whether your native validator is still running. This only informs cancellation detection; it must not implement validation or saving. |

##### Block Editor local hooks

| Local hook | Arguments and contract |
| --- | --- |
| `additionalPreviewValues` (filter) | `object values, editorSelectors`. Contribute a plain object of strings, finite numbers, booleans or null; omit unavailable keys and JSON-encode structured input so it survives form transport. Called during observation and capture; return stable, cheap values without serializing core content, dispatching store changes or mutating selectors. Adding, changing or removing a key schedules an update. |
| `previewFormBody` (filter) | `URLSearchParams\|null body, null nativeValues`. Starts with `null` and no native form values: return `null` to keep JSON transport, or a `URLSearchParams` body containing owned form fields. Preserve previous contributions, repeated keys and empty values. Core values, including `additionalPreviewValues`, and the baseline are set afterward. Do not override core fields. |
| `previewPauseReason` (filter) | `string reason, editorSelectors`. Preserve an existing nonempty reason or return your own waiting message; return an empty string when ready. Call `changed()` when readiness changes. |
| `observePreviewInputs` (action) | `editorSelectors`. Runs when the selected post is ready, before integration readiness and cheap values are read. Observe public state; do not save or dispatch editor changes. |
| `nativeMetaboxSaveAcknowledged` (action) | No arguments. Runs only after the native legacy meta-box save has a valid fingerprint acknowledgement. An integration may wait for its own asynchronous refresh before becoming ready again; this action does not prove that refresh finished. |

For example, a classic field integration can contribute without changing any core
editor file or checking an editor type:

```js
wp.hooks.addAction('aflpp.classicEditor.previewSetup', 'vendor/note', ({ form, hooks, changed, onDestroy }) => {
    const input = form.querySelector('[name="vendor_note"]');
    if (!input) return;
    input.addEventListener('input', changed);
    onDestroy(() => input.removeEventListener('input', changed));
    hooks.addFilter('previewFormBody', 'vendor/note', (body) => {
        body.append('vendor_note', input.value);
        return body;
    });
});
```

Capture alone does not make a field previewable: its PHP adapter must validate and
store the input on the owned preview source through the preview hooks below, then
adapt only the authorized frontend reads. Never write the saved parent or recovery
autosave. Check optional capabilities when used; an absent integration should not
subscribe or contribute assets. If PHP detects an integration but its browser API is
missing, fail visibly rather than silently dropping its fields.

Thrown setup/lifecycle errors stop preview writes with `aflpp_integration_failed` and
retain the last frame where available. Invalid capture results, including removed or
overwritten Classic core fields, fail the same way. Native WordPress saving remains
independent; in particular, a failed post-save observer must not reject the native
save response.
Capture contracts that would discard or misencode form data also fail closed. A known
integration failure may throw an `Error` with code `aflpp_integration_failed` and a
translated user-facing message; unexpected exceptions receive the shared explanation.
Reloading creates a fresh session. Local hook instances are not reused after teardown.

`tests/editor-extensions.php` checks screen-specific configuration/assets, structured
context and context-mutation isolation, multiple contributors, ordering, JSON escaping
and revision isolation. `tests/editor-extensions.mjs` checks
external browser contributions alongside ACF, readiness, repeated/empty form values,
absent dependencies, failure isolation and per-session cleanup. Screen regressions
also verify native save responses and contributed-value removal.

The initial extension API was checked with the full JavaScript suite and core PHP
fixtures on disposable WordPress 6.7 and 7.1.4 installations, PHP 8.3. Additional PHP
checks passed with ACF PRO 6.8.10 and Yoast 28.8 on 7.1.4, and with Timber 2 on 6.7.
Native-event and save-cancellation Chromium fixtures also passed using each core
version's bundled jQuery/Quicktags. These are focused regression checks, not a new
installed-package or authenticated end-to-end browser compatibility claim.

### Preview integration hooks

These feature hooks share the PHP context convention above. Their names describe the
extension opportunity, not the temporary storage mechanism.

#### Preparing a live preview from unsaved edits

Classic and Block Editor requests use the same preparation workflow after core has
authorized the post and checked its saved-state fingerprint. Revision browsing never
enters this workflow.

| Hook | Arguments and contract |
| --- | --- |
| `aflpp_live_preview_form_values` (filter) | `array\|WP_Error $formValues, array $context`. Context contains `post`, null `source` and `input` (the original unslashed editor request). Extend unslashed native form values before slashing/writing, or reject with `WP_Error`; preserve an earlier error. Validate your own input. This is form-save data, not a universal metadata map. |
| `aflpp_live_preview_custom_fields_initialized` (action) | `array $context`, containing `post` and initialized `source` identities. Saved custom-field values are available as the preview's starting point. Invalidate integration caches or apply previously validated values. Submitted changes and native save hooks still follow; this does not mean the preview is ready. |
| `aflpp_live_preview_preparation_error` (filter) | `?WP_Error $error, array $context`, containing `post` and the established `source` identity, or null if no source identity was established. Verify contributions and release preparation state, preserving earlier errors. Runs in `finally` after success, rejection or exceptions. Rejected form values pass their `WP_Error`; a thrown exception propagates after cleanup. An established source remains available to cleanup if a later callback throws. Core write errors still take precedence. |

For example, preparation context is:

```php
[
    'post' => ['id' => 42],
    'source' => null,
    'input' => [
        'post_title' => 'Unsaved title',
        'vendor_note' => 'Unsaved note',
        // Other original editor input; adapters validate their own fields.
    ],
]
```

Core chooses the write target independently of context or the form's `post_ID`.
Native WordPress saving remains independent of this preparation/error lifecycle.

#### Selecting a source for frontend rendering

Both actions run only after core authorizes and selects the source and installs its
native read overlays. They receive `array $context` with `post` and `source`
identities only. There is no read-only boolean: the action identifies the mode.

| Action | Contract |
| --- | --- |
| `aflpp_frontend_live_preview_source_selected` | Bind reads for the original post to the authorized source containing unsaved edits. |
| `aflpp_frontend_saved_preview_source_selected` | Bind read-only reads for the original post to the selected saved version or current saved post. |

For example, `['post' => ['id' => 42], 'source' => ['id' => 901]]` identifies the
post and its selected source. These are identities, not a mutable preview object or
authorization token. Supporting both modes means subscribing to both actions;
adapters may share their internal read-binding implementation.

These are trusted PHP integration points, not authorization APIs. Adapters must not
select another source, modify the saved parent/recovery autosave, broaden permissions
or affect unrelated objects. Historical preview storage uses WordPress revisions;
metadata writes must not use helpers that redirect revision IDs to the saved parent.

Hook lifetime is part of each compatibility owner's contract:

- Lifecycle subscriptions (`aflpp_live_preview_*` and `aflpp_frontend_*_preview_source_selected`)
  remain registered for the PHP request so the owner can handle later operations.
  Registering these does not call optional APIs.
- ACF's `acf/save_post` monitor exists only for a prepared write. The coordinator's
  `finally` block triggers cleanup after success, rejection or exceptions, including
  exceptions during payload preparation.
- Frontend read overlays remain active through rendering, not just while the source
  action is dispatched. Each adapter removes its own filters in `unbindPreview()`,
  before rebinding and at late request shutdown. Cleanup is idempotent; ACF also clears
  preview value caches and removes old saved-history write guards before live rebinding.
- Availability checks happen inside the adapter at use time, not once in the bootstrap:
  other plugins and a theme's Timber autoloader may load later. Missing dependencies or
  required read APIs install no third-party read/write filters. Unbound callbacks are
  safe no-ops. Core-only writes work without ACF; submitted ACF values without its save
  APIs return a controlled error rather than being silently discarded.

The revision fixture exercises the real compatibility subscriptions: denied requests
never announce a source; live, historical and current sources rebind correctly; Timber
imports preserve unrelated data; ACF history remains read-only. If Timber is installed,
it also checks `Timber::get_post()` against the selected historical source. The
compatibility fixture checks core-only writes, lifecycle/error propagation, exception
cleanup and read-filter rebinding/release without requiring ACF or Timber. The
dependency fixture simulates unavailable ACF/Timber and partial ACF APIs without
changing site configuration.

Verify both screen-to-preview workflows on a disposable WordPress site with the
theme and optional integrations you intend to use.

## License

GPLv3 or later. See [LICENSE](LICENSE).

Bundled icons are an unchanged subset of
[`@wordpress/icons` 20.0.0](https://github.com/WordPress/gutenberg/tree/55ab503b80b1561f48414b2eb209c25b793a9e8a/packages/icons)
by the WordPress Contributors, licensed GPL-2.0-or-later.
