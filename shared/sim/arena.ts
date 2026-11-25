import { Vector2 } from "./vector.js";
import { Entity } from "./entity.js";

/**
 * Wraps a ship's position to stay within the arena bounds.
 * Uses modulo arithmetic that works correctly for negative coordinates.
 * @param ship - The ship to wrap
 * @param width - Arena width
 * @param height - Arena height
 */
export function wrapShip(ship: Entity, width: number, height: number): void {
  ship.pos = new Vector2(
    ((ship.pos.x % width) + width) % width,
    ((ship.pos.y % height) + height) % height,
  );
}


