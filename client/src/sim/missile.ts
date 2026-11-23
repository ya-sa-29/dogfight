import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";
import { World } from "./world.js";
import { createHomingBehavior } from "./homing.js";

export class Missile extends Entity {
    ttl: number;

    constructor(
        pos: Vector2,
        vel: Vector2,
        angle: number,
        target: Entity | null,
        ttl = 4,
        id?: number,
    ) {
        super({
            pos,
            vel,
            angle,
            radius: 6,
            kind: "missile",
            id,
        });

        this.ttl = ttl;

        if (target) {
            this.behaviors.push(createHomingBehavior(target));
        }
    }

    override update(dt: number, _input: unknown, world: World): void {
        super.update(dt);

        this.ttl -= dt;

        if (this.ttl <= 0) {
            world.despawn(this.id);
        }
    }
}