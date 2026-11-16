export default {
    rules: {
        'declaration-block-no-duplicate-properties': true,
        'declaration-block-single-line-max-declarations': 1,
        'property-disallowed-list': [
            'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
            'top', 'right', 'bottom', 'left',
            '/^(margin|padding)-(top|right|bottom|left)$/',
            '/^border-(top|right|bottom|left)(-|$)/',
        ],
    },
};
