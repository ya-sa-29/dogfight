/**
 * Pure world-to-screen scaling maths.
 *
 * Kept free of DOM access so the responsive layout behaviour can be unit
 * tested deterministically. All values are CSS pixels; devicePixelRatio is
 * applied exactly once by the canvas base transform and must never enter this
 * calculation.
 */

/**
 * Compute the uniform scale and letterbox offsets that fit `roomWidth` x
 * `roomHeight` inside `viewWidth` x `viewHeight` while preserving aspect ratio.
 *
 * @returns {{ scale: number, offsetX: number, offsetY: number }}
 */
export function computeWorldViewport({
    viewWidth,
    viewHeight,
    roomWidth,
    roomHeight,
}) {
    if (roomWidth <= 0 || roomHeight <= 0) {
        throw new Error("room dimensions must be positive");
    }

    if (viewWidth <= 0 || viewHeight <= 0) {
        throw new Error("viewport dimensions must be positive");
    }

    // Uniform scale: the limiting axis determines the scale so the entire
    // world is always visible and proportions are preserved.
    const scale = Math.min(viewWidth / roomWidth, viewHeight / roomHeight);

    // Centring offsets. These are never negative: the non-limiting axis has
    // leftover space, which is split evenly into letterbox bars.
    const offsetX = (viewWidth - roomWidth * scale) / 2;
    const offsetY = (viewHeight - roomHeight * scale) / 2;

    return { scale, offsetX, offsetY };
}

/**
 * Compute the canvas backing-buffer size for a given CSS viewport and DPR.
 *
 * The CSS size stays at the viewport size; only the drawing buffer is scaled by
 * DPR. This keeps HiDPI crispness without affecting logical coordinates.
 *
 * @returns {{ bufferWidth: number, bufferHeight: number, cssWidth: number, cssHeight: number }}
 */
export function computeBackingBuffer({ viewWidth, viewHeight, dpr }) {
    if (viewWidth <= 0 || viewHeight <= 0) {
        throw new Error("viewport dimensions must be positive");
    }

    if (!(dpr > 0)) {
        throw new Error("dpr must be a positive number");
    }

    return {
        bufferWidth: viewWidth * dpr,
        bufferHeight: viewHeight * dpr,
        cssWidth: viewWidth,
        cssHeight: viewHeight,
    };
}