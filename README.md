# A Floating Live Preview Panel

See your changes without leaving the editor.

A Floating Live Preview Panel adds a movable, resizable frontend preview to WordPress's post Block Editor, classic editing screens and native revision browser. Your theme and plugins render the page through WordPress's normal preview routing.

Live updates use a separate internal preview revision. They do not publish changes, update the saved post or overwrite WordPress's recovery autosave. Use WordPress's normal **Save**, **Update** or **Publish** controls to save your work.

## Requirements

- WordPress 6.7+ and PHP 8.3+.
- A saved post in a frontend-viewable post type and permission to edit it. Live editing also requires enabled revisions.
- A same-origin admin and frontend, and a browser with ES modules. Live editing additionally requires authenticated WordPress REST requests and Web Locks in a secure context.

ACF, Timber, Yoast SEO and Flynt are optional, not requirements. Composer and Node.js are not required to run a built plugin package. The Site Editor and unsaved changes to separate entities such as synced patterns are not supported.

This is unreleased development code. Check your intended workflow on a disposable local or staging site. See [verification scope](docs/development.md#installed-zip-verification) for recorded checks and remaining compatibility limits.

## Installation

1. Place the plugin in `wp-content/plugins/a-floating-live-preview-panel/`. For a Git checkout or GitHub's automatic **Source code** ZIP, run `npm ci && npm run build` first; source archives do not contain the generated assets. Installable release packages include them.
2. Activate **A Floating Live Preview Panel** under **Plugins**.
3. Open a post, page or supported custom post type in the Block Editor or classic editor. Save new posts as drafts first; the Block Editor panel becomes available without reloading.
4. Open **Live preview**, edit a supported field and the preview refreshes after a short pause. Save your work using the editor's normal controls.

The plugin does not force a save or enable revisions for you. WordPress's normal **Preview** button remains available.

## Usage

Move the panel by its titlebar and resize it from its borders or corners. The closed **Live preview** launcher can also be moved. Use the move grip, launcher or boundary resize control with arrow keys; hold Shift for larger steps.

- **Preview options** provides docking, reset, fullscreen and **Keep on top**, where the browser supports Document Picture-in-Picture. It also controls remembered visibility/layout and **Scroll to my changes**.
- **Computer**, **Tablet** and **Phone** select representative CSS-pixel viewports. Click the selected Tablet or Phone button again to rotate it. These controls do not emulate a device's user agent or touch capabilities.
- **Zoom** offers **Auto**, **Fit to panel**, **Fill width** and **Choose zoom** (10–400%). Auto fits the whole viewport, capped at screen-pixel 1:1. All modes preserve the selected viewport dimensions; resizing the panel changes visual scale, not media queries or text wrapping. At 100%, one preview CSS pixel occupies one physical screen pixel.
- **Scroll to my changes** follows detected changes when possible. Turn it off to retain manual positioning. Ambiguous matches retain position rather than guessing.
- Visibility, layout, viewport and scrolling preferences are stored per user across posts, both editors and the revision browser. Fullscreen and Keep on top never reopen automatically.

An open panel keeps its last frame while native saves finish. Live updates resume after the saved state is confirmed, or after validation rejects a save. If confirmation fails, preserve your edits and reload rather than assuming the preview is current.

### Saved revisions

Open WordPress's native revision browser and use **Revision preview**. The panel follows the right-hand **To** selection without restoring content or writing live-preview revisions. The caption identifies the displayed revision by date and author.

Historical content uses the current theme, styles and global settings. Missing historical fields cannot be reconstructed; this is not a complete historical site snapshot.

See [detailed usage and limitations](docs/usage.md) and the [listing FAQ](readme.txt).

## Supported fields and limitations

Both editors preview title, content, excerpt and supported post-local ACF fields. The Block Editor also previews author, publication date/time, taxonomy assignments and featured-image changes. Optional integrations adapt standard Timber post reads and Yoast's native primary-term selections and breadcrumb trail. Arbitrary non-ACF metadata, template selections and separate entities are not live inputs.

Preview revisions stay out of normal revision history and are removed when the parent post is updated or permanently deleted. Native WordPress autosaves continue independently, including their normal updates to your own drafts. The panel is not crash recovery or collaborative editing: multiple tabs coordinate preview ownership within the same browser, not across browsers or devices.

Embedding restrictions still apply. The preview is **not sandboxed**: trusted same-origin frontend scripts can access the editor. Do not weaken site security policies to force embedding. A loaded document is not proof that the expected content rendered; login and error pages can also load.

See [architecture and compatibility boundaries](docs/architecture.md) for adapter ownership, supported reads and version-specific evidence.

## Removal

Deactivation retains preview data and preferences. Uninstalling through WordPress removes internal preview revisions, their metadata and only this plugin's namespace in persisted user preferences, across sites on Multisite. Saved posts, normal revisions, recovery autosaves and unrelated preferences are preserved. Browser-local preference backups cannot be directly erased by PHP.

## Development

Use PHP 8.3+ and Node.js 24.5+:

```sh
composer install
composer check-platform-reqs
composer validate --strict
composer php:lint
npm ci
npm run lint
npm run build
npm test
```

Browser tests require Chromium; set `CHROMIUM_BIN` to override its path. Set `WORDPRESS_ROOT` to a local core directory to exercise WordPress jQuery/Quicktags integration tests. PHP integration fixtures require a disposable WordPress installation. Never run destructive uninstall fixtures against a project database.

Edit authored assets in `src/`, not generated files in `build/`. Rebuild after source changes; the full generated directory must ship in installable packages. Development files and dependencies are excluded through `.distignore`.

- [Development, integration tests and recorded verification](docs/development.md)
- [Architecture and compatibility decisions](docs/architecture.md)
- [PHP and browser integration hooks](docs/integrations.md)

## Releases

The plugin is currently unreleased (`0.0.0`, stable tag `trunk`). Before releasing, set the plugin header version and `readme.txt` stable tag to the same numeric version and update the changelog. Configure the repository's `SVN_USERNAME` and `SVN_PASSWORD` Actions secrets and confirm access to the WordPress.org slug.

Push the release commit to `main`, then a numeric tag such as `1.0.0` without a `v` prefix. **Pushing a release tag publishes the plugin:** the workflow runs the checks, builds assets, deploys to WordPress.org and creates a GitHub release with the installable ZIP. GitHub's automatic source ZIP is not an installable package.

The manual **Publish listing assets and readme** workflow updates the live WordPress.org listing from `main`. Use it only after the matching code version has been released. See [workflow details](docs/development.md#github-actions-and-releases).

## Contributing

For compatibility reports, include WordPress and PHP versions, browser, editor, theme, optional integration versions and steps to reproduce. Keep credentials and private site data out of reports.

## License

GPLv3 or later. See [LICENSE](LICENSE).

Bundled icons are an unchanged subset of [`@wordpress/icons` 20.0.0](https://github.com/WordPress/gutenberg/tree/55ab503b80b1561f48414b2eb209c25b793a9e8a/packages/icons) by the WordPress Contributors, licensed GPL-2.0-or-later.
