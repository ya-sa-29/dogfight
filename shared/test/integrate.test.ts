import { describe, expect, test } from "vitest";
import { integrate } from "../../shared/sim/integrate.ts";
import { Entity } from "../../shared/sim/entity.ts";
import { Vector2 } from "../../shared/sim/vector.ts";

function makeShip(
    overrides: Partial<{ pos: Vector2; vel: Vector2; angle: number }> = {},
) {
    return new Entity({
        pos: overrides.pos ?? new Vector2(0, 0),
        vel: overrides.vel ?? new Vector2(0, 0),
        radius: 10,
        kind: "ship",
        hp: 3,
        id: 1,
        angle: overrides.angle ?? 0,
    });
}

describe("integrate", () => {
    test("with no input, position advances by velocity Г— dt (after drag)", () => {
        const ship = makeShip({ vel: new Vector2(100, 0) });
        const result = integrate(
            ship,
            { turnLeft: false, turnRight: false, thrust: false },
            0.1,
        );
        // drag 0.98 applied: 100 * 0.98 * 0.1 = 9.8
        expect(result.pos.x).toBeCloseTo(9.8);
        expect(result.pos.y).toBeCloseTo(0);
    });

    test("with thrust, velocity increases in facing direction", () => {
        const ship = makeShip({ angle: 0 });
        const result = integrate(
            ship,
            { turnLeft: false, turnRight: false, thrust: true },
            0.1,
        );
        expect(result.vel.x).toBeGreaterThan(0);
        expect(result.pos.x).toBeGreaterThan(0);
    });

    test("thrust along angle 0 moves in +x", () => {
        const ship = makeShip({ angle: 0 });
        const result = integrate(
            ship,
            { turnLeft: false, turnRight: false, thrust: true },
            1 / 30,
        );
        expect(result.pos.x).toBeGreaterThan(0);
        expect(result.pos.y).toBeCloseTo(0);
    });

    test("drag reduces velocity each step", () => {
        const ship = makeShip({ vel: new Vector2(100, 0) });
        const result = integrate(
            ship,
            { turnLeft: false, turnRight: false, thrust: false },
            1,
        );
        expect(result.vel.x).toBeLessThan(100);
        expect(result.vel.x).toBeGreaterThan(0);
    });

    test("maxSpeed clamps velocity", () => {
        const ship = makeShip({ vel: new Vector2(400, 0) });
        const result = integrate(
            ship,
            { turnLeft: false, turnRight: false, thrust: false },
            1,
        );
        expect(result.vel.length).toBeLessThanOrEqual(300);
    });

    test("turnLeft decreases angle", () => {
        const ship = makeShip({ angle: 0 });
        const result = integrate(
            ship,
            { turnLeft: true, turnRight: false, thrust: false },
            0.1,
        );
        expect(result.angle).toBeLessThan(0);
    });

    test("turnRight increases angle", () => {
        const ship = makeShip({ angle: 0 });
        const result = integrate(
            ship,
            { turnLeft: false, turnRight: true, thrust: false },
            0.1,
        );
        expect(result.angle).toBeGreaterThan(0);
    });

    test("is a pure function вЂ” same input produces same output", () => {
        const ship = makeShip({ vel: new Vector2(50, 25), angle: 0.5 });
        const input = { turnLeft: true, turnRight: false, thrust: true };
        const r1 = integrate(ship, input, 0.1);
        const r2 = integrate(ship, input, 0.1);
        expect(r1.pos.x).toBe(r2.pos.x);
        expect(r1.pos.y).toBe(r2.pos.y);
        expect(r1.angle).toBe(r2.angle);
        expect(r1.vel.x).toBe(r2.vel.x);
        expect(r1.vel.y).toBe(r2.vel.y);
    });

    test("does not mutate the input ship", () => {
        const ship = makeShip({ vel: new Vector2(100, 0), angle: 0 });
        const origX = ship.pos.x;
        const origVelX = ship.vel.x;
        const origAngle = ship.angle;
        integrate(
            ship,
            { turnLeft: false, turnRight: false, thrust: true },
            0.1,
        );
        expect(ship.pos.x).toBe(origX);
        expect(ship.vel.x).toBe(origVelX);
        expect(ship.angle).toBe(origAngle);
    });
});



