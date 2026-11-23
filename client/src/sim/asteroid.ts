import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Asteroid extends Entity {
    constructor(pos: Vector2, vel: Vector2, radius = 25, id?: number) {
        super({
            pos,
            vel,
            radius,
            kind: "asteroid",
            hp: 2,
            id,
        });
    }
}