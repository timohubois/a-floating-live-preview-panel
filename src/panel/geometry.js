// Preferred window geometry only. Viewport fitting is temporary and never rewrites saved dimensions.
export function createPanelGeometry(saved, area, position = 'right') {
    const validLayout = saved && !Array.isArray(saved) && saved.bounds
        && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(saved.bounds[key]))
        && saved.bounds.width > 0 && saved.bounds.height > 0
        && [null, 'left', 'center', 'right'].includes(saved.dock) && typeof saved.expanded === 'boolean'
        && (saved.anchor === undefined || ['left', 'center', 'right'].includes(saved.anchor));
    let expanded = validLayout ? saved.expanded : false;
    // 480 × 300 canvas plus the 44px header and 49px footer.
    const defaultSize = { width: 480, height: 393 };
    const bounds = validLayout ? { ...saved.bounds } : { x: 0, y: 0, ...defaultSize };
    let dock = validLayout ? saved.dock : position;
    // Keep the same collapse/resize corner when dragging away from a dock. Older layouts default to the right.
    let anchor = dock || (validLayout && saved.anchor) || 'right';
    function anchorFactor() {
        if (anchor === 'left') return 0;
        if (anchor === 'center') return 0.5;
        return 1;
    }

    function fit(next, available = area(!dock), minimumWidth = 320, minimumHeight = 220) {
        next.width = Math.min(available.width, Math.max(Math.min(minimumWidth, available.width), next.width));
        next.height = Math.min(available.height, Math.max(Math.min(minimumHeight, available.height), next.height));
        next.x = Math.max(available.left, Math.min(available.right - next.width, next.x));
        next.y = Math.max(available.top, Math.min(available.bottom - next.height, next.y));
        return next;
    }

    function dockedRect(rect) {
        if (!dock) return rect;
        const available = area();
        if (dock === 'left') {
            rect.x = available.left;
        } else if (dock === 'center') {
            rect.x = available.left + (available.width - rect.width) / 2;
        } else {
            rect.x = available.right - rect.width;
        }
        rect.y = available.bottom - rect.height;
        return rect;
    }

    function compactRect() {
        return dockedRect(fit({ ...bounds }));
    }

    function launcherRect(size) {
        // Fit the visible launcher, not its hidden panel. Keep their preferred corner shared even
        // when opening the larger panel temporarily fits it away from that corner.
        return dockedRect(fit({
            ...size,
            x: bounds.x + (bounds.width - size.width) * anchorFactor(),
            y: bounds.y + bounds.height - size.height,
        }, area(!dock), 1, 1));
    }

    function dockTo(side = 'right', resetSize = false) {
        if (resetSize) Object.assign(bounds, defaultSize);
        expanded = false;
        anchor = dock = side;
    }

    // Docked edges that cannot move must not advertise a resize cursor or eat pointer input.
    function usableEdge(edge) {
        return !dock || (!edge.includes('s') && !(dock === 'left' && edge.includes('w'))
            && !(dock === 'right' && edge.includes('e')));
    }

    function resizeFactor(edge) {
        if (anchor === 'center') return 0.5;
        return edge.includes('w') ? 1 : 0;
    }

    function availableWidth(available, pinX, factor) {
        if (factor === 0) return available.right - pinX;
        if (factor === 1) return pinX - available.left;
        return 2 * Math.min(pinX - available.left, available.right - pinX);
    }

    // Physical edges are independent of text direction. Center anchoring grows symmetrically.
    function resizeBounds(start, edge, dx, dy) {
        const available = area(!dock);
        const horizontal = edge.includes('e') || edge.includes('w');
        const vertical = edge.includes('n') || edge.includes('s');
        const factor = resizeFactor(edge);
        const pinX = start.x + start.width * factor;
        const fromTop = edge.includes('n');
        const pinY = start.y + (fromTop ? start.height : 0);
        const maxWidth = availableWidth(available, pinX, factor);
        const maxHeight = fromTop ? pinY - available.top : available.bottom - pinY;
        const widthDelta = (edge.includes('w') ? -dx : dx) * (factor === 0.5 ? 2 : 1);
        const width = Math.max(Math.min(320, maxWidth), Math.min(maxWidth, start.width + widthDelta));
        const height = Math.max(Math.min(220, maxHeight), Math.min(maxHeight, start.height + (fromTop ? -dy : dy)));
        const widthChanged = horizontal && dx !== 0 && width !== start.width;
        const heightChanged = vertical && dy !== 0 && height !== start.height;
        const y = fromTop ? pinY - height : pinY;
        // Untouched axes retain preferred coordinates too, not their temporary viewport fit.
        return {
            x: widthChanged ? pinX - width * factor : start.preferredBounds.x,
            y: heightChanged ? y : start.preferredBounds.y,
            width: widthChanged ? width : start.preferredBounds.width,
            height: heightChanged ? height : start.preferredBounds.height,
        };
    }

    function moveBounds(start, dx, dy, launcher = false) {
        const rect = fit({ ...start, x: start.x + dx, y: start.y + dy }, area(true), launcher ? 1 : 320, launcher ? 1 : 220);
        // Moving never turns temporary viewport fitting into a new preferred size.
        bounds.x = rect.x + (launcher ? (rect.width - bounds.width) * anchorFactor() : 0);
        bounds.y = rect.y + (launcher ? rect.height - bounds.height : 0);
        dock = null;
    }

    return {
        area,
        compactRect,
        launcherRect,
        usableEdge,
        get anchor() { return anchor; },
        get anchorFactor() { return anchorFactor(); },
        get dock() { return dock; },
        get expanded() { return expanded; },
        get layout() { return { bounds: { ...bounds }, dock, anchor, expanded }; },
        toggleExpanded() { expanded = !expanded; },
        dockTo,
        resize(start, edge, dx, dy) { Object.assign(bounds, resizeBounds(start, edge, dx, dy)); },
        move: moveBounds,
    };
}
