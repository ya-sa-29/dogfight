import { Entity } from "./entity.js";

export class Asteroid extends Entity {
    constructor(pos, vel, radius = 25) {
        super({
            pos,
            vel,
            radius,
            kind: "asteroid",
            hp: 2,
        });
    }
}
