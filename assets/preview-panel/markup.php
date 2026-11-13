<?php

/**
 * Classic-editor panel markup. JavaScript binds behavior after the footer renders.
 *
 * SVGs: WordPress Contributors, @wordpress/icons 20.0.0, GPL-2.0-or-later.
 * Gutenberg 55ab503b80b1561f48414b2eb209c25b793a9e8a; paths retain their original geometry.
 */

defined('ABSPATH') || exit;
?>
<button type="button" id="aflpp-toggle" class="aflpp-launcher" aria-controls="aflpp-panel" aria-expanded="false"
    aria-label="<?php esc_attr_e('Live preview', 'a-floating-live-preview-panel'); ?>"
    title="<?php esc_attr_e('Live preview', 'a-floating-live-preview-panel'); ?>" hidden>
    <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
        aria-hidden="true" focusable="false">
        <path d="M4.75 16.75V17H3.25C3.11193 17 3 17.1119 3 17.25H21C21 17.1119 20.8881 17 20.75 17
        H19.25V16.75M4.75 16.75V8.5C4.75 7.80964 5.30964 7.25 6 7.25H18
        C18.6904 7.25 19.25 7.80964 19.25 8.5V16.75M4.75 16.75H19.25" />
    </svg>
    <span><?php esc_html_e('Live preview', 'a-floating-live-preview-panel'); ?></span>
