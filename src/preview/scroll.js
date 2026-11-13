// Optional HTML scrolling. The coordinator supplies only token-verified preview documents.
export function createPreviewScroll() {
    let position = 0;
    const snapshots = new WeakMap();
    function snapshot(doc) {
        if (!snapshots.has(doc)) snapshots.set(doc, contentSnapshot(doc));
        return snapshots.get(doc);
    }

    return {
        remember(doc) {
            try { if (doc) position = doc.defaultView.scrollY; }
            catch { /* Keep the last HTML offset if its document is no longer readable. */ }
        },
        findTarget(previous, next) {
            try { return changedTarget(snapshot(previous), snapshot(next)); }
            catch { return null; } // A changing document may not have a comparable snapshot.
        },
        restore(doc, target) {
            try {
                // Compare each document at load, before scrolling triggers lazy loading or animation.
                snapshot(doc);
                const frameWindow = doc.defaultView;
                frameWindow.scrollTo({ top: position, left: 0, behavior: 'instant' });
                if (target) revealChange(target);
                position = frameWindow.scrollY;
            } catch { /* Displaying native output does not depend on HTML enhancements. */ }
        },
    };
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

// Compare content and presentation without theme/field knowledge or viewport-dependent geometry.
function contentSnapshot(doc) {
    const root = doc.querySelector('main, [role="main"]') || doc.querySelector('article') || doc.body;
    if (!root) return [];
    const entries = [];
    // Ancestor attributes can control the content's layout; ignore their unrelated siblings/text.
    for (let node = root.parentElement; node; node = node.parentElement) {
        entries.unshift({ node: root, signature: JSON.stringify([node.localName, presentationAttributes(node)]) });
    }
    const depths = new Map([[root, 0]]);
    for (const node of [root, ...root.querySelectorAll('*')]) {
        if (node.closest('script, style, noscript, template, link, meta, nav, [role="navigation"], [aria-live], input[type="hidden"]')) continue;
        const depth = node === root ? 0 : depths.get(node.parentElement) + 1;
        depths.set(node, depth);
        const text = [...node.childNodes].filter((child) => child.nodeType === 3)
            .map((child) => child.textContent).join(' ').replace(/\s+/g, ' ').trim();
        const media = ['img', 'source', 'video', 'audio', 'iframe'].includes(node.localName)
            ? ['src', 'srcset', 'poster'].map((name) => node.getAttribute(`data-${name}`) || node.getAttribute(name) || '')
            : [];
        const background = node.style?.backgroundImage || node.getAttribute('data-bg') || '';
        // Include empty wrappers: layout/structure changes need not alter text or media.
        entries.push({ node, signature: JSON.stringify([depth, node.localName, text, media, background, presentationAttributes(node)]) });
    }
    return entries;
}

function presentationAttributes(node) {
    const attributes = [];
    for (const { name, value } of node.attributes) {
        // Generated IDs, security values and interactive accessibility state are not edited content.
        if (name === 'id' || name.startsWith('on') || name.startsWith('aria-')
            || /(?:^|-)(nonce|token)(?:-|$)/.test(name)) continue;
        // Media sources are normalized separately, so loading a declared lazy source is not an edit.
        if (/^(?:data-)?(?:src|srcset|poster|sizes|bg)$/.test(name)) continue;
        let normalized = value;
        if (name === 'class') normalized = [...node.classList].sort().join(' ');
        if (name === 'style') {
            normalized = [...node.style].sort().map((property) => [
                property, node.style.getPropertyValue(property), node.style.getPropertyPriority(property),
            ]);
        }
        if ((name === 'class' || name === 'style') && !normalized.length) continue;
        attributes.push([name, normalized]);
    }
    return attributes.sort(([a], [b]) => a.localeCompare(b));
}

function changedTarget(previous, next) {
    let index = 0;
    while (index < previous.length && index < next.length && previous[index].signature === next[index].signature) index += 1;
    if (index === previous.length && index === next.length) return null;
    // Deletions land on the next surviving content, or the preceding item at the end.
    let target = next[Math.min(index, next.length - 1)]?.node;
    while (target && !target.getClientRects().length) target = target.parentElement;
    return target;
}
