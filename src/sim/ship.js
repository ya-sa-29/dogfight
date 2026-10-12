export function createShip(x = 400, y = 300) {
    return {
        x,
        y,
        vx: 0,
        vy: 0,
        angle: 0,
        thrust: false,
    };
}

export function integrate(ship, input, dt) {
    const rotationSpeed = 3;
    const acceleration = 200;
    const drag = 0.98;
    const maxSpeed = 300;

    if (input.isDown("ArrowLeft") || input.isDown("KeyA")) {
        ship.angle -= rotationSpeed * dt;
    }

    if (input.isDown("ArrowRight") || input.isDown("KeyD")) {
        ship.angle += rotationSpeed * dt;
    }

    ship.thrust = input.isDown("ArrowUp") || input.isDown("KeyW");

    if (ship.thrust) {
        ship.vx += Math.cos(ship.angle) * acceleration * dt;
        ship.vy += Math.sin(ship.angle) * acceleration * dt;
    }

    ship.vx *= drag;
    ship.vy *= drag;

    const speed = Math.hypot(ship.vx, ship.vy);

    if (speed > maxSpeed) {
        ship.vx = (ship.vx / speed) * maxSpeed;
        ship.vy = (ship.vy / speed) * maxSpeed;
    }

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
}
