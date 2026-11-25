export function circlesOverlap(a, b) {
    const dx = a.pos.x - b.pos.x;
    const dy = a.pos.y - b.pos.y;
    const radiusSum = a.radius + b.radius;

    return dx * dx + dy * dy <= radiusSum * radiusSum;
}

export function resolveCollisions(world) {
    const entities = [...world];
    const events = [];

    for (let i = 0; i < entities.length; i++) {
        const a = entities[i];
        if (!a.alive) continue;

        for (let j = i + 1; j < entities.length; j++) {
            const b = entities[j];
            if (!b.alive || !circlesOverlap(a, b)) continue;

            if (a.kind === "ship" && b.kind === "pickup") {
                a.missileCount += 1;
                world.despawn(b.id);
                events.push({ type: "pickup", shipId: a.id, pickupId: b.id });
            } else if (a.kind === "pickup" && b.kind === "ship") {
                b.missileCount += 1;
                world.despawn(a.id);
                events.push({ type: "pickup", shipId: b.id, pickupId: a.id });
            } else if (
                (a.kind === "bullet" || a.kind === "missile") &&
                b.kind === "asteroid"
            ) {
                const destroyed = damageAsteroid(world, b, a);
                events.push({
                    type: "hit",
                    target: "asteroid",
                    asteroidId: b.id,
                    projectileId: a.id,
                    destroyed,
                });
            } else if (
                a.kind === "asteroid" &&
                (b.kind === "bullet" || b.kind === "missile")
            ) {
                const destroyed = damageAsteroid(world, a, b);
                events.push({
                    type: "hit",
                    target: "asteroid",
                    asteroidId: a.id,
                    projectileId: b.id,
                    destroyed,
                });
            } else if (a.kind === "ship" && b.kind === "asteroid") {
                damageShip(world, a);
                events.push({
                    type: "hit",
                    target: "ship",
                    shipId: a.id,
                    asteroidId: b.id,
                });
            } else if (a.kind === "asteroid" && b.kind === "ship") {
                damageShip(world, b);
                events.push({
                    type: "hit",
                    target: "ship",
                    shipId: b.id,
                    asteroidId: a.id,
                });
            }
        }
    }

    return events;
}

function damageAsteroid(world, asteroid, projectile) {
    const isMissile = projectile.kind === "missile";
    asteroid.takeDamage(isMissile ? 2 : 1);
    world.despawn(projectile.id);

    if (!asteroid.alive) {
        world.score += 100;
        return true;
    }
    return false;
}

function damageShip(world, ship) {
    const wasAlive = ship.alive;
    ship.takeDamage(1);

    if (wasAlive && !ship.alive) {
        return true;
    }
    return false;
}
