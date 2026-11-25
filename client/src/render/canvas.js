import { computeBackingBuffer } from "./viewport.js";

export function createCanvas() {
    const canvas = document.querySelector("#game");
    const context = canvas.getContext("2d");

    function resize() {
        const dpr = window.devicePixelRatio || 1;

        const { bufferWidth, bufferHeight, cssWidth, cssHeight } =
            computeBackingBuffer({
                viewWidth: window.innerWidth,
                viewHeight: window.innerHeight,
                dpr,
            });

        canvas.width = bufferWidth;
        canvas.height = bufferHeight;

        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    window.addEventListener("resize", resize);
    resize();

    return {
        canvas,
        context,
        // Backing-buffer dimensions, in device pixels. These are the intrinsic
        // canvas size and must not be used as logical drawing coordinates.
        get width() {
            return window.innerWidth;
        },
        get height() {
            return window.innerHeight;
        },
        // CSS viewport dimensions, in CSS pixels. All screen-space drawing
        // (clearing, HUD, overlays) must use these, because the context base
        // transform already applies devicePixelRatio exactly once.
        get viewWidth() {
            return window.innerWidth;
        },
        get viewHeight() {
            return window.innerHeight;
        },
    };
}
