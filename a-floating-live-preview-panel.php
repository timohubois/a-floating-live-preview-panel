<?php

/**
 * Plugin Name:       A Floating Live Preview Panel
 * Description:       A floating live frontend preview while editing posts and pages.
 * Version:           0.0.0
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
require_once __DIR__ . '/classes/Features/Preview.php';
require_once __DIR__ . '/classes/Features/Editor.php';
require_once __DIR__ . '/classes/Plugin.php';

new Plugin(__FILE__);
