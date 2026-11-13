// Responsive iframe geometry and motion only; controls and native preferences belong to the panel.
export function createPreviewViewport(container, stage, dimensions, savedDevice) {
    const mainWindow = container.ownerDocument.defaultView;
    const widths = { desktop: 1280, tablet: 768, mobile: 390 };
    const presets = Object.keys(widths);
    let device = presets.includes(savedDevice) ? savedDevice : 'desktop';
    let viewportWidth = widths[device];
    let animation;
    const motion = mainWindow.matchMedia('(prefers-reduced-motion: no-preference)');

    function paint(width) {
        viewportWidth = width;
        const availableWidth = container.clientWidth;
        const availableHeight = container.clientHeight;
        const scale = Math.min(1, availableWidth / width);
        if (!scale || !availableHeight) return;
        Object.assign(stage.style, {
            width: `${width}px`, height: `${availableHeight / scale}px`,
            left: `${(availableWidth - width * scale) / 2}px`, transform: `scale(${scale})`,
        });
        // Keep the selected preset readout stable instead of counting through intermediate widths.
        const text = `${widths[device]} px · ${Math.round(Math.min(1, availableWidth / widths[device]) * 100)}%`;
        if (dimensions.textContent !== text) dimensions.textContent = text;
    }

    function stopAnimation() {
        if (!animation) return;
        animation.window.cancelAnimationFrame(animation.frame);
        animation = null;
    }

    function layout() {
        stopAnimation();
        paint(widths[device]);
    }

    function transition(animate) {
        stopAnimation();
        const from = viewportWidth;
        const to = widths[device];
        if (!animate || !motion.matches || from === to || !container.clientWidth || !container.clientHeight) {
            layout();
            return;
        }
        const current = { window: container.ownerDocument.defaultView, frame: null };
        const started = current.window.performance.now();
        animation = current;
        paint(from);
        const step = (now) => {
            if (animation !== current) return;
            const progress = Math.min(1, Math.max(0, (now - started) / 200));
            // Animate one real viewport width; derive the fitting scale, height and centering together.
            paint(from + (to - from) * (1 - (1 - progress) ** 3));
            if (progress < 1) current.frame = current.window.requestAnimationFrame(step);
            else animation = null;
        };
        current.frame = current.window.requestAnimationFrame(step);
    }
    new mainWindow.ResizeObserver(layout).observe(container);
    motion.addEventListener('change', layout);

    return {
        get device() { return device; },
        select(name, animate = false) {
            if (!presets.includes(name)) return;
            const changed = device !== name;
            device = name;
            if (changed) transition(animate);
            else if (!animation) layout();
        },
        layout,
    };
}
