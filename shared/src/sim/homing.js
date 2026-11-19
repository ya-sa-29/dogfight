
import { Vector2 } from "./vector.js";

export function createHomingBehavior(targetId, turnSpeed = 2.5) {
    return {
        update(entity, dt, world) {
            const target = world.get(targetId);

            if (!target || !target.alive) return;

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
