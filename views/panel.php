<?php

/**
 * Shared admin floating shell. Public WordPress components render its controls and feedback.
 */

defined('ABSPATH') || exit;
?>
<div id="aflpp-toggle" class="aflpp-launcher" hidden
    data-title="<?php echo esc_attr($title); ?>"
    data-direction="<?php echo is_rtl() ? 'rtl' : 'ltr'; ?>"
    data-move-help="<?php esc_attr_e(
        'Drag to move the preview, or use the arrow keys. Hold Shift to move farther.',
        'a-floating-live-preview-panel'
    ); ?>"></div>
<section id="aflpp-panel" class="aflpp-panel" data-state="loading" data-has-preview="false" data-has-feedback="false"
    aria-labelledby="aflpp-title" hidden>
    <header class="aflpp-header">
        <div class="aflpp-move-control"></div>
        <div class="aflpp-refresh-control"></div>
        <div class="aflpp-titlebar">
            <h2 id="aflpp-title" class="aflpp-caption"><?php echo esc_html($title); ?></h2>
        </div>
        <div class="aflpp-controls"></div>
    </header>
    <div class="aflpp-feedback" hidden></div>
    <div class="aflpp-viewport">
        <div class="aflpp-stage"></div>
        <div class="aflpp-empty"></div>
        <div class="aflpp-pip-control"></div>
    </div>
    <footer class="aflpp-devicebar" hidden>
        <div class="aflpp-device-controls"></div>
        <span class="aflpp-dimensions"
            title="<?php esc_attr_e(
                'Shows the page width and how small we make it to fit. This is not a full test of a phone or tablet.',
                'a-floating-live-preview-panel'
            ); ?>">
        </span>
    </footer>
    <?php foreach (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as $edge) : ?>
        <span class="aflpp-edge aflpp-edge-<?php echo esc_attr($edge); ?>"
            data-resize-edge="<?php echo esc_attr($edge); ?>" aria-hidden="true"></span>
    <?php endforeach; ?>
    <div class="aflpp-resize-control">
        <button type="button" class="aflpp-resize"
            aria-label="<?php esc_attr_e('Resize preview', 'a-floating-live-preview-panel'); ?>"
            aria-describedby="aflpp-resize-help"></button>
        <span id="aflpp-resize-help" class="aflpp-resize-help" role="tooltip">
            <?php esc_html_e(
                'Use the arrow keys to change the preview’s size. Hold Shift for bigger steps.',
                'a-floating-live-preview-panel'
            ); ?>
        </span>
    </div>
    <span class="aflpp-sr-only" role="status"></span>
</section>
