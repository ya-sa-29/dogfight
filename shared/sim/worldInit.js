import { Asteroid } from "./asteroid.js";
import { Pickup } from "./pickup.js";
import { Vector2 } from "./vector.js";
import { createRNG } from "../rng/mulberry32.js";
import { createHomingBehavior } from "./homing.js";

export function createWorldFromSeed(seed, roomWidth, roomHeight, asteroidCount) {
    const rng = createRNG(seed);

    const asteroids = [];
    for (let i = 0; i < asteroidCount; i++) {
        const pos = new Vector2(
            80 + rng.random() * (roomWidth - 160),
            80 + rng.random() * (roomHeight - 160),
        );

        const vel = new Vector2(
            (rng.random() - 0.5) * 80,
            (rng.random() - 0.5) * 80,
        );

        const radius = 18 + rng.random() * 17;
        asteroids.push({ pos, vel, radius });
    }

    const pickupPos = new Vector2(roomWidth * 0.7, roomHeight * 0.3);

    return { asteroids, pickupPos };
}

export function initializeWorld(world, seed, roomWidth, roomHeight, asteroidCount, ship) {
    const { asteroids, pickupPos } = createWorldFromSeed(seed, roomWidth, roomHeight, asteroidCount);

    for (let i = 0; i < asteroids.length; i++) {
        const asteroid = new Asteroid(asteroids[i].pos, asteroids[i].vel, asteroids[i].radius, i + 10);
        world.spawn(asteroid);

        if (i === 0 && ship) {
            asteroid.behaviors.push(createHomingBehavior(ship));
        }
    }

    world.spawn(new Pickup(pickupPos));

    return world;
}