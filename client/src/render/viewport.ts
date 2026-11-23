/**
 * Pure world-to-screen scaling maths.
 *
 * Kept free of DOM access so the responsive layout behaviour can be unit
 * tested deterministically. All values are CSS pixels; devicePixelRatio is
 * applied exactly once by the canvas base transform and must never enter this
 * calculation.
 */

/**
 * Input parameters for computeWorldViewport.
 */
interface WorldViewportInput {
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly roomWidth: number;
  readonly roomHeight: number;
}

/**
 * Output of computeWorldViewport.
 */
interface WorldViewportOutput {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Compute the uniform scale and letterbox offsets that fit `roomWidth` x
 * `roomHeight` inside `viewWidth` x `viewHeight` while preserving aspect ratio.
 *
 * @param input - Viewport and world dimensions in CSS pixels
 * @returns Scale factor and centring offsets
 */
export function computeWorldViewport(input: WorldViewportInput): WorldViewportOutput {
  const { viewWidth, viewHeight, roomWidth, roomHeight } = input;

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
 * Input parameters for computeBackingBuffer.
 */
interface BackingBufferInput {
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly dpr: number;
}

/**
 * Output of computeBackingBuffer.
 */
interface BackingBufferOutput {
  readonly bufferWidth: number;
  readonly bufferHeight: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
}

/**
 * Compute the canvas backing-buffer size for a given CSS viewport and DPR.
 *
 * The CSS size stays at the viewport size; only the drawing buffer is scaled by
 * DPR. This keeps HiDPI crispness without affecting logical coordinates.
 *
 * @param input - Viewport dimensions and device pixel ratio
 * @returns Buffer and CSS dimensions
 */
export function computeBackingBuffer(input: BackingBufferInput): BackingBufferOutput {
  const { viewWidth, viewHeight, dpr } = input;

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