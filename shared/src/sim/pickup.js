
import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

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
