import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";
import { World } from "./world.js";

export class Bullet extends Entity {
    ttl: number;

    constructor(pos: Vector2, vel: Vector2, angle: number, ttl = 1.5, id?: number) {
        super({
            pos,
            vel,
            angle,
            radius: 3,
            kind: "bullet",
            id,
        });

        this.ttl = ttl;
    }

    override update(dt: number, _input: unknown, world: World): void {
        super.update(dt);

        this.ttl -= dt;

        if (this.ttl <= 0) {
            world.despawn(this.id);
        }
    }
}