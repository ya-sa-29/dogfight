import { describe, expect, test } from "vitest";
import {
    circlesOverlap,
    resolveCollisions,
} from "../../shared/sim/collision.ts";
import { World } from "../../shared/sim/world.ts";
import { Ship } from "../../shared/sim/ship.ts";
import { Asteroid } from "../../shared/sim/asteroid.ts";
import { Bullet } from "../../shared/sim/bullet.ts";
import { Missile } from "../../shared/sim/missile.ts";
import { Pickup } from "../../shared/sim/pickup.ts";
import { Vector2 } from "../../shared/sim/vector.ts";

describe("circlesOverlap", () => {
    test("returns true when circles overlap", () => {
        const a = new EntityLike(new Vector2(0, 0), 10);
        const b = new EntityLike(new Vector2(5, 0), 10);
        expect(circlesOverlap(a, b)).toBe(true);
    });

    test("returns false when circles are far apart", () => {
        const a = new EntityLike(new Vector2(0, 0), 10);
        const b = new EntityLike(new Vector2(50, 0), 10);
        expect(circlesOverlap(a, b)).toBe(false);
    });

    test("returns true when circles just touch", () => {
        const a = new EntityLike(new Vector2(0, 0), 10);
        const b = new EntityLike(new Vector2(20, 0), 10);
        expect(circlesOverlap(a, b)).toBe(true);
    });
});

class EntityLike {
    constructor(
        public pos: Vector2,
        public radius: number,
        public alive = true,
        public kind:
            "ship" | "asteroid" | "bullet" | "missile" | "pickup" = "ship",
        public id = 1,
    ) {}
}

describe("resolveCollisions", () => {
    test("ship-asteroid overlap produces hit event", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        const asteroid = new Asteroid(
            new Vector2(405, 300),
            new Vector2(0, 0),
            20,
            2,
        );
        world.spawn(ship);
        world.spawn(asteroid);

        const events = resolveCollisions(world);
        const hits = events.filter(
            (e) => e.type === "hit" && e.target === "ship",
        );
        expect(hits.length).toBe(1);
        expect(hits[0]!.shipId).toBe(ship.id);
        expect(hits[0]!.asteroidId).toBe(asteroid.id);
    });

    test("bullet-asteroid collision produces hit event with destroyed flag", () => {
        const world = new World();
        const bullet = new Bullet(
            new Vector2(100, 100),
            new Vector2(0, 0),
            0,
            1.5,
            1,
        );
        const asteroid = new Asteroid(
            new Vector2(100, 100),
            new Vector2(0, 0),
            10,
            2,
        );
        world.spawn(bullet);
        world.spawn(asteroid);

        const events = resolveCollisions(world);
        const hits = events.filter(
            (e) => e.type === "hit" && e.target === "asteroid",
        );
        expect(hits.length).toBe(1);
        expect(hits[0]!.asteroidId).toBe(asteroid.id);
        expect(hits[0]!.projectileId).toBe(bullet.id);
        expect(hits[0]!.destroyed).toBe(false);
    });

    test("second bullet hit destroys asteroid", () => {
        const world = new World();
        const bullet1 = new Bullet(
            new Vector2(100, 100),
            new Vector2(0, 0),
            0,
            1.5,
            1,
        );
        const asteroid = new Asteroid(
            new Vector2(100, 100),
            new Vector2(0, 0),
            10,
            2,
        );
        world.spawn(bullet1);
        world.spawn(asteroid);
        resolveCollisions(world);

        const bullet2 = new Bullet(
            new Vector2(100, 100),
            new Vector2(0, 0),
            0,
            1.5,
            3,
        );
        world.spawn(bullet2);
        const events = resolveCollisions(world);

        const hits = events.filter(
            (e) => e.type === "hit" && e.target === "asteroid",
        );
        expect(hits.length).toBe(1);
        expect(hits[0]!.destroyed).toBe(true);
    });

    test("ship-pickup collision produces pickup event", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        const pickup = new Pickup(new Vector2(405, 300), 2);
        world.spawn(ship);
        world.spawn(pickup);

        const events = resolveCollisions(world);
        const pickups = events.filter((e) => e.type === "pickup");
        expect(pickups.length).toBe(1);
        expect(pickups[0]!.shipId).toBe(ship.id);
        expect(pickups[0]!.pickupId).toBe(pickup.id);
    });

    test("no collision returns empty events", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        const asteroid = new Asteroid(
            new Vector2(1000, 1000),
            new Vector2(0, 0),
            20,
            2,
        );
        world.spawn(ship);
        world.spawn(asteroid);

        const events = resolveCollisions(world);
        expect(events).toHaveLength(0);
    });

    test("pickup-ship collision when pickup is first entity", () => {
        const world = new World();
        const pickup = new Pickup(new Vector2(405, 300), 2);
        const ship = new Ship(400, 300, 1);
        world.spawn(pickup);
        world.spawn(ship);

        const events = resolveCollisions(world);
        const pickups = events.filter((e) => e.type === "pickup");
        expect(pickups.length).toBe(1);
        expect(pickups[0]!.shipId).toBe(ship.id);
        expect(pickups[0]!.pickupId).toBe(pickup.id);
    });

    test("ship-asteroid collision kills ship at hp 1", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        ship.hp = 1;
        const asteroid = new Asteroid(
            new Vector2(405, 300),
            new Vector2(0, 0),
            20,
            2,
        );
        world.spawn(ship);
        world.spawn(asteroid);

        const events = resolveCollisions(world);
        const kills = events.filter(
            (e) => e.type === "hit" && e.target === "ship",
        );
        expect(kills.length).toBe(1);
        expect(ship.alive).toBe(false);
    });
});



