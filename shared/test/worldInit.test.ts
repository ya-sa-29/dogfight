import { describe, expect, test } from "vitest";
import {
    createWorldFromSeed,
    initializeWorld,
} from "../../shared/sim/worldInit.ts";
import { World } from "../../shared/sim/world.ts";
import { Ship } from "../../shared/sim/ship.ts";
import { Asteroid } from "../../shared/sim/asteroid.ts";
import { Pickup } from "../../shared/sim/pickup.ts";
import { Vector2 } from "../../shared/sim/vector.ts";

describe("createWorldFromSeed", () => {
    const WIDTH = 1600;
    const HEIGHT = 900;
    const COUNT = 8;

    test("returns correct number of asteroids", () => {
        const result = createWorldFromSeed(42, WIDTH, HEIGHT, COUNT);
        expect(result.asteroids.length).toBe(COUNT);
    });

    test("asteroid positions are within arena bounds", () => {
        const result = createWorldFromSeed(42, WIDTH, HEIGHT, COUNT);
        for (const asteroid of result.asteroids) {
            expect(asteroid.pos.x).toBeGreaterThanOrEqual(80);
            expect(asteroid.pos.x).toBeLessThanOrEqual(WIDTH - 80);
            expect(asteroid.pos.y).toBeGreaterThanOrEqual(80);
            expect(asteroid.pos.y).toBeLessThanOrEqual(HEIGHT - 80);
        }
    });

    test("asteroid radii are in valid range", () => {
        const result = createWorldFromSeed(42, WIDTH, HEIGHT, COUNT);
        for (const asteroid of result.asteroids) {
            expect(asteroid.radius).toBeGreaterThanOrEqual(18);
            expect(asteroid.radius).toBeLessThanOrEqual(35);
        }
    });

    test("pickup position is at 70% width, 30% height", () => {
        const result = createWorldFromSeed(42, WIDTH, HEIGHT, COUNT);
        expect(result.pickupPos.x).toBeCloseTo(WIDTH * 0.7);
        expect(result.pickupPos.y).toBeCloseTo(HEIGHT * 0.3);
    });

    test("same seed produces identical world", () => {
        const r1 = createWorldFromSeed(999, WIDTH, HEIGHT, COUNT);
        const r2 = createWorldFromSeed(999, WIDTH, HEIGHT, COUNT);
        expect(r1.asteroids.length).toBe(r2.asteroids.length);
        for (let i = 0; i < COUNT; i++) {
            expect(r1.asteroids[i]!.pos.x).toBe(r2.asteroids[i]!.pos.x);
            expect(r1.asteroids[i]!.pos.y).toBe(r2.asteroids[i]!.pos.y);
            expect(r1.asteroids[i]!.radius).toBe(r2.asteroids[i]!.radius);
        }
    });
});

describe("initializeWorld", () => {
    test("spawns asteroids with homing behavior on first asteroid", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        world.spawn(ship);

        initializeWorld(world, 42, 1600, 900, 5, ship);

        const asteroids = [...world.ofKind("asteroid")];
        expect(asteroids.length).toBe(5);
        expect(asteroids[0]!.behaviors.length).toBeGreaterThan(0);
    });

    test("spawns a pickup", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        world.spawn(ship);

        initializeWorld(world, 42, 1600, 900, 5, ship);

        const pickups = [...world.ofKind("pickup")];
        expect(pickups.length).toBe(1);
    });

    test("without ship, first asteroid has no homing behavior", () => {
        const world = new World();
        initializeWorld(world, 42, 1600, 900, 5, undefined as unknown as Ship);

        const asteroids = [...world.ofKind("asteroid")];
        expect(asteroids.length).toBe(5);
        expect(asteroids[0]!.behaviors.length).toBe(0);
    });
});



