<?php

/**
 * Plugin Name:       A Floating Live Preview Panel
 * Description:       See your changes in a floating preview while you edit posts and pages.
 * Version:           0.0.0
 * Requires at least: 6.7
 * Requires PHP:      8.3
 * Author:            Timo Hubois
 * Author URI:        https://pixelsaft.wtf
 * Text Domain:       a-floating-live-preview-panel
 * License:           GPLv3 or later
 * License URI:       https://www.gnu.org/licenses/gpl-3.0.html
 */

namespace AFloatingLivePreviewPanel;

defined('ABSPATH') || exit;

require_once __DIR__ . '/classes/Compatibility/Acf.php';
require_once __DIR__ . '/classes/Compatibility/Timber.php';
require_once __DIR__ . '/classes/Preview/LivePreview.php';
require_once __DIR__ . '/classes/Preview/FrontendPreview.php';
require_once __DIR__ . '/classes/Admin/Panel.php';
require_once __DIR__ . '/classes/Admin/ClassicEditor.php';
require_once __DIR__ . '/classes/Admin/BlockEditor.php';
require_once __DIR__ . '/classes/Admin/RevisionBrowser.php';
require_once __DIR__ . '/classes/Plugin.php';

new Plugin(__FILE__);