</button>
<section id="aflpp-panel" class="aflpp-panel" data-state="loading"
    aria-label="<?php esc_attr_e('Live preview', 'a-floating-live-preview-panel'); ?>" hidden>
    <div class="aflpp-header">
        <button type="button" class="aflpp-icon" data-action="refresh"
            aria-label="<?php esc_attr_e('Refresh preview', 'a-floating-live-preview-panel'); ?>"
            title="<?php esc_attr_e('Refresh preview', 'a-floating-live-preview-panel'); ?>" disabled>
            <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                aria-hidden="true" focusable="false">
                <path d="M12 5.5L17.7929 11.2929C18.1834 11.6834 18.1834 12.3166 17.7929 12.7071L16 14.5
                M16 5.5H12V9.5M12 18.5L6.20711 12.7071
                C5.81658 12.3166 5.81658 11.6834 6.20711 11.2929L8 9.5M8 18.5H12V14.5" />
            </svg>
        </button>
        <button type="button" class="aflpp-move"
            aria-label="<?php esc_attr_e('Move preview: drag or use arrow keys', 'a-floating-live-preview-panel'); ?>">
            <span class="aflpp-dot" aria-hidden="true"></span>
            <span class="aflpp-caption"></span>
        </button>
        <details class="aflpp-actions">
            <summary class="aflpp-icon"
                aria-label="<?php esc_attr_e('Preview actions', 'a-floating-live-preview-panel'); ?>"
                title="<?php esc_attr_e('Preview actions', 'a-floating-live-preview-panel'); ?>">
                <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                    aria-hidden="true" focusable="false">
                    <path d="M18.25 12.25L18.25 11.75L17.75 11.75L17.75 12.25L18.25 12.25Z"
                        fill="currentColor" stroke="none" />
                    <path d="M12.25 12.25L12.25 11.75L11.75 11.75L11.75 12.25L12.25 12.25Z"
                        fill="currentColor" stroke="none" />
                    <path d="M6.25 12.25L6.25 11.75L5.75 11.75L5.75 12.25L6.25 12.25Z"
                        fill="currentColor" stroke="none" />
                    <path d="M18.25 12.25L18.25 11.75L17.75 11.75L17.75 12.25L18.25 12.25Z" />
                    <path d="M12.25 12.25L12.25 11.75L11.75 11.75L11.75 12.25L12.25 12.25Z" />
                    <path d="M6.25 12.25L6.25 11.75L5.75 11.75L5.75 12.25L6.25 12.25Z" />
                </svg>
            </summary>
            <div class="aflpp-commands">
                <div class="aflpp-command-group" role="group" data-group="display"
                    aria-label="<?php esc_attr_e('Display', 'a-floating-live-preview-panel'); ?>">
                    <p class="aflpp-command-heading">
                        <?php esc_html_e('Display', 'a-floating-live-preview-panel'); ?>
                    </p>
                    <a class="aflpp-command aflpp-open-preview" target="_blank" rel="noopener noreferrer"
                        referrerpolicy="no-referrer" hidden>
                        <?php esc_html_e('Open preview in new tab', 'a-floating-live-preview-panel'); ?>
                    </a>
                    <button type="button" class="aflpp-command" data-action="pip"
                        aria-label="<?php esc_attr_e('Pop out preview', 'a-floating-live-preview-panel'); ?>"
                        title="<?php esc_attr_e('Pop out preview', 'a-floating-live-preview-panel'); ?>">
                        <?php esc_html_e('Pop out preview', 'a-floating-live-preview-panel'); ?>
                        <span class="aflpp-command-hint" aria-hidden="true">
                            <?php esc_html_e('PiP', 'a-floating-live-preview-panel'); ?>
                        </span>
                    </button>
                    <button type="button" class="aflpp-command" data-action="fullscreen"
                        aria-label="<?php esc_attr_e('Enter fullscreen', 'a-floating-live-preview-panel'); ?>"
                        title="<?php esc_attr_e('Enter fullscreen', 'a-floating-live-preview-panel'); ?>">
                        <?php esc_html_e('Enter fullscreen', 'a-floating-live-preview-panel'); ?>
                    </button>
                </div>
                <div class="aflpp-command-group" role="group" data-group="layout"
                    aria-label="<?php esc_attr_e('Layout', 'a-floating-live-preview-panel'); ?>">
                    <p class="aflpp-command-heading"><?php esc_html_e('Layout', 'a-floating-live-preview-panel'); ?></p>
                    <button type="button" class="aflpp-command" data-action="dock-left"
                        aria-label="<?php esc_attr_e('Dock bottom left', 'a-floating-live-preview-panel'); ?>"
                        title="<?php esc_attr_e('Dock bottom left', 'a-floating-live-preview-panel'); ?>">
                        <?php esc_html_e('Dock bottom left', 'a-floating-live-preview-panel'); ?>
                    </button>
                    <button type="button" class="aflpp-command" data-action="dock-right"
                        aria-label="<?php esc_attr_e('Dock bottom right', 'a-floating-live-preview-panel'); ?>"
                        title="<?php esc_attr_e('Dock bottom right', 'a-floating-live-preview-panel'); ?>">
                        <?php esc_html_e('Dock bottom right', 'a-floating-live-preview-panel'); ?>
                    </button>
                    <button type="button" class="aflpp-command" data-action="reset"
                        aria-label="<?php esc_attr_e('Reset size and position', 'a-floating-live-preview-panel'); ?>"
                        title="<?php esc_attr_e('Reset size and position', 'a-floating-live-preview-panel'); ?>">
                        <?php esc_html_e('Reset size and position', 'a-floating-live-preview-panel'); ?>
                    </button>
                </div>
                <div class="aflpp-command-group" role="group"
                    aria-label="<?php esc_attr_e('Preferences', 'a-floating-live-preview-panel'); ?>">
                    <p class="aflpp-command-heading">
                        <?php esc_html_e('Preferences', 'a-floating-live-preview-panel'); ?>
                    </p>
                    <button type="button" class="aflpp-command" data-action="remember-visibility" aria-pressed="true"
                        aria-label="<?php esc_attr_e(
                            'Remember preview visibility',
                            'a-floating-live-preview-panel'
                        ); ?>"
                        title="<?php esc_attr_e('Remember preview visibility', 'a-floating-live-preview-panel'); ?>">
                        <?php esc_html_e('Remember preview visibility', 'a-floating-live-preview-panel'); ?>
                        <span class="aflpp-command-check" aria-hidden="true">
                            <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                                aria-hidden="true" focusable="false">
                                <path d="M7 12L10 15L17 8" />
                            </svg>
                        </span>
                    </button>
                    <button type="button" class="aflpp-command" data-action="follow" aria-pressed="true"
                        aria-label="<?php esc_attr_e('Scroll to changes', 'a-floating-live-preview-panel'); ?>"
                        title="<?php esc_attr_e('Scroll to changes', 'a-floating-live-preview-panel'); ?>">
                        <?php esc_html_e('Scroll to changes', 'a-floating-live-preview-panel'); ?>
                        <span class="aflpp-command-check" aria-hidden="true">
                            <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                                aria-hidden="true" focusable="false">
                                <path d="M7 12L10 15L17 8" />
                            </svg>
                        </span>
                    </button>
                </div>
            </div>
        </details>
        <button type="button" class="aflpp-icon aflpp-mode"
            aria-label="<?php esc_attr_e('Expand preview', 'a-floating-live-preview-panel'); ?>"
            title="<?php esc_attr_e('Expand preview', 'a-floating-live-preview-panel'); ?>">
            <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                aria-hidden="true" focusable="false" data-icon="expand">
                <path d="M4.75 10V4.75H10M4.75 4.75L10 10M14 19.25H19.25V14M19.25 19.25L14 14" />
            </svg>
            <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                aria-hidden="true" focusable="false" data-icon="compact" hidden>
                <path d="M10 4.75V10H4.75M10 10L4.75 4.75M19.25 14H14V19.25M14 14L19.25 19.25" />
            </svg>
            <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                aria-hidden="true" focusable="false" data-icon="return" hidden>
                <path d="M14.25 19.25L18 19.25C18.6904 19.25 19.25 18.6904 19.25 18L19.25 6
                C19.25 5.30964 18.6904 4.75 18 4.75L14.25 4.75M14.25 19.25L6 19.25
                C5.30964 19.25 4.75 18.6904 4.75 18L4.75 6C4.75 5.30964 5.30965 4.75 6 4.75
                L14.25 4.75M14.25 19.25L14.25 4.75" />
            </svg>
        </button>
        <button type="button" class="aflpp-icon" data-action="close"
            aria-label="<?php esc_attr_e('Close preview', 'a-floating-live-preview-panel'); ?>"
            title="<?php esc_attr_e('Close preview', 'a-floating-live-preview-panel'); ?>">
            <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                aria-hidden="true" focusable="false">
                <path d="M7.75 16.25L16.25 7.75M16.25 16.25L7.75 7.75" />
            </svg>
        </button>
    </div>
    <div class="aflpp-viewport">
        <div class="aflpp-stage"></div>
        <div class="aflpp-empty"><?php esc_html_e('Loading preview…', 'a-floating-live-preview-panel'); ?></div>
    </div>
    <div class="aflpp-devicebar">
        <div class="aflpp-devices" role="group"
            aria-label="<?php esc_attr_e('Preview viewport', 'a-floating-live-preview-panel'); ?>">
            <button type="button" class="aflpp-icon" data-viewport="desktop" aria-pressed="true"
                aria-label="<?php esc_attr_e('Desktop', 'a-floating-live-preview-panel'); ?>"
                title="<?php esc_attr_e('Desktop', 'a-floating-live-preview-panel'); ?>">
                <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                    aria-hidden="true" focusable="false">
                    <path d="M4.75 16.75V17H3.25C3.11193 17 3 17.1119 3 17.25H21C21 17.1119 20.8881 17 20.75 17
                    H19.25V16.75M4.75 16.75V8.5C4.75 7.80964 5.30964 7.25 6 7.25H18
                    C18.6904 7.25 19.25 7.80964 19.25 8.5V16.75M4.75 16.75H19.25" />
                </svg>
            </button>
            <button type="button" class="aflpp-icon" data-viewport="tablet" aria-pressed="false"
                aria-label="<?php esc_attr_e('Tablet', 'a-floating-live-preview-panel'); ?>"
                title="<?php esc_attr_e('Tablet', 'a-floating-live-preview-panel'); ?>">
                <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                    aria-hidden="true" focusable="false">
                    <path d="M10 16.5H14M18.25 18V6C18.25 5.30964 17.6904 4.75 17 4.75H7
                    C6.30964 4.75 5.75 5.30964 5.75 6L5.75 18C5.75 18.6904 6.30964 19.25 7 19.25H17
                    C17.6904 19.25 18.25 18.6904 18.25 18Z" />
                </svg>
            </button>
            <button type="button" class="aflpp-icon" data-viewport="mobile" aria-pressed="false"
                aria-label="<?php esc_attr_e('Mobile', 'a-floating-live-preview-panel'); ?>"
                title="<?php esc_attr_e('Mobile', 'a-floating-live-preview-panel'); ?>">
                <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                    aria-hidden="true" focusable="false">
                    <path d="M11 16.5H13M16.25 18V6C16.25 5.30964 15.6904 4.75 15 4.75H9
                    C8.30964 4.75 7.75 5.30964 7.75 6L7.75 18C7.75 18.6904 8.30964 19.25 9 19.25H15
                    C15.6904 19.25 16.25 18.6904 16.25 18Z" />
                </svg>
            </button>
        </div>
        <span class="aflpp-dimensions"
            title="<?php esc_attr_e(
                'Viewport width and scale; not device emulation.',
                'a-floating-live-preview-panel'
            ); ?>">
        </span>
    </div>
    <div class="aflpp-feedback" hidden>
        <span class="aflpp-error"></span>
        <button type="button" class="aflpp-icon" data-action="retry"
            aria-label="<?php esc_attr_e('Retry', 'a-floating-live-preview-panel'); ?>"
            title="<?php esc_attr_e('Retry', 'a-floating-live-preview-panel'); ?>">
            <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                aria-hidden="true" focusable="false" data-icon="retry">
                <path d="M12 5.5L17.7929 11.2929C18.1834 11.6834 18.1834 12.3166 17.7929 12.7071L16 14.5
                M16 5.5H12V9.5M12 18.5L6.20711 12.7071
                C5.81658 12.3166 5.81658 11.6834 6.20711 11.2929L8 9.5M8 18.5H12V14.5" />
            </svg>
            <svg viewBox="0 0 24 24" style="fill: none" stroke="currentColor" stroke-width="1.5"
                aria-hidden="true" focusable="false" data-icon="takeover" hidden>
                <path d="M11 18H15.5C16.6046 18 17.5 17.1046 17.5 16V13.25M15 15.25L17.5 13.25L20 15.25
                M13 6.25L8.5 6.25C7.39543 6.25 6.5 7.14543 6.5 8.25L6.5 11M9 9L6.5 11L4 9M5 19.25H8
                C8.69036 19.25 9.25 18.6904 9.25 18V15C9.25 14.3096 8.69036 13.75 8 13.75H5
                C4.30964 13.75 3.75 14.3096 3.75 15V18C3.75 18.6904 4.30964 19.25 5 19.25ZM16 10.25
                H19C19.6904 10.25 20.25 9.69036 20.25 9V6C20.25 5.30964 19.6904 4.75 19 4.75H16
                C15.3096 4.75 14.75 5.30964 14.75 6V9C14.75 9.69036 15.3096 10.25 16 10.25Z" />
            </svg>
            <span class="aflpp-retry-label" hidden></span>
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
