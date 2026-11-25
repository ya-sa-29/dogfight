import { describe, expect, test } from "vitest";
import { createHomingBehavior } from "../../shared/sim/homing.ts";
import { Entity } from "../../shared/sim/entity.ts";
import { Vector2 } from "../../shared/sim/vector.ts";

describe("createHomingBehavior", () => {
    test("behavior object has an update method", () => {
        const target = new Entity({
            pos: new Vector2(100, 100),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "asteroid",
            hp: 1,
            id: 1,
        });
        const behavior = createHomingBehavior(target);
        expect(typeof behavior.update).toBe("function");
    });

    test("entity turns toward alive target", () => {
        const target = new Entity({
            pos: new Vector2(1000, 1000),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "asteroid",
            hp: 1,
            id: 1,
        });
        const entity = new Entity({
            pos: new Vector2(0, 0),
            vel: new Vector2(100, 0),
            radius: 10,
            kind: "ship",
            hp: 1,
            id: 2,
            angle: 0,
        });

        const behavior = createHomingBehavior(target, 3);
        behavior.update(entity, 1);

        expect(entity.angle).toBeGreaterThan(0);
    });

    test("dead target causes no turn", () => {
        const target = new Entity({
            pos: new Vector2(1000, 1000),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "asteroid",
            hp: 0,
            id: 1,
        });
        target.alive = false;
        const entity = new Entity({
            pos: new Vector2(0, 0),
            vel: new Vector2(100, 0),
            radius: 10,
            kind: "ship",
            hp: 1,
            id: 2,
            angle: 0.5,
        });

        const behavior = createHomingBehavior(target, 3);
        const beforeAngle = entity.angle;
        behavior.update(entity, 1);

        expect(entity.angle).toBe(beforeAngle);
    });

    test("turn is clamped by turnSpeed", () => {
        const target = new Entity({
            pos: new Vector2(10000, 0),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "asteroid",
            hp: 1,
            id: 1,
        });
        const entity = new Entity({
            pos: new Vector2(0, 0),
            vel: new Vector2(100, 0),
            radius: 10,
            kind: "ship",
            hp: 1,
            id: 2,
            angle: 0,
        });

        const behavior = createHomingBehavior(target, 0.1);
        behavior.update(entity, 1);

        expect(Math.abs(entity.angle)).toBeLessThanOrEqual(0.1);
    });
});



