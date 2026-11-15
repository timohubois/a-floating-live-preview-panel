import {
    caution,
    check,
    chevronDown,
    closeSmall as close,
    desktop,
    dragHandle,
    fullscreen,
    fullscreenExit,
    info,
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
    move: dragHandle,
    warning: caution,
    info,
    close,
    check,
    chevron: chevronDown,
    desktop,
    tablet,
    mobile,
};
