import { Entity } from "./entity.js";
import { Vector2 } from "./Vector.js";

export class Pickup extends Entity {
    constructor(pos) {
        super({
            pos,
            vel: new Vector2(),
            radius: 12,
            kind: "pickup",
        });
    }
}
