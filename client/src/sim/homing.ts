import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export interface HomingBehavior {
    update(entity: Entity, dt: number): void;
}

export function createHomingBehavior(target: Entity, turnSpeed = 2.5): HomingBehavior {
    return {
        update(entity: Entity, dt: number): void {
            if (!target.alive) return;

            const toTarget = target.pos.sub(entity.pos);
            const targetAngle = Math.atan2(toTarget.y, toTarget.x);

            let angleDifference = targetAngle - entity.angle;

            while (angleDifference > Math.PI) {
                angleDifference -= Math.PI * 2;
            }

            while (angleDifference < -Math.PI) {
                angleDifference += Math.PI * 2;
            }

            const maxTurn = turnSpeed * dt;
            const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDifference));

            entity.angle += turn;

            const speed = entity.vel.length;
            entity.vel = Vector2.fromAngle(entity.angle).scale(speed);
        },
    };
}