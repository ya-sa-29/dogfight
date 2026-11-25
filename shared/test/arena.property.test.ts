import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { World } from "../../shared/sim/world.js";
import { Ship } from "../../shared/sim/ship.js";
import { Vector2 } from "../../shared/sim/vector.js";
import { createRNG } from "../../shared/rng/mulberry32.js";
import { createWorldFromSeed } from "../../shared/sim/worldInit.js";

const ARENA_WIDTH = 1600;
const ARENA_HEIGHT = 900;
const NEUTRAL_INPUT = {
    thrust: false,
    turnLeft: false,
    turnRight: false,
    fire: false,
    switchWeapon: false,
};

function inArena(pos: Vector2): boolean {
    return (
        pos.x >= 0 &&
        pos.x <= ARENA_WIDTH &&
        pos.y >= 0 &&
        pos.y <= ARENA_HEIGHT
    );
}

describe("ships stay within arena bounds (property-based)", () => {
    test("ship position stays within arena over 1000 neutral input steps", () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 10000 }), (seed) => {
                const rng = createRNG(seed);
                const world = new World();
                const ship = new Ship(400, 300, 1);
                world.spawn(ship);

                const dt = 1 / 30;
                const input = {
                    thrust: false,
                    turnLeft: rng.random() > 0.5,
                    turnRight: rng.random() > 0.5,
                    fire: false,
                    switchWeapon: false,
                };

                for (let i = 0; i < 1000; i++) {
                    const projectiles = ship.update(dt, input, world);
                    for (const p of projectiles) {
                        world.spawn(p);
                    }
                    world.step(dt, new Map([[ship.id, input]]));

                    if (!inArena(ship.pos)) {
                        throw new Error(
                            `Ship left arena at step ${i}: (${ship.pos.x}, ${ship.pos.y})`,
                        );
                    }
                }
            }),
            { numRuns: 20 },
        );
    });

    test("asteroids stay within arena bounds", () => {
        fc.assert(
            fc.property(
                fc.tuple(
                    fc.integer({ min: 0, max: 10000 }),
                    fc.integer({ min: 1, max: 20 }),
                ),
                ([seed, asteroidCount]) => {
                    const result = createWorldFromSeed(
                        seed,
                        ARENA_WIDTH,
                        ARENA_HEIGHT,
                        asteroidCount,
                    );

                    for (const asteroid of result.asteroids) {
                        expect(inArena(asteroid.pos)).toBe(true);
                    }

                    expect(inArena(result.pickupPos)).toBe(true);
                },
            ),
            { numRuns: 50 },
        );
    });
});
