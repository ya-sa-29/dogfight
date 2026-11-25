import { Entity } from "./entity.js";

export class Bullet extends Entity {
    constructor(pos, vel, angle, ttl = 1.5, id = 0) {
        super({
            pos,
            vel,
            angle,
            radius: 3,
            kind: "bullet",
            hp: 1,
            id,
        });

        this.ttl = ttl;
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
        const bullet = new Bullet(
            new Vector2(data.x, data.y),
            new Vector2(0, 0),
            data.angle,
            data.ttl,
            data.id,
        );
        bullet.alive = data.alive;
        return bullet;
    }
}

import { Vector2 } from "./vector.js";
