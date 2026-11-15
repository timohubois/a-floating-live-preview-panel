// Scroll presentation is independent of comparison state and editor values.
export function createPreviewScroll() {
    let position = 0;
    return {
        remember(doc) {
            try { if (doc) position = doc.defaultView.scrollY; }
            catch { /* Keep the last HTML offset if its document is no longer readable. */ }
        },
        restore(doc, element) {
            try {
                const frameWindow = doc.defaultView;
                frameWindow.scrollTo({ top: position, left: 0, behavior: 'instant' });
                const target = visibleTarget(element);
                if (target) revealChange(target);
                position = frameWindow.scrollY;
            } catch { /* Displaying native output does not depend on HTML enhancements. */ }
        },
    };
}

// Resolve only the identified element's presentation, never choose between unrelated changes.
function visibleTarget(element) {
    if (!element) return null;
    for (const node of [element, ...element.querySelectorAll('*')]) {
        if (isVisible(node)) return node;
    }
    for (let node = element.parentElement; node; node = node.parentElement) {
        if (isVisible(node)) return node;
    }
    return null;
}

function isVisible(node) {
    return !!node?.getClientRects().length
        && node.ownerDocument.defaultView.getComputedStyle(node).visibility === 'visible';
}

// Decide clearance up front: one native reveal, with no delayed adjustment or scroll listeners.
function revealChange(target) {
    const doc = target.ownerDocument;
    const win = doc.defaultView;
    const margin = win.getComputedStyle(target).scrollMarginTop;
    const header = visibleHeaderBottom(target);
    const viewportHeight = doc.documentElement.clientHeight;
    const padding = win.getComputedStyle(doc.documentElement);
    const paddingTop = scrollPaddingPixels(padding.scrollPaddingTop, viewportHeight);
    const paddingBottom = scrollPaddingPixels(padding.scrollPaddingBottom, viewportHeight);
    // Site padding and margin already contribute to clearance; do not add header height twice.
    const clearance = header > 0 && paddingTop !== null ? `max(${margin}, ${header - paddingTop}px)` : margin;
    const original = target.getAttribute('style');
    try {
        target.style.setProperty('scroll-margin-top', `calc(${clearance} + 1lh)`, 'important');
        const offsets = win.getComputedStyle(target);
        // Leave CSS math to native scrolling: unknown padding conservatively keeps the beginning visible.
        let block = 'start';
        if (paddingTop !== null && paddingBottom !== null) {
            const availableHeight = viewportHeight - paddingTop - paddingBottom
                - parseFloat(offsets.scrollMarginTop) - parseFloat(offsets.scrollMarginBottom);
            if (target.getBoundingClientRect().height <= availableHeight) block = 'center';
        }
        target.scrollIntoView({ behavior: 'auto', block, inline: 'nearest' });
    } finally {
        // Restore exact styles through the attribute API before removing an originally absent attribute:
        // otherwise pending CSSOM changes can recreate it as style="".
        target.setAttribute('style', original ?? '');
        if (original === null) target.removeAttribute('style');
    }
}

function scrollPaddingPixels(value, height) {
    if (value === 'auto') return 0;
    const length = parseFloat(value);
    return Number.isFinite(length) ? length * (value.endsWith('%') ? height / 100 : 1) : null;
}

// Sample the viewport's top edge for a currently visible fixed/stuck header, not future header states.
function visibleHeaderBottom(target) {
    const doc = target.ownerDocument;
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    for (let node = doc.elementFromPoint(x, 1); node && !node.contains(target); node = node.parentElement) {
        const style = doc.defaultView.getComputedStyle(node);
        if (style.position !== 'fixed' && style.position !== 'sticky') continue;
        const box = node.getBoundingClientRect();
        if (style.position === 'fixed' || box.top <= parseFloat(style.top) + 1) return box.bottom;
    }
    return 0;
}
