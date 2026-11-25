import { describe, expect, test } from "vitest";
import { wrapShip } from "../../shared/sim/arena.ts";
import { Entity } from "../../shared/sim/entity.ts";
import { Vector2 } from "../../shared/sim/vector.ts";

describe("wrapShip", () => {
    const WIDTH = 1600;
    const HEIGHT = 900;

    test("wraps x position beyond right edge", () => {
        const ship = new Entity({
            pos: new Vector2(WIDTH + 100, 300),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "ship",
            hp: 1,
            id: 1,
        });
        wrapShip(ship, WIDTH, HEIGHT);
        expect(ship.pos.x).toBe(100);
        expect(ship.pos.y).toBe(300);
    });

    test("wraps x position beyond left edge", () => {
        const ship = new Entity({
            pos: new Vector2(-100, 300),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "ship",
            hp: 1,
            id: 1,
        });
        wrapShip(ship, WIDTH, HEIGHT);
        expect(ship.pos.x).toBe(WIDTH - 100);
        expect(ship.pos.y).toBe(300);
    });

    test("wraps y position beyond bottom edge", () => {
        const ship = new Entity({
            pos: new Vector2(300, HEIGHT + 200),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "ship",
            hp: 1,
            id: 1,
        });
        wrapShip(ship, WIDTH, HEIGHT);
        expect(ship.pos.x).toBe(300);
        expect(ship.pos.y).toBe(200);
    });

    test("wraps y position beyond top edge", () => {
        const ship = new Entity({
            pos: new Vector2(300, -200),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "ship",
            hp: 1,
            id: 1,
        });
        wrapShip(ship, WIDTH, HEIGHT);
        expect(ship.pos.x).toBe(300);
        expect(ship.pos.y).toBe(HEIGHT - 200);
    });

    test("handles exact boundary values", () => {
        const ship = new Entity({
            pos: new Vector2(0, 0),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "ship",
            hp: 1,
            id: 1,
        });
        wrapShip(ship, WIDTH, HEIGHT);
        expect(ship.pos.x).toBe(0);
        expect(ship.pos.y).toBe(0);
    });

    test("leaves position unchanged when within bounds", () => {
        const ship = new Entity({
            pos: new Vector2(400, 300),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "ship",
            hp: 1,
            id: 1,
        });
        wrapShip(ship, WIDTH, HEIGHT);
        expect(ship.pos.x).toBe(400);
        expect(ship.pos.y).toBe(300);
    });

    test("handles exact right and bottom edges", () => {
        const ship = new Entity({
            pos: new Vector2(WIDTH, HEIGHT),
            vel: new Vector2(0, 0),
            radius: 10,
            kind: "ship",
            hp: 1,
            id: 1,
        });
        wrapShip(ship, WIDTH, HEIGHT);
        expect(ship.pos.x).toBe(0);
        expect(ship.pos.y).toBe(0);
    });
});



