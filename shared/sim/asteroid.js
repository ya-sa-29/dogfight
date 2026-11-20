import { Entity } from "./entity.js";

export class Asteroid extends Entity {
    constructor(pos, vel, radius = 25, id = 0) {
        super({
            pos,
            vel,
            radius,
            kind: "asteroid",
            hp: 2,
            id,
        });
    }

    toSnapshot() {
        return {
            ...super.toSnapshot(),
        };
    }

    static fromSnapshot(data) {
        const asteroid = new Asteroid(
            new Vector2(data.x, data.y),
            new Vector2(0, 0),
            data.radius,
            data.id,
        );
        asteroid.alive = data.alive;
        asteroid.hp = data.hp; // Note: hp is private in Entity, need to handle this
        return asteroid;
    }
}

import { Vector2 } from "./vector.js";
