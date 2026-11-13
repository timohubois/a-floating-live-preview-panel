import {
    check,
    closeSmall as close,
    desktop,
    fullscreen,
    fullscreenExit,
    mobile,
    moreVertical,
    navigationOverlay,
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
    close,
    check,
    desktop,
    tablet,
    mobile,
};
