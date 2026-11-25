import { Entity } from "./entity.js";
import { createHomingBehavior } from "./homing.js";

export class Missile extends Entity {
    constructor(pos, vel, angle, target, ttl = 4, id = 0) {
        super({
            pos,
            vel,
            angle,
            radius: 6,
            kind: "missile",
            hp: 1,
            id,
        });

        this.ttl = ttl;

        if (target) {
            this.behaviors.push(createHomingBehavior(target));
        }
    }

    update(dt, input, world) {
        super.update(dt);

        this.ttl -= dt;

        if (this.ttl <= 0) {
            world.despawn(this.id);
        }
    }

    toSnapshot() {
        return {
            ...super.toSnapshot(),
            ttl: this.ttl,
        };
    }

    static fromSnapshot(data) {
        const missile = new Missile(
            new Vector2(data.x, data.y),
            new Vector2(0, 0),
            data.angle,
            null,
            data.ttl,
            data.id,
        );
        missile.alive = data.alive;
        return missile;
    }
}

import { Vector2 } from "./vector.js";
