import { Vector2 } from "./vector.js";

export function integrate(ship, input, dt) {
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
