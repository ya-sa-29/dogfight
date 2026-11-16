import { Entity } from "./entity.js";

export class Bullet extends Entity {
    constructor(pos, vel, angle, ttl = 1.5) {
        super({
            pos,
            vel,
            angle,
            radius: 3,
            kind: "bullet",
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
}
