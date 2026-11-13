(() => {
    'use strict';

    // Keep ordinary navigation/actions in the editor. Theme JavaScript still runs normally.
    document.addEventListener('click', (event) => {
        const link = event.target.closest?.('a[href], area[href]');
        if (!link) return;
        const target = new URL(link.href, window.location.href);
        const current = new URL(window.location.href);
        if (target.origin === current.origin && target.pathname === current.pathname
            && target.search === current.search && target.hash && !link.hasAttribute('download')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
    document.addEventListener('submit', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
})();
