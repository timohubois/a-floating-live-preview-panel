// Optional HTML scrolling. The coordinator supplies only token-verified preview documents.
export function createPreviewScroll(excludedSelectors = []) {
    // PHP supplies the complete policy. An empty list is intentional; do not restore hidden defaults here.
    const selectors = Array.isArray(excludedSelectors) ? [...excludedSelectors] : [];
    let position = 0;
    const snapshots = new WeakMap();
    function snapshot(doc) {
        if (!snapshots.has(doc)) {
            const source = sourceDocument(doc);
            snapshots.set(doc, { captured: !!source, content: contentSnapshot(source || doc, doc, selectors) });
        }
        return snapshots.get(doc);
    }

    return {
        remember(doc) {
            try { if (doc) position = doc.defaultView.scrollY; }
            catch { /* Keep the last HTML offset if its document is no longer readable. */ }
        },
        findTarget(previous, next) {
            try {
                const before = snapshot(previous);
                const after = snapshot(next);
                // Never compare untouched source with a script-modified DOM when capture availability changes.
                return before.captured === after.captured ? changedTarget(before.content, after.content) : null;
            } catch { return null; } // A changing document may not have a comparable snapshot.
        },
        restore(doc, target) {
            try {
                // Prefer the response's pre-script source; otherwise freeze the DOM before our own scrolling.
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

// The payload is data from this verified response, never inserted into the live DOM or executed.
function sourceDocument(doc) {
    try {
        const marker = doc.querySelector('meta[name="a-floating-live-preview-panel"]');
        const payload = marker?.getAttribute('data-aflpp-source');
        if (!payload) return null;
        const html = JSON.parse(payload);
        if (typeof html !== 'string') return null;
        const source = new DOMParser().parseFromString(html, 'text/html');
        return source.querySelector('meta[name="a-floating-live-preview-panel"]')?.content === marker.content ? source : null;
    } catch { return null; } // Missing/invalid data or a restrictive Trusted Types policy uses the DOM fallback.
}

// Compare content and presentation without theme/field knowledge or viewport-dependent geometry.
function contentSnapshot(doc, live, excludedSelectors) {
    const root = doc.querySelector('main, [role="main"]') || doc.querySelector('article') || doc.body;
    if (!root) return null;
    // Validate CSS once per cached snapshot, not for every node. Bad extension selectors remain inert.
    const excluded = excludedSelectors.filter((selector) => {
        if (typeof selector !== 'string' || !selector.trim()) return false;
        try { root.matches(selector); return true; }
        catch { return false; }
    }).join(', ');
    const entries = new Map();
    const targets = new Map();
    if (doc !== live) {
        for (const node of live.querySelectorAll('[data-aflpp-node]')) {
            const key = node.getAttribute('data-aflpp-node');
            // Cloned markers are ambiguous; never silently choose the first matching widget.
            targets.set(key, targets.has(key) ? null : node);
        }
    }
    for (const node of [root, ...root.querySelectorAll('*')]) {
        if (excluded && node.closest(excluded)) continue;
        const text = [...node.childNodes].filter((child) => child.nodeType === 3)
            .map((child) => child.textContent).join(' ').replace(/\s+/g, ' ').trim();
        const media = ['img', 'source', 'video', 'audio', 'iframe'].includes(node.localName)
            ? ['src', 'srcset', 'poster'].map((name) => node.getAttribute(`data-${name}`) || node.getAttribute(name) || '')
            : [];
        const background = node.style?.backgroundImage || node.getAttribute('data-bg') || '';
        // Include empty wrappers: layout/structure changes need not alter text or media.
        const target = doc === live ? node : targets.get(node.getAttribute('data-aflpp-node')) || null;
        const entry = { node: target, signature: JSON.stringify([node.localName, text, media, background]),
            presentation: JSON.stringify(presentationAttributes(node)), children: [] };
        entries.set(node, entry);
        entries.get(node.parentElement)?.children.push(entry);
    }
    let snapshot = entries.get(root);
    if (!snapshot) return null;
    // Ancestor attributes can control layout; their unrelated siblings/text are not preview content.
    const target = snapshot.node;
    for (let node = root.parentElement; node; node = node.parentElement) {
        snapshot = { node: target, signature: node.localName,
            presentation: JSON.stringify(presentationAttributes(node)), children: [snapshot] };
    }
    return snapshot;
}

function presentationAttributes(node) {
    const attributes = [];
    for (const { name, value } of node.attributes) {
        // Generated IDs, security values and interactive accessibility state are not edited content.
        if (name === 'id' || name === 'data-aflpp-node' || name.startsWith('on') || name.startsWith('aria-')
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
    // Intern exact subtree identities for this comparison, without quadratic subtree strings,
    // probabilistic hashes or a persistent index retaining previous documents/content.
    const identities = new Map();
    const keys = new Map();
    function identify(entry) {
        if (!entry) return 0;
        const signature = JSON.stringify([entry.signature, entry.children.map(identify)]);
        if (!identities.has(signature)) identities.set(signature, identities.size + 1);
        const key = identities.get(signature);
        keys.set(entry, key);
        return key;
    }
    // Content/structure wins over runtime presentation. Only compare attributes if content matches.
    const presentationOnly = identify(previous) === identify(next);
    let target = null;
    let ambiguous = false;
    let container = null;
    let containerAmbiguous = false;
    function select(entry) {
        const node = visibleTarget(entry);
        if (!node) { selectContainer(entry); return; }
        if (target && target !== node) ambiguous = true;
        target = node;
    }
    function selectContainer(entry) {
        const fallback = isVisible(entry?.node) ? entry.node : visibleContainer(entry);
        if (!fallback) return;
        if (container && container !== fallback) containerAmbiguous = true;
        container = fallback;
    }
    function positions(entries) {
        const result = new Map();
        entries.forEach((entry, index) => {
            const key = keys.get(entry);
            result.set(key, result.has(key) ? -1 : index);
        });
        return result;
    }
    function compare(before, after) {
        if (ambiguous || !after) return;
        if (!before) { select(after); return; }
        if (presentationOnly) {
            if (before.presentation !== after.presentation) select(after);
            before.children.forEach((child, index) => compare(child, after.children[index]));
        } else if (keys.get(before) !== keys.get(after)) {
            if (before.signature !== after.signature) select(after);
            else align(before.children, after.children, after);
        }
    }
    function align(before, after, parent) {
        const oldPositions = positions(before);
        const newPositions = positions(after);
        function range(oldStart, oldEnd, newStart, newEnd) {
            if (ambiguous) return;
            while (oldStart < oldEnd && newStart < newEnd
                && keys.get(before[oldStart]) === keys.get(after[newStart])) { oldStart += 1; newStart += 1; }
            while (oldStart < oldEnd && newStart < newEnd
                && keys.get(before[oldEnd - 1]) === keys.get(after[newEnd - 1])) { oldEnd -= 1; newEnd -= 1; }
            if (oldStart === oldEnd && newStart === newEnd) return;
            if (oldStart === oldEnd || newStart === newEnd) {
                const deleted = newStart === newEnd;
                const changed = deleted ? before.slice(oldStart, oldEnd) : after.slice(newStart, newEnd);
                const boundary = deleted ? [after[newStart - 1], after[newStart]] : [before[oldStart - 1], before[oldStart]];
                // Adjacent identical sections cannot locate an edit. Repeats separated by unchanged
                // content still have usable context and must not be rejected just for repeating.
                if (changed.some((entry) => boundary.some((neighbor) => neighbor && keys.get(neighbor) === keys.get(entry)))) {
                    ambiguous = true;
                    return;
                }
                if (deleted) {
                    if (changed.some(visibleTarget)) {
                        const following = after.slice(newStart);
                        const preceding = after.slice(0, newStart).reverse();
                        select(following.find(visibleTarget) || preceding.find(visibleTarget)
                            || following.find(visibleContainer) || preceding.find(visibleContainer) || parent);
                    } else if (changed.some(visibleContainer)) selectContainer(parent);
                } else {
                    const entry = changed.find(visibleTarget) || changed.find(visibleContainer);
                    if (entry) select(entry);
                }
                return;
            }
            if (oldEnd - oldStart === 1 && newEnd - newStart === 1) {
                compare(before[oldStart], after[newStart]);
                return;
            }
            // Unique unchanged siblings anchor separate edit ranges. Crossing anchors indicate
            // reordering; without editor-to-output mapping, choosing the moved section is a guess.
            const anchors = [];
            for (let index = oldStart; index < oldEnd; index += 1) {
                const key = keys.get(before[index]);
                const match = newPositions.get(key);
                if (oldPositions.get(key) !== index || match === undefined || match < newStart || match >= newEnd) continue;
                if (anchors.length && match <= anchors[anchors.length - 1][1]) { ambiguous = true; return; }
                anchors.push([index, match]);
            }
            if (!anchors.length) { ambiguous = true; return; }
            for (const [oldIndex, newIndex] of [...anchors, [oldEnd, newEnd]]) {
                range(oldStart, oldIndex, newStart, newIndex);
                oldStart = oldIndex + 1;
                newStart = newIndex + 1;
            }
        }
        range(0, before.length, 0, after.length);
    }
    compare(previous, next);
    // A container is only a fallback: hidden changes must not veto a directly visible edit.
    if (ambiguous || (!target && containerAmbiguous)) return null;
    return target || container;
}

function visibleTarget(entry) {
    if (!entry) return null;
    if (isVisible(entry.node)) return entry.node;
    // Boxless wrappers can expose visible descendants without a box of their own.
    for (const child of entry.children) {
        const target = visibleTarget(child);
        if (target) return target;
    }
    return null;
}

function visibleContainer(entry) {
    for (let node = entry?.node?.parentElement; node; node = node.parentElement) {
        if (isVisible(node)) return node;
    }
    return null;
}

function isVisible(node) {
    return !!node?.getClientRects().length
        && node.ownerDocument.defaultView.getComputedStyle(node).visibility === 'visible';
}
