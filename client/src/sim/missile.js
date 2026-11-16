import { Entity } from "./entity.js";
import { createHomingBehavior } from "./homing.js";

export class Missile extends Entity {
    constructor(pos, vel, angle, target, ttl = 4) {
        super({
            pos,
            vel,
            angle,
            radius: 6,
            kind: "missile",
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
}
