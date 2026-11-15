// Fixed CSS viewport geometry; the surrounding canvas changes only its visual zoom.
export function createPreviewViewport(container, stage, dimensions, saved = {}) {
    const mainWindow = container.ownerDocument.defaultView;
    const canvas = container.querySelector('.aflpp-canvas');
    const space = container.querySelector('.aflpp-canvas-space');
    const sizes = { desktop: [1280, 800], tablet: [768, 1024], mobile: [390, 844] };
    const presets = Object.keys(sizes);
    let device = presets.includes(saved.device) ? saved.device : 'desktop';
    const fits = ['automatic', 'window', 'width'];
    let fit = fits.includes(saved.fit) ? saved.fit : 'automatic';
    const defaultOrientation = (name) => name === 'desktop' ? 'landscape' : 'portrait';
    const orientations = Object.fromEntries(presets.map((name) => [
        name, name !== 'desktop' && ['portrait', 'landscape'].includes(saved[`${name}Orientation`])
            ? saved[`${name}Orientation`] : defaultOrientation(name),
    ]));
    const size = () => orientations[device] === defaultOrientation(device) ? sizes[device] : [...sizes[device]].reverse();
    let scale;
    let animation;
    let removeResolutionListener;
    const motion = mainWindow.matchMedia('(prefers-reduced-motion: no-preference)');

    function pixelRatio() {
        const ratio = container.ownerDocument.defaultView.devicePixelRatio;
        return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    }

    function scaleFor(width, height) {
        const widthScale = canvas.clientWidth / width;
        if (fit === 'width') return widthScale;
        const windowScale = Math.min(widthScale, canvas.clientHeight / height);
        // 100% is one physical screen pixel per viewport CSS pixel, not native CSS zoom.
        return fit === 'automatic' ? Math.min(1 / pixelRatio(), windowScale) : windowScale;
    }

    function paint(value, pan) {
        scale = value;
        const [width, height] = size();
        const left = Math.max(0, (canvas.clientWidth - width * scale) / 2);
        const top = Math.max(0, (canvas.clientHeight - height * scale) / 2);
        // Clip the stage's untransformed layout box so it cannot create phantom scroll ranges.
        Object.assign(space.style, {
            width: `${canvas.clientWidth}px`, height: `${Math.max(canvas.clientHeight, top + height * scale)}px`,
        });
        Object.assign(stage.style, {
            left: `${left}px`, top: `${top}px`, transform: `scale(${scale})`,
        });
        canvas.tabIndex = fit === 'width' && height * scale > canvas.clientHeight ? 0 : -1;
        canvas.scrollTop = fit === 'width' ? pan * scale : 0;
    }

    function stopAnimation() {
        if (!animation) return;
        animation.window.cancelAnimationFrame(animation.frame);
        animation = null;
    }

    function render(animate = false, resetPan = false) {
        stopAnimation();
        const [width, height] = size();
        // Establish geometry even before the panel is measurable, so a loading page
        // never bootstraps its responsive scripts in an unsized iframe.
        Object.assign(stage.style, { width: `${width}px`, height: `${height}px` });
        if (!container.clientWidth || !container.clientHeight) return;
        const pan = resetPan ? 0 : (canvas.scrollTop || 0) / (scale || 1);
        // Decide from the outer area, independent of the scrollbar's own width. Reserving
        // its gutter up front avoids a resize loop when width-fitting is near the height limit.
        canvas.style.overflowY = fit === 'width' && container.clientWidth / width * height > container.clientHeight
            ? 'scroll' : 'hidden';
        if (!canvas.clientWidth || !canvas.clientHeight) return;
        const target = scaleFor(width, height);
        const text = `${width} × ${height} · ${Math.round(target * pixelRatio() * 100)}%`;
        if (dimensions.textContent !== text) dimensions.textContent = text;
        const from = scale ?? target;
        if (!animate || !motion.matches || from === target) {
            paint(target, pan);
            return;
        }
        // Animate only the camera, never the iframe's CSS width, height or aspect ratio.
        const current = { window: container.ownerDocument.defaultView, frame: null };
        const started = current.window.performance.now();
        animation = current;
        paint(from, pan);
        const step = (now) => {
            if (animation !== current) return;
            const progress = Math.min(1, Math.max(0, (now - started) / 200));
            const eased = 1 - (1 - progress) ** 3;
            paint(from + (target - from) * eased, pan);
            if (progress < 1) current.frame = current.window.requestAnimationFrame(step);
            else animation = null;
        };
        current.frame = current.window.requestAnimationFrame(step);
    }

    function layout() { render(); }

    function updatePixelRatio() {
        removeResolutionListener?.();
        const query = container.ownerDocument.defaultView.matchMedia(`(resolution: ${pixelRatio()}dppx)`);
        query.addEventListener('change', updatePixelRatio);
        removeResolutionListener = () => query.removeEventListener('change', updatePixelRatio);
        layout();
    }

    let observer = new mainWindow.ResizeObserver(layout);
    observer.observe(container);
    motion.addEventListener('change', layout);
    mainWindow.addEventListener('resize', updatePixelRatio);
    updatePixelRatio();

    return {
        get device() { return device; },
        get fit() { return fit; },
        get orientation() { return orientations[device]; },
        select(name, animate = false) {
            if (!presets.includes(name)) return;
            const changed = device !== name;
            device = name;
            if (changed) render(animate, true);
            else if (!animation) layout();
        },
        rotate(animate = false) {
            if (device === 'desktop') return;
            orientations[device] = orientations[device] === 'portrait' ? 'landscape' : 'portrait';
            render(animate, true);
        },
        setFit(value) {
            if (!fits.includes(value) || fit === value) return;
            fit = value;
            render(false, true);
        },
        layout,
        beforeMove() {
            stopAnimation();
            observer.disconnect();
            removeResolutionListener?.();
            container.ownerDocument.defaultView.removeEventListener('resize', updatePixelRatio);
        },
        afterMove() {
            observer = new container.ownerDocument.defaultView.ResizeObserver(layout);
            observer.observe(container);
            container.ownerDocument.defaultView.addEventListener('resize', updatePixelRatio);
            updatePixelRatio();
        },
    };
}
