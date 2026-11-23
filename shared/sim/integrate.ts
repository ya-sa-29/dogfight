import { Vector2 } from "./vector.js";
import { Entity } from "./entity.js";

/**
 * Input shape for the integrate function (matches Ship input).
 */
export interface ShipInput {
  turnLeft: boolean;
  turnRight: boolean;
  thrust: boolean;
}

/**
 * Result of the integrate function - a new predicted state.
 */
export interface IntegratedState {
  pos: Vector2;
  vel: Vector2;
  angle: number;
  thrust: boolean;
}

/**
 * Integrate ship physics for one timestep.
 * This is a pure function used for client-side prediction.
 * It mirrors the server's Ship.update logic without world interaction.
 *
 * @param ship - Current ship state (pos, vel, angle)
 * @param input - Player input for this step
 * @param dt - Time step in seconds
 * @returns New integrated state (pos, vel, angle, thrust)
 */
export function integrate(ship: Entity, input: ShipInput, dt: number): IntegratedState {
  const rotationSpeed = 3;
  const acceleration = 200;
  const drag = 0.98;
  const maxSpeed = 300;

  let angle = ship.angle;
  let vel = new Vector2(ship.vel.x, ship.vel.y);

  if (input.turnLeft) {
    angle -= rotationSpeed * dt;
  }

  if (input.turnRight) {
    angle += rotationSpeed * dt;
  }

  const thrust = input.thrust;

  if (thrust) {
    const direction = Vector2.fromAngle(angle);
    vel = vel.add(direction.scale(acceleration * dt));
  }

  vel = vel.scale(drag);

  const speed = vel.length;

  if (speed > maxSpeed) {
    vel = vel.normalize().scale(maxSpeed);
  }

  const pos = new Vector2(ship.pos.x + vel.x * dt, ship.pos.y + vel.y * dt);

  return { pos, vel, angle, thrust };
}