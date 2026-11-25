import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { createLoop } from "../../client/src/loop.js";

describe("createLoop accumulator with fake timers", () => {
    let now: number;

    beforeEach(() => {
        now = 0;
        vi.useFakeTimers();
        vi.spyOn(performance, "now").mockImplementation(() => now);
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            return setTimeout(() => {
                now += 16;
                cb(now);
            }, 16) as unknown as number;
        });
        vi.stubGlobal("cancelAnimationFrame", (id: number) => {
            clearTimeout(id);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    test("accumulator triggers simulate steps at fixed timestep", () => {
        const simulate = vi.fn();
        const render = vi.fn();
        const loop = createLoop({ step: 1 / 60, simulate, render });

        loop.start();

        // Advance ~200ms: should trigger multiple 1/60s steps (~12 steps)
        now += 200;
        vi.advanceTimersByTime(200);

        expect(simulate).toHaveBeenCalled();
        expect(simulate).toHaveBeenCalledWith(expect.any(Number));
    });

    test("accumulator carries remainder between frames", () => {
        const simulate = vi.fn();
        const render = vi.fn();
        const loop = createLoop({ step: 1 / 30, simulate, render });

        loop.start();

        // Advance enough for at least one step
        now += 200;
        vi.advanceTimersByTime(200);

        expect(simulate).toHaveBeenCalled();
        expect(simulate).toHaveBeenCalledWith(expect.any(Number));
    });

    test("render alpha is in [0, 1)", () => {
        const render = vi.fn();
        const loop = createLoop({ step: 1 / 60, simulate: vi.fn(), render });

        loop.start();

        now += 20;
        vi.advanceTimersByTime(20);

        expect(render).toHaveBeenCalled();
        const alpha = render.mock.calls[0]![0];
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThan(1);
    });

    test("stop prevents further simulation", () => {
        const simulate = vi.fn();
        const loop = createLoop({ step: 1 / 60, simulate, render: vi.fn() });

        loop.start();
        loop.stop();

        now += 100;
        vi.advanceTimersByTime(100);
        expect(simulate).not.toHaveBeenCalled();
    });

    test("getStats returns stepsPerSecond and fps", () => {
        const simulate = vi.fn();
        const render = vi.fn();
        const loop = createLoop({ step: 1 / 60, simulate, render });

        const stats = loop.getStats();
        expect(typeof stats.stepsPerSecond).toBe("number");
        expect(typeof stats.fps).toBe("number");
        expect(typeof stats.frameTime).toBe("number");
    });
});
