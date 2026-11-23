import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Pickup extends Entity {
    constructor(pos: Vector2, id?: number) {
        super({
            pos,
            vel: new Vector2(),
            radius: 12,
            kind: "pickup",
            id,
        });
    }
}