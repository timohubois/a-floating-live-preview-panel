// Preferred window geometry only. Viewport fitting is temporary and never rewrites saved dimensions.
export function createPanelGeometry(saved, mainWindow) {
    const validLayout = saved && !Array.isArray(saved) && saved.bounds
        && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(saved.bounds[key]))
        && saved.bounds.width > 0 && saved.bounds.height > 0
        && [null, 'left', 'center', 'right'].includes(saved.dock) && typeof saved.expanded === 'boolean'
        && (saved.anchor === undefined || ['left', 'center', 'right'].includes(saved.anchor));
    let expanded = validLayout ? saved.expanded : false;
    const sizes = { small: { width: 480, height: 340 }, large: { width: 640, height: 440 } };
    const bounds = validLayout ? { ...saved.bounds } : { x: 0, y: 0, ...sizes.small };
    let dock = validLayout ? saved.dock : 'right';
    // Keep the same collapse/resize corner when dragging away from a dock. Older layouts default to the right.
    let anchor = dock || (validLayout && saved.anchor) || 'right';
    const anchorFactor = () => anchor === 'left' ? 0 : anchor === 'center' ? 0.5 : 1;

    // Collapse the margins too on very small windows; never use an off-screen minimum.
    function area(gap = 16, top = 48) {
        const width = Math.max(1, mainWindow.innerWidth);
        const height = Math.max(1, mainWindow.innerHeight);
        const left = Math.min(gap, (width - 1) / 2);
        top = Math.min(top, height - 1);
        const right = width - left;
        const bottom = height - Math.min(gap, height - top - 1);
        return { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    function fit(next) {
        const available = area();
        next.width = Math.min(available.width, Math.max(Math.min(320, available.width), next.width));
        next.height = Math.min(available.height, Math.max(Math.min(220, available.height), next.height));
        next.x = Math.max(available.left, Math.min(available.right - next.width, next.x));
        next.y = Math.max(available.top, Math.min(available.bottom - next.height, next.y));
        return next;
    }

    function compactRect() {
        const rect = fit({ ...bounds });
        if (dock) {
            const available = area();
            rect.x = dock === 'left' ? available.left
                : dock === 'center' ? (mainWindow.innerWidth - rect.width) / 2 : available.right - rect.width;
            rect.y = available.bottom - rect.height;
        }
        return rect;
    }

    function dockTo(side = 'right', resetSize = false) {
        if (resetSize) Object.assign(bounds, sizes.small);
        expanded = false;
        anchor = dock = side;
    }

    function setSize(name) {
        if (!Object.hasOwn(sizes, name)) return false;
        const rect = compactRect();
        Object.assign(bounds, sizes[name], {
            x: rect.x + (rect.width - sizes[name].width) * anchorFactor(),
            y: rect.y + rect.height - sizes[name].height,
        });
        expanded = false;
        return true;
    }

    // Docked edges that cannot move must not advertise a resize cursor or eat pointer input.
    function usableEdge(edge) {
        return !dock || (!edge.includes('s') && !(dock === 'left' && edge.includes('w'))
            && !(dock === 'right' && edge.includes('e')));
    }

    // Physical edges are independent of text direction. Center anchoring grows symmetrically.
    function resizeBounds(start, edge, dx, dy) {
        const available = area();
        const horizontal = edge.includes('e') || edge.includes('w');
        const vertical = edge.includes('n') || edge.includes('s');
        const factor = anchor === 'center' ? 0.5 : edge.includes('w') ? 1 : 0;
        const pinX = start.x + start.width * factor;
        const fromTop = edge.includes('n');
        const pinY = start.y + (fromTop ? start.height : 0);
        const maxWidth = factor === 0 ? available.right - pinX : factor === 1
            ? pinX - available.left : 2 * Math.min(pinX - available.left, available.right - pinX);
        const maxHeight = fromTop ? pinY - available.top : available.bottom - pinY;
        const widthDelta = (edge.includes('w') ? -dx : dx) * (factor === 0.5 ? 2 : 1);
        const width = Math.max(Math.min(320, maxWidth), Math.min(maxWidth, start.width + widthDelta));
        const height = Math.max(Math.min(220, maxHeight), Math.min(maxHeight, start.height + (fromTop ? -dy : dy)));
        const widthChanged = horizontal && dx !== 0 && width !== start.width;
        const heightChanged = vertical && dy !== 0 && height !== start.height;
        // Untouched axes retain preferred coordinates too, not their temporary viewport fit.
        return {
            x: widthChanged ? pinX - width * factor : start.preferredBounds.x,
            y: heightChanged ? (fromTop ? pinY - height : pinY) : start.preferredBounds.y,
            width: widthChanged ? width : start.preferredBounds.width,
            height: heightChanged ? height : start.preferredBounds.height,
        };
    }

    function moveBounds(start, dx, dy) {
        const rect = fit({ ...start, x: start.x + dx, y: start.y + dy });
        // Moving never turns temporary viewport fitting into a new preferred size.
        bounds.x = rect.x;
        bounds.y = rect.y;
        dock = null;
    }

    return {
        area,
        compactRect,
        usableEdge,
        get anchor() { return anchor; },
        get anchorFactor() { return anchorFactor(); },
        get dock() { return dock; },
        get expanded() { return expanded; },
        get size() {
            return expanded ? undefined : Object.keys(sizes).find((name) =>
                bounds.width === sizes[name].width && bounds.height === sizes[name].height
            );
        },
        get layout() { return { bounds: { ...bounds }, dock, anchor, expanded }; },
        toggleExpanded() { expanded = !expanded; },
        dockTo,
        setSize,
        resize(start, edge, dx, dy) { Object.assign(bounds, resizeBounds(start, edge, dx, dy)); },
        move: moveBounds,
    };
}
