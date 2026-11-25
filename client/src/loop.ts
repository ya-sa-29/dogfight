/**
 * Fixed-timestep game loop with interpolation alpha for rendering.
 *
 * @param step - Simulation step duration in seconds (default: 1/60)
 * @param simulate - Called at fixed intervals with `step`
 * @param render - Called each frame with interpolation alpha [0, 1)
 * @returns Loop controller with start/stop and stats
 */
export interface LoopConfig {
  readonly step?: number;
  readonly simulate: (dt: number) => void;
  readonly render: (alpha: number) => void;
}

export interface LoopStats {
  readonly stepsPerSecond: number;
  readonly fps: number;
  readonly frameTime: number;
}

export interface LoopController {
  readonly start: () => void;
  readonly stop: () => void;
  readonly getStats: () => LoopStats;
}

export function createLoop(config: LoopConfig): LoopController {
  const step = config.step ?? 1 / 60;
  const simulate = config.simulate;
  const render = config.render;

  let running = false;
  let animationFrameId: number | null = null;

  let lastTime = performance.now();
  let accumulator = 0;

  let steps = 0;
  let frames = 0;

  let statsTime = lastTime;
  let stepsPerSecond = 0;
  let fps = 0;
  let frameTime = 0;

  function frame(now: number): void {
    if (!running) {
      return;
    }

    frameTime = now - lastTime;
    lastTime = now;

    const delta = Math.min(frameTime / 1000, 0.25);
    accumulator += delta;

    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;

      steps++;
    }

    const alpha = accumulator / step;

    render(alpha);

    frames++;

    if (now - statsTime >= 1000) {
      stepsPerSecond = steps;
      fps = frames;

      steps = 0;
      frames = 0;
      statsTime = now;
    }

    animationFrameId = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running) {
      return;
    }

    running = true;
    lastTime = performance.now();
    statsTime = lastTime;

    animationFrameId = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  return {
    start,
    stop,
    getStats(): LoopStats {
      return {
        stepsPerSecond,
        fps,
        frameTime,
      };
    },
  };
}