<?php

/**
 * Classic-editor panel markup. JavaScript binds behavior after the footer renders.
 */

defined('ABSPATH') || exit;
?>
<button type="button" id="aflpp-toggle" class="aflpp-launcher" aria-controls="aflpp-panel" aria-expanded="false"
    aria-label="<?php esc_attr_e('Live preview', 'a-floating-live-preview-panel'); ?>"
    title="<?php esc_attr_e('Live preview', 'a-floating-live-preview-panel'); ?>" hidden>
    <span class="aflpp-launcher-icon" aria-hidden="true"></span>
    <span><?php esc_html_e('Live preview', 'a-floating-live-preview-panel'); ?></span>
</button>
<section id="aflpp-panel" class="aflpp-panel" data-state="loading" data-has-preview="false" data-has-feedback="false"
    aria-label="<?php esc_attr_e('Live preview', 'a-floating-live-preview-panel'); ?>" hidden>
    <div class="aflpp-header">
        <div class="aflpp-refresh-control"></div>
        <button type="button" class="aflpp-move" aria-describedby="aflpp-status-tooltip"
            aria-label="<?php esc_attr_e('Move preview: drag or use arrow keys', 'a-floating-live-preview-panel'); ?>">
            <span class="aflpp-dot" aria-hidden="true"></span>
            <span class="aflpp-caption"></span>
        </button>
        <span class="aflpp-status-tooltip" id="aflpp-status-tooltip" role="tooltip"></span>
        <div class="aflpp-controls"></div>
    </div>
    <div class="aflpp-viewport">
        <div class="aflpp-stage"></div>
        <div class="aflpp-empty">
            <div class="aflpp-empty-content">
                <span class="aflpp-spinner" aria-hidden="true"></span>
                <h2 class="aflpp-empty-title" tabindex="-1">
                    <?php esc_html_e('Loading preview…', 'a-floating-live-preview-panel'); ?>
                </h2>
                <p class="aflpp-empty-description" hidden></p>
                <div class="aflpp-empty-actions" hidden>
                    <button type="button" class="aflpp-primary" data-action="retry" hidden>
                        <?php esc_html_e('Try again', 'a-floating-live-preview-panel'); ?>
                    </button>
                    <a class="aflpp-secondary aflpp-open-preview" target="_blank" rel="noopener noreferrer"
                        referrerpolicy="no-referrer" hidden>
                        <?php esc_html_e('Open in new tab', 'a-floating-live-preview-panel'); ?>
                    </a>
                    <button type="button" class="aflpp-secondary" data-action="close" hidden>
                        <?php esc_html_e('Close preview', 'a-floating-live-preview-panel'); ?>
                    </button>
                </div>
                <p class="aflpp-empty-note" hidden></p>
            </div>
        </div>
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
    <div class="aflpp-feedback" hidden>
        <div class="aflpp-feedback-copy" tabindex="0">
            <span class="aflpp-feedback-title"></span>
            <span class="aflpp-feedback-description" hidden></span>
        </div>
        <button type="button" class="aflpp-feedback-action" data-action="retry" hidden>
            <?php esc_html_e('Try again', 'a-floating-live-preview-panel'); ?>
        </button>
        <button type="button" class="aflpp-feedback-action" data-action="close" hidden>
            <?php esc_html_e('Close preview', 'a-floating-live-preview-panel'); ?>
        </button>
        <button type="button" class="aflpp-icon" data-action="dismiss-notice" hidden
            aria-label="<?php esc_attr_e('Dismiss notice', 'a-floating-live-preview-panel'); ?>"
            title="<?php esc_attr_e('Dismiss notice', 'a-floating-live-preview-panel'); ?>">
            <span class="aflpp-dismiss-icon" aria-hidden="true"></span>
        </button>
    </div>
    <span class="aflpp-sr-only" role="status"></span>
    <?php
    $resizeLabels = [
        'n' => __(
            'Resize top edge: drag or use Up/Down arrows; Shift for larger steps.',
            'a-floating-live-preview-panel'
        ),
        'ne' => __(
            'Resize top-right corner: drag or use arrow keys; Shift for larger steps.',
            'a-floating-live-preview-panel'
        ),
        'e' => __(
            'Resize right edge: drag or use Left/Right arrows; Shift for larger steps.',
            'a-floating-live-preview-panel'
        ),
        'se' => __(
            'Resize bottom-right corner: drag or use arrow keys; Shift for larger steps.',
            'a-floating-live-preview-panel'
        ),
        's' => __(
            'Resize bottom edge: drag or use Up/Down arrows; Shift for larger steps.',
            'a-floating-live-preview-panel'
        ),
        'sw' => __(
            'Resize bottom-left corner: drag or use arrow keys; Shift for larger steps.',
            'a-floating-live-preview-panel'
        ),
        'w' => __(
            'Resize left edge: drag or use Left/Right arrows; Shift for larger steps.',
            'a-floating-live-preview-panel'
        ),
        'nw' => __(
            'Resize top-left corner: drag or use arrow keys; Shift for larger steps.',
            'a-floating-live-preview-panel'
        ),
    ];
    ?>
    <?php foreach ($resizeLabels as $edge => $text) : ?>
        <button type="button" class="aflpp-resize aflpp-resize-<?php echo esc_attr($edge); ?>"
            data-edge="<?php echo esc_attr($edge); ?>"
            aria-label="<?php echo esc_attr($text); ?>" title="<?php echo esc_attr($text); ?>"></button>
    <?php endforeach; ?>
</section>
