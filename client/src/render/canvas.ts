import { computeBackingBuffer } from "./viewport.js";

export interface CanvasAPI {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly viewWidth: number;
  readonly viewHeight: number;
}

/**
 * Creates and configures the main game canvas with HiDPI support.
 * The canvas base transform applies devicePixelRatio exactly once.
 * All screen-space drawing (clearing, HUD, overlays) uses CSS viewport dimensions.
 *
 * @returns Object with canvas, context, and dimension getters
 */
export function createCanvas(): CanvasAPI {
  const canvas = document.querySelector<HTMLCanvasElement>("#game");
  if (!canvas) {
    throw new Error("Canvas element #game not found");
  }
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to get 2D context");
  }

  // Use local references that TypeScript knows are non-null
  const canvasRef = canvas;
  const contextRef = context;

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;

    const { bufferWidth, bufferHeight, cssWidth, cssHeight } = computeBackingBuffer({
      viewWidth: window.innerWidth,
      viewHeight: window.innerHeight,
      dpr,
    });

    canvasRef.width = bufferWidth;
    canvasRef.height = bufferHeight;

    canvasRef.style.width = `${cssWidth}px`;
    canvasRef.style.height = `${cssHeight}px`;

    contextRef.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", resize);
  resize();

  return {
    canvas: canvasRef,
    context: contextRef,
    // Backing-buffer dimensions, in device pixels. These are the intrinsic
    // canvas size and must not be used as logical drawing coordinates.
    get width(): number {
      return window.innerWidth;
    },
    get height(): number {
      return window.innerHeight;
    },
    // CSS viewport dimensions, in CSS pixels. All screen-space drawing
    // (clearing, HUD, overlays) must use these, because the context base
    // transform already applies devicePixelRatio exactly once.
    get viewWidth(): number {
      return window.innerWidth;
    },
    get viewHeight(): number {
      return window.innerHeight;
    },
  };
}