import { Vector2 } from "./vector.js";
import { Entity } from "./entity.js";

/**
 * Creates a homing behavior that makes an entity turn toward a target.
 * @param target - The entity to home in on
 * @param turnSpeed - Maximum turn rate in radians per second (default 2.5)
 * @returns A behavior object with an update method
 */
export function createHomingBehavior(target: Entity, turnSpeed = 2.5) {
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


