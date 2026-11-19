
import { Entity } from "./entity.js";

export class Bullet extends Entity {
    constructor(
        pos,
        vel,
        angle,
        ttl = 1.5,
        { playerId = null, clientShotId = null } = {},
    ) {
        super({
            pos,
            vel,
            angle,
            radius: 3,
            kind: "bullet",
        });

        this.ttl = ttl;
        this.playerId = playerId;
        this.clientShotId = clientShotId;
    }

    update(dt, input, world) {
        super.update(dt, input, world);

        this.ttl -= dt;

        if (this.ttl <= 0) {
            world.despawn(this.id);
        }
    }
}
