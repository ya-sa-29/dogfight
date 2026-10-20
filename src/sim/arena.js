import { Vector2 } from "./Vector.js";

export function wrapShip(ship, width, height) {
    ship.pos = new Vector2(
        ((ship.pos.x % width) + width) % width,
        ((ship.pos.y % height) + height) % height,
    );
}
