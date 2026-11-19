
import { Entity } from "./entity.js";
import { createHomingBehavior } from "./homing.js";

export class Missile extends Entity {
    constructor(
        pos,
        vel,
        angle,
        targetId,
        ttl = 4,
        { playerId = null, clientShotId = null } = {},
    ) {
        super({
            pos,
            vel,
            angle,
            radius: 6,
            kind: "missile",
        });

        this.ttl = ttl;
        this.targetId = targetId;
        this.playerId = playerId;
        this.clientShotId = clientShotId;

        if (targetId !== undefined && targetId !== null) {
            this.behaviors.push(createHomingBehavior(targetId));
        }
    }

    update(dt, input, world) {
        super.update(dt, input, world);

        this.ttl -= dt;

        if (this.ttl <= 0) {
            world.despawn(this.id);
        }
    }
}
