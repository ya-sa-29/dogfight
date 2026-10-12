export function createLoop({ step = 1 / 60, simulate, render }) {
    let running = false;
    let animationFrameId = null;

    let lastTime = performance.now();
    let accumulator = 0;

    let steps = 0;
    let frames = 0;

    let statsTime = lastTime;
    let stepsPerSecond = 0;
    let fps = 0;
    let frameTime = 0;

    function frame(now) {
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

    function start() {
        if (running) {
            return;
        }

        running = true;
        lastTime = performance.now();
        statsTime = lastTime;

        animationFrameId = requestAnimationFrame(frame);
    }

    function stop() {
        running = false;

        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    return {
        start,
        stop,
        getStats() {
            return {
                stepsPerSecond,
                fps,
                frameTime,
            };
        },
    };
}
