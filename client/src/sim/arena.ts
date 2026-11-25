import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export function wrapShip(ship: Entity, width: number, height: number): void {
    ship.pos = new Vector2(
        ((ship.pos.x % width) + width) % width,
        ((ship.pos.y % height) + height) % height,
    );
}