# Meet the Frontend – Live Preview Panel

Meet the Frontend – Live Preview Panel adds a movable, resizable frontend preview to WordPress's Block Editor, classic editor and revision browser. See changes while editing, or browse saved revisions without restoring them. Your theme and plugins render the preview through WordPress's normal frontend rendering.

## Requirements

- WordPress 6.7 or later.
- PHP 8.3 or later.
- A saved post in a frontend-viewable post type, permission to edit it and enabled revisions for live editing.
- An admin and frontend on the same origin, and a browser with ES modules. Live editing also requires authenticated WordPress REST requests and Web Locks in a secure context.

ACF, Timber and Yoast SEO integrations are available when those plugins or libraries are present; they are not required for basic use. Composer and Node.js are not required to run a built plugin package.

## Installation

1. Place the plugin in `wp-content/plugins/meet-the-frontend-live-preview-panel/`. For a Git checkout or GitHub's automatic source ZIP, run `npm ci && npm run build` first. Installable plugin packages include the generated assets.
2. Activate **Meet the Frontend – Live Preview Panel** under **Plugins**.
3. Open a post, page or supported custom post type in the Block Editor or classic editor. Save new posts as drafts first.
4. Open **Live preview** and edit a supported field. Use WordPress's normal **Save**, **Update** or **Publish** controls to save your work.

## Usage

Move the preview by its titlebar and resize it from its borders or corners. Use **Preview options** for docking, fullscreen, **Keep on top** where supported, and preferences. Computer, Tablet and Phone presets and the Zoom control let you inspect different viewport sizes without changing the panel size. Window movement and resizing are also available from the keyboard.

**Scroll to my changes** follows detected changes when possible; turn it off to retain manual positioning. Panel visibility, layout and viewport preferences are stored per user across posts and editors.

In WordPress's revision browser, **Revision preview** follows the right-hand **To** selection without restoring or changing content. See [detailed usage](docs/usage.md) and the [listing FAQ](readme.txt) for control behavior and troubleshooting.

## Limitations

- Both editors preview title, content, excerpt and supported post-local ACF fields. The Block Editor also previews author, publication date/time, taxonomy assignments and featured-image changes. Arbitrary non-ACF metadata, template selections, the Site Editor and unsaved separate entities such as synced patterns are not supported.
- Live updates use separate internal preview revisions, not the saved post or WordPress's recovery autosave. Native saves and autosaves continue normally. The panel does not publish changes or provide crash recovery or collaborative editing.
- Historical content uses the current theme, styles and global settings. Missing historical fields cannot be reconstructed; revision previews are not complete historical site snapshots.
- Site and browser embedding restrictions still apply. The preview is not sandboxed: same-origin frontend scripts can access the editor. Use trusted theme and plugin code, and do not weaken security policies to force embedding.

Check your intended workflow on staging, including any optional integrations. Deactivation retains preview data and preferences. Uninstalling through WordPress removes internal preview revisions and the plugin's server-stored preferences, not saved posts, normal revisions or recovery autosaves.

## Development

Use PHP 8.3 or later and Node.js 24.5 or later for development. Development dependencies are not included in plugin packages.

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

Edit authored assets in `src/`, not generated files in `build/`. Browser tests require Chromium. PHP integration fixtures require a disposable WordPress installation; never run destructive uninstall checks against a project database.

See [development and release instructions](docs/development.md), [architecture and compatibility](docs/architecture.md), and [integration hooks](docs/integrations.md).

## License

GPLv3 or later. See [LICENSE](LICENSE).

Bundled icons are an unchanged subset of [`@wordpress/icons` 20.0.0](https://github.com/WordPress/gutenberg/tree/55ab503b80b1561f48414b2eb209c25b793a9e8a/packages/icons) by the WordPress Contributors, licensed GPL-2.0-or-later.
