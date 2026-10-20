export function drawGrid(context, width, height) {
    context.save();

    context.strokeStyle = "rgba(153, 225, 217, 0.08)";
    context.lineWidth = 1;

    const gridSize = 40;

    for (let x = 0; x <= width; x += gridSize) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
    }

    for (let y = 0; y <= height; y += gridSize) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }

    context.restore();
}

export function drawShip(context, ship) {
    context.save();

    context.translate(ship.x, ship.y);
    context.rotate(ship.angle);

    if (ship.thrust) {
        context.beginPath();
        context.moveTo(-10, -5);
        context.lineTo(-22, 0);
        context.lineTo(-10, 5);
        context.fillStyle = "#F1FEC8";
        context.fill();
    }

    context.beginPath();
    context.moveTo(15, 0);
    context.lineTo(-10, -9);
    context.lineTo(-6, 0);
    context.lineTo(-10, 9);
    context.closePath();

    context.fillStyle = "#99E1D9";
    context.fill();

    context.restore();
}

export function drawBullet(context, bullet) {
    context.save();

    context.beginPath();
    context.arc(bullet.pos.x, bullet.pos.y, bullet.radius, 0, Math.PI * 2);
    context.fillStyle = "#F1FEC8";
    context.fill();

    context.restore();
}

export function drawAsteroid(context, asteroid) {
    context.save();
    context.beginPath();
    context.arc(
        asteroid.pos.x,
        asteroid.pos.y,
        asteroid.radius,
        0,
        Math.PI * 2,
    );
    context.strokeStyle = "#D6A77A";
    context.lineWidth = 2;
    context.stroke();
    context.restore();
}
