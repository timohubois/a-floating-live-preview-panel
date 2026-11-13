<?php

/**
 * Classic-editor floating shell. Public WordPress components render its controls and feedback.
 */

defined('ABSPATH') || exit;
?>
<button type="button" id="aflpp-toggle" class="aflpp-launcher" aria-controls="aflpp-panel" aria-expanded="false"
    aria-label="<?php esc_attr_e('Live preview', 'a-floating-live-preview-panel'); ?>"
    title="<?php esc_attr_e('Live preview', 'a-floating-live-preview-panel'); ?>"
    aria-description="<?php esc_attr_e(
        'Drag or use arrow keys to move; Shift for larger steps.',
        'a-floating-live-preview-panel'
    ); ?>" hidden>
    <span class="aflpp-launcher-icon" aria-hidden="true"></span>
    <span><?php esc_html_e('Live preview', 'a-floating-live-preview-panel'); ?></span>
</button>
<section id="aflpp-panel" class="aflpp-panel" data-state="loading" data-has-preview="false" data-has-feedback="false"
    aria-label="<?php esc_attr_e('Live preview', 'a-floating-live-preview-panel'); ?>" hidden>
    <div class="aflpp-header">
        <div class="aflpp-move-control"></div>
        <div class="aflpp-refresh-control"></div>
        <div class="aflpp-titlebar">
            <span class="aflpp-caption"></span>
        </div>
        <div class="aflpp-controls"></div>
    </div>
    <div class="aflpp-feedback" hidden></div>
    <div class="aflpp-viewport">
        <div class="aflpp-stage"></div>
        <div class="aflpp-empty"></div>
        <div class="aflpp-pip-control"></div>
    </div>
    <div class="aflpp-devicebar" hidden>
        <div class="aflpp-device-controls"></div>
        <span class="aflpp-dimensions"
            title="<?php esc_attr_e(
                'Viewport width and scale; not device emulation.',
                'a-floating-live-preview-panel'
            ); ?>">
        </span>
    </div>
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
                'Use arrow keys to resize; Shift for larger steps.',
                'a-floating-live-preview-panel'
            ); ?>
        </span>
    </div>
    <span class="aflpp-sr-only" role="status"></span>
</section>
