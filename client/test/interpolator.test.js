import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createInterpolator } from "../src/network/interpolator.js";

function ship(id, x, y, angle = 0) {
    return { id, kind: "ship", x, y, angle, thrust: false };
}

describe("interpolator", () => {
    test("returns empty map with no frames", () => {
        const ip = createInterpolator();
        const result = ip.interpolate(1000);
        assert.equal(result.size, 0);
    });

    test("default delay is 100 ms and is adjustable", () => {
        const ip = createInterpolator();
        assert.equal(ip.getDelayMs(), 100);
        ip.setDelayMs(150);
        assert.equal(ip.getDelayMs(), 150);
        ip.adjustDelay(-30);
        assert.equal(ip.getDelayMs(), 120);
    });

    test("delay is clamped to [0, 500]", () => {
        const ip = createInterpolator();
        ip.setDelayMs(-50);
        assert.equal(ip.getDelayMs(), 0);
        ip.setDelayMs(9999);
        assert.equal(ip.getDelayMs(), 500);
    });

    test("invalid delay values are ignored", () => {
        const ip = createInterpolator();
        ip.setDelayMs(200);
        ip.setDelayMs(Number.NaN);
        assert.equal(ip.getDelayMs(), 200);
        ip.setDelayMs("not a number");
        assert.equal(ip.getDelayMs(), 200);
    });

    test("interpolates position between two bracketing snapshots", () => {
        const ip = createInterpolator();
        // Two snapshots 100 ms apart. Ship moves from x=0 to x=100.
        ip.pushFrame(1000, [ship(1, 0, 0)]);
        ip.pushFrame(1100, [ship(1, 100, 0)]);

        // With default 100 ms delay, renderTime = newest.serverTime - 100 = 1000,
        // which is exactly the older frame -> t=0 -> x=0.
        let result = ip.interpolate(1200);
        assert.equal(result.get(1).x, 0);

        // Reduce delay to 50 ms -> renderTime = 1100 - 50 = 1050, halfway between
        // 1000 and 1100 -> t=0.5 -> x=50.
        ip.setDelayMs(50);
        result = ip.interpolate(1200);
        assert.ok(Math.abs(result.get(1).x - 50) < 1e-9);
    });

    test("interpolates angle via shortest arc", () => {
        const ip = createInterpolator();
        // 350° to 10° (in radians) should interpolate through 0, not the long way.
        const a0 = (350 * Math.PI) / 180;
        const a1 = (10 * Math.PI) / 180;
        ip.pushFrame(1000, [ship(1, 0, 0, a0)]);
        ip.pushFrame(1100, [ship(1, 0, 0, a1)]);
        ip.setDelayMs(50); // renderTime = 1050 -> t=0.5

        const result = ip.interpolate(1200);
        const midAngle = result.get(1).angle;
        // Midpoint should be near 0 (360°/0°), not near 180°. Accept both 0 and
        // 2π since they represent the same orientation.
        const normalized = Math.atan2(
            Math.sin(midAngle),
            Math.cos(midAngle),
        );
        assert.ok(
            Math.abs(normalized) < 0.01,
            `angle ${midAngle} (normalized ${normalized}) should be ~0`,
        );
    });

    test("entity appearing only in newer frame renders at newer position", () => {
        const ip = createInterpolator();
        ip.pushFrame(1000, [ship(1, 0, 0)]);
        ip.pushFrame(1100, [ship(1, 0, 0), ship(2, 50, 50)]);
        ip.setDelayMs(50);

        const result = ip.interpolate(1200);
        // Ship 2 only exists in the newer frame -> rendered at its position.
        assert.equal(result.get(2).x, 50);
        assert.equal(result.get(2).y, 50);
    });

    test("entity disappearing in newer frame lingers at older position", () => {
        const ip = createInterpolator();
        ip.pushFrame(1000, [ship(1, 0, 0), ship(2, 10, 10)]);
        ip.pushFrame(1100, [ship(1, 0, 0)]); // ship 2 gone
        ip.setDelayMs(50);

        const result = ip.interpolate(1200);
        // Ship 2 disappeared -> keep older position so it lingers.
        assert.ok(result.has(2));
        assert.equal(result.get(2).x, 10);
    });

    test("clamps to newest frame when renderTime exceeds it", () => {
        const ip = createInterpolator();
        ip.pushFrame(1000, [ship(1, 0, 0)]);
        ip.pushFrame(1100, [ship(1, 100, 0)]);
        // delay=0 -> renderTime = 1100 (newest) -> t=1 -> x=100.
        ip.setDelayMs(0);

        const result = ip.interpolate(1200);
        assert.equal(result.get(1).x, 100);
    });

    test("buffer is bounded", () => {
        const ip = createInterpolator();
        for (let i = 0; i < 100; i += 1) {
            ip.pushFrame(i * 33, [ship(1, i, 0)]);
        }
        assert.ok(ip.getBufferLength() <= 60);
    });

    test("reset clears buffer and restores default delay", () => {
        const ip = createInterpolator();
        ip.pushFrame(1000, [ship(1, 0, 0)]);
        ip.setDelayMs(250);
        ip.reset();
        assert.equal(ip.getBufferLength(), 0);
        assert.equal(ip.getDelayMs(), 100);
    });
});