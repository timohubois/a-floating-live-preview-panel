import {
    check,
    closeSmall as close,
    desktop,
    fullscreen,
    fullscreenExit,
    mobile,
    moreVertical,
    navigationOverlay,
    resizeCornerNE,
    tablet,
    update,
} from '@wordpress/icons';

// WordPress's build bundles only these official icon elements and externalizes its runtime.
export const icons = {
    refresh: update,
    more: moreVertical,
    expand: fullscreen,
    compact: fullscreenExit,
    pip: navigationOverlay,
    resize: resizeCornerNE,
    close,
    check,
    desktop,
    tablet,
    mobile,
};
