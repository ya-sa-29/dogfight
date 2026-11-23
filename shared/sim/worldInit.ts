import { Asteroid } from "./asteroid.js";
import { Pickup } from "./pickup.js";
import { Vector2 } from "./vector.js";
import { createRNG, SeededRNG } from "../rng/mulberry32.js";
import { createHomingBehavior } from "./homing.js";
import { World } from "./world.js";
import { Entity, EntityId, asEntityId } from "./entity.js";

/**
 * World initialization data returned by createWorldFromSeed.
 */
export interface WorldInitData {
  readonly asteroids: readonly {
    readonly pos: Vector2;
    readonly vel: Vector2;
    readonly radius: number;
  }[];
  readonly pickupPos: Vector2;
}

/**
 * Create deterministic world layout from a seed.
 * @returns Object containing asteroid configurations and pickup position
 */
export function createWorldFromSeed(
  seed: number,
  roomWidth: number,
  roomHeight: number,
  asteroidCount: number,
): WorldInitData {
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

/**
 * Initialize a world with asteroids and a pickup based on the seed.
 * @param world - The world to populate
 * @param seed - Deterministic seed for world generation
 * @param roomWidth - Arena width
 * @param roomHeight - Arena height
 * @param asteroidCount - Number of asteroids to spawn
 * @param ship - Reference ship (first asteroid will home toward it)
 * @returns The initialized world (for chaining)
 */
export function initializeWorld(
  world: World,
  seed: number,
  roomWidth: number,
  roomHeight: number,
  asteroidCount: number,
  ship: Entity,
): World {
  const { asteroids, pickupPos } = createWorldFromSeed(seed, roomWidth, roomHeight, asteroidCount);

  for (let i = 0; i < asteroids.length; i++) {
    const asteroidData = asteroids[i];
    if (!asteroidData) continue;
    const asteroid = new Asteroid(asteroidData.pos, asteroidData.vel, asteroidData.radius, asEntityId(i + 10));
    world.spawn(asteroid);

    if (i === 0 && ship) {
      asteroid.behaviors.push(createHomingBehavior(ship));
    }
  }

  world.spawn(new Pickup(pickupPos));

  return world;
}