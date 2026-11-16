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

export function drawMissile(context, missile) {
    context.save();

    context.translate(missile.pos.x, missile.pos.y);
    context.rotate(missile.angle);

    // Хвіст ракети
    context.beginPath();
    context.moveTo(-5, -3);
    context.lineTo(-12, 0);
    context.lineTo(-5, 3);
    context.closePath();
    context.fillStyle = "#FF7777";
    context.fill();

    // Корпус ракети
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-4, -3);
    context.lineTo(-4, 3);
    context.closePath();
    context.fillStyle = "#F04444";
    context.fill();

    // Носик
    context.beginPath();
    context.arc(5, 0, 1.5, 0, Math.PI * 2);
    context.fillStyle = "#FFD6D6";
    context.fill();

    context.restore();
}

export function drawPickup(context, pickup) {
    context.save();

    context.translate(pickup.pos.x, pickup.pos.y);

    // Ромб позначає боєзапас ракет
    context.beginPath();
    context.moveTo(0, -pickup.radius);
    context.lineTo(pickup.radius, 0);
    context.lineTo(0, pickup.radius);
    context.lineTo(-pickup.radius, 0);
    context.closePath();

    context.fillStyle = "#F04444";
    context.fill();

    context.strokeStyle = "#FFD6D6";
    context.lineWidth = 2;
    context.stroke();

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

export function drawExplosion(context, explosion) {
    for (const particle of explosion.particles) {
        if (particle.life <= 0) continue;

        const progress = 1 - particle.life / particle.maxLife;
        const alpha = 1 - progress;
        const size = 2 + (1 - progress) * 2;

        const x = explosion.pos.x + particle.pos.x;
        const y = explosion.pos.y + particle.pos.y;

        context.globalAlpha = alpha;
        context.fillStyle = "#FFD166";
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
    }

    context.globalAlpha = 1;
}
