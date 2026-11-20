import { Entity } from "./entity.js";
import { Vector2 } from "./Vector.js";

export class Pickup extends Entity {
    constructor(pos, id = 0) {
        super({
            pos,
            vel: new Vector2(),
            radius: 12,
            kind: "pickup",
            hp: 1,
            id,
        });
    }

    toSnapshot() {
        return {
            ...super.toSnapshot(),
        };
    }

    static fromSnapshot(data) {
        const pickup = new Pickup(new Vector2(data.x, data.y), data.id);
        pickup.alive = data.alive;
        return pickup;
    }
}
