import { describe, expect, test } from "vitest";
import { World } from "../../shared/sim/world.ts";
import { Ship } from "../../shared/sim/ship.ts";
import { Asteroid } from "../../shared/sim/asteroid.ts";
import { Bullet } from "../../shared/sim/bullet.ts";
import { Pickup } from "../../shared/sim/pickup.ts";
import { Vector2 } from "../../shared/sim/vector.ts";
import { integrate } from "../../shared/sim/integrate.ts";
import { createRNG } from "../../shared/rng/mulberry32.ts";
import { createWorldFromSeed } from "../../shared/sim/worldInit.ts";

const NEUTRAL_INPUT = {
    thrust: false,
    turnLeft: false,
    turnRight: false,
    fire: false,
    switchWeapon: false,
};

describe("World.step determinism", () => {
    test("same inputs produce same simulation state across two worlds", () => {
        const seed = 12345;
        const rng1 = createRNG(seed);
        const rng2 = createRNG(seed);

        const world1 = new World();
        const world2 = new World();

        const ship1 = new Ship(400, 300, 1);
        const ship2 = new Ship(400, 300, 1);

        world1.spawn(ship1);
        world2.spawn(ship2);

        for (let i = 0; i < 10; i++) {
            const asteroid1 = new Asteroid(
                new Vector2(
                    100 + rng1.random() * 600,
                    100 + rng1.random() * 400,
                ),
                new Vector2(
                    (rng1.random() - 0.5) * 80,
                    (rng1.random() - 0.5) * 80,
                ),
                18 + rng1.random() * 17,
                i + 10,
            );
            const asteroid2 = new Asteroid(
                new Vector2(
                    100 + rng2.random() * 600,
                    100 + rng2.random() * 400,
                ),
                new Vector2(
                    (rng2.random() - 0.5) * 80,
                    (rng2.random() - 0.5) * 80,
                ),
                18 + rng2.random() * 17,
                i + 10,
            );
            world1.spawn(asteroid1);
            world2.spawn(asteroid2);
        }

        const dt = 1 / 30;

        for (let tick = 0; tick < 100; tick++) {
            const projectiles1 = ship1.update(dt, NEUTRAL_INPUT, world1);
            const projectiles2 = ship2.update(dt, NEUTRAL_INPUT, world2);

            for (const p of projectiles1) world1.spawn(p);
            for (const p of projectiles2) world2.spawn(p);

            const events1 = world1.step(dt, NEUTRAL_INPUT);
            const events2 = world2.step(dt, NEUTRAL_INPUT);

            expect(events1).toEqual(events2);
        }

        const snapshot1 = world1.getEntitiesSnapshot();
        const snapshot2 = world2.getEntitiesSnapshot();

        expect(snapshot1.length).toBe(snapshot2.length);

        for (let i = 0; i < snapshot1.length; i++) {
            const e1 = snapshot1[i];
            const e2 = snapshot2[i];
            expect(e1.id).toBe(e2.id);
            expect(e1.kind).toBe(e2.kind);
            expect(e1.x).toBe(e2.x);
            expect(e1.y).toBe(e2.y);
            expect(e1.angle).toBe(e2.angle);
            expect(e1.hp).toBe(e2.hp);
        }
    });

    test("World.step returns collision events for overlapping ship and asteroid", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        const asteroid = new Asteroid(
            new Vector2(410, 300),
            new Vector2(0, 0),
            20,
            2,
        );
        world.spawn(ship);
        world.spawn(asteroid);

        const events = world.step(1 / 30, NEUTRAL_INPUT);
        const hitEvents = events.filter(
            (e) => e.type === "hit" && e.target === "ship",
        );
        expect(hitEvents.length).toBe(1);
        expect(hitEvents[0]!.shipId).toBe(ship.id);
        expect(hitEvents[0]!.asteroidId).toBe(asteroid.id);
    });

    test("spawn and despawn change entity count", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        world.spawn(ship);
        expect(world.getEntitiesSnapshot().length).toBe(1);

        world.despawn(ship.id);
        world.step(1 / 30, NEUTRAL_INPUT);
        expect(world.getEntitiesSnapshot().length).toBe(0);
    });

    test("get returns entity by ID", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        const spawned = world.spawn(ship);
        const found = world.get(spawned.id);
        expect(found).toBe(ship);
        expect(world.get(99999)).toBeUndefined();
    });

    test("spawn assigns fresh ID when ID collides", () => {
        const world = new World();
        const ship1 = new Ship(400, 300, 1);
        const ship2 = new Ship(500, 300, 1); // same ID as ship1

        world.spawn(ship1);
        const spawned = world.spawn(ship2);

        expect(spawned.id).not.toBe(1);
        expect(world.get(1)).toBe(ship1);
        expect(world.get(spawned.id)).toBe(ship2);
    });

    test("ofKind iterates only alive entities of matching kind", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        const asteroid = new Asteroid(
            new Vector2(500, 300),
            new Vector2(0, 0),
            20,
            10,
        );
        world.spawn(ship);
        world.spawn(asteroid);

        const ships = [...world.ofKind("ship")];
        expect(ships.length).toBe(1);
        expect(ships[0]).toBe(ship);

        const asteroids = [...world.ofKind("asteroid")];
        expect(asteroids.length).toBe(1);
        expect(asteroids[0]).toBe(asteroid);

        const bullets = [...world.ofKind("bullet")];
        expect(bullets.length).toBe(0);
    });

    test("step spawns projectiles returned by ship update", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        world.spawn(ship);

        const input = {
            thrust: false,
            turnLeft: false,
            turnRight: false,
            fire: true,
            switchWeapon: false,
        };

        const events = world.step(1 / 30, input);

        const snapshot = world.getEntitiesSnapshot();
        const hasBullet = snapshot.some((e) => e.kind === "bullet");
        expect(hasBullet).toBe(true);
    });
});

