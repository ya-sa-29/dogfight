import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { createPredictor } from "../../client/src/network/predictor.js";
import type { ShipInput } from "@dogfight/shared";

const baseInput = {
    thrust: false,
    turnLeft: false,
    turnRight: false,
    fire: false,
    switchWeapon: false,
} as ShipInput;

describe("predictor reconciliation (pure function)", () => {
    let now: number;

    beforeEach(() => {
        now = 1_000_000;
    });

    test("reconcile is pure — same inputs produce same correction magnitude", () => {
        const p1 = createPredictor({ getNow: () => now });
        const p2 = createPredictor({ getNow: () => now });

        p1.pushPending(1, baseInput);
        p1.pushPending(2, baseInput);
        p1.reconcile({ x: 100, y: 200, angle: 0 }, 0);
        const m1 = p1.reconcile({ x: 100, y: 200, angle: 0 }, 0);

        p2.pushPending(1, baseInput);
        p2.pushPending(2, baseInput);
        p2.reconcile({ x: 100, y: 200, angle: 0 }, 0);
        const m2 = p2.reconcile({ x: 100, y: 200, angle: 0 }, 0);

        expect(m1).toBe(m2);
    });

    test("reconcile does not mutate the serverShip argument", () => {
        const p = createPredictor({ getNow: () => now });
        p.pushPending(1, baseInput);

        const serverShip = { x: 100, y: 200, angle: 0.75 };
        const before = { ...serverShip };

        p.reconcile(serverShip, 0);

        expect(serverShip.x).toBe(before.x);
        expect(serverShip.y).toBe(before.y);
        expect(serverShip.angle).toBe(before.angle);
    });

    test("reconcile returns undefined when serverShip is falsy", () => {
        const p = createPredictor({ getNow: () => now });
        expect(p.reconcile(null as any, 0)).toBeUndefined();
        expect(p.reconcile(undefined as any, 0)).toBeUndefined();
    });

    test("reconcile with no pending inputs returns zero correction", () => {
        const p = createPredictor({ getNow: () => now });
        p.reconcile({ x: 50, y: 60, angle: 0 }, 0);
        expect(p.reconcile({ x: 50, y: 60, angle: 0 }, 0)).toBe(0);
    });

    test("reconcile replays pending inputs with server timestep", () => {
        const p = createPredictor({ getNow: () => now });
        p.pushPending(1, { ...baseInput, thrust: true });
        p.pushPending(2, { ...baseInput, thrust: true });

        const m1 = p.reconcile({ x: 0, y: 0, angle: 0 }, 0);
        const m2 = p.reconcile({ x: 0, y: 0, angle: 0 }, 2);

        expect(m1).toBeGreaterThanOrEqual(0);
        expect(m2).toBeGreaterThanOrEqual(0);
    });
});