describe("createWorldFromSeed", () => {
    test("same seed produces identical world", () => {
        const roomWidth = 1600;
        const roomHeight = 900;
        const asteroidCount = 8;

        const result1 = createWorldFromSeed(
            999,
            roomWidth,
            roomHeight,
            asteroidCount,
        );
        const result2 = createWorldFromSeed(
            999,
            roomWidth,
            roomHeight,
            asteroidCount,
        );

        expect(result1.asteroids.length).toBe(asteroidCount);
        expect(result2.asteroids.length).toBe(asteroidCount);

        for (let i = 0; i < asteroidCount; i++) {
            expect(result1.asteroids[i]!.pos.x).toBe(
                result2.asteroids[i]!.pos.x,
            );
            expect(result1.asteroids[i]!.pos.y).toBe(
                result2.asteroids[i]!.pos.y,
            );
            expect(result1.asteroids[i]!.vel.x).toBe(
                result2.asteroids[i]!.vel.x,
            );
            expect(result1.asteroids[i]!.vel.y).toBe(
                result2.asteroids[i]!.vel.y,
            );
            expect(result1.asteroids[i]!.radius).toBe(
                result2.asteroids[i]!.radius,
            );
        }

        expect(result1.pickupPos.x).toBe(result2.pickupPos.x);
        expect(result1.pickupPos.y).toBe(result2.pickupPos.y);
    });

    test("different seeds produce different worlds", () => {
        const roomWidth = 1600;
        const roomHeight = 900;
        const asteroidCount = 8;

        const result1 = createWorldFromSeed(
            111,
            roomWidth,
            roomHeight,
            asteroidCount,
        );
        const result2 = createWorldFromSeed(
            222,
            roomWidth,
            roomHeight,
            asteroidCount,
        );

        let allSame = true;
        for (let i = 0; i < asteroidCount; i++) {
            if (
                result1.asteroids[i]!.pos.x !== result2.asteroids[i]!.pos.x ||
                result1.asteroids[i]!.pos.y !== result2.asteroids[i]!.pos.y
            ) {
                allSame = false;
                break;
            }
        }
        expect(allSame).toBe(false);
    });
});

describe("integrate determinism", () => {
    test("integrate is deterministic", () => {
        const ship = new EntityLike2(
            new Vector2(400, 300),
            new Vector2(0, 0),
            0,
        );
        const input = { thrust: true, turnLeft: false, turnRight: false };
        const dt = 1 / 30;

        const result1 = integrate(ship, input, dt);
        const result2 = integrate(ship, input, dt);

        expect(result1.pos.x).toBe(result2.pos.x);
        expect(result1.pos.y).toBe(result2.pos.y);
        expect(result1.angle).toBe(result2.angle);
        expect(result1.vel.x).toBe(result2.vel.x);
        expect(result1.vel.y).toBe(result2.vel.y);
    });
});

class EntityLike2 {
    constructor(
        public pos: Vector2,
        public vel: Vector2,
        public angle: number,
        public radius = 10,
        public kind: "ship" = "ship",
        public hp = 3,
        public id = 1,
        public alive = true,
    ) {}
    takeDamage() {}
}
