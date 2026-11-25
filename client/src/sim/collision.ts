import { Entity } from "./entity.js";
import { Explosion } from "./explosion.js";
import { World } from "./world.js";
import { bus } from "../events/gameEvents.js";

export function circlesOverlap(a: Entity, b: Entity): boolean {
    const dx = a.pos.x - b.pos.x;
    const dy = a.pos.y - b.pos.y;
    const radiusSum = a.radius + b.radius;

    return dx * dx + dy * dy <= radiusSum * radiusSum;
}

export function resolveCollisions(world: World): void {
    const entities = [...world];

    for (let i = 0; i < entities.length; i++) {
        const a = entities[i];
        if (!a || !a.alive) continue;

        for (let j = i + 1; j < entities.length; j++) {
            const b = entities[j];
            if (!b || !b.alive || !circlesOverlap(a, b)) continue;

            if (a.kind === "ship" && b.kind === "pickup") {
                (a as ShipEntity).missileCount += 1;
                world.despawn(b.id);
            } else if (a.kind === "pickup" && b.kind === "ship") {
                (b as ShipEntity).missileCount += 1;
                world.despawn(a.id);
            } else if (
                (a.kind === "bullet" || a.kind === "missile") &&
                b.kind === "asteroid"
            ) {
                damageAsteroid(world, b, a);
            } else if (
                a.kind === "asteroid" &&
                (b.kind === "bullet" || b.kind === "missile")
            ) {
                damageAsteroid(world, a, b);
            } else if (a.kind === "ship" && b.kind === "asteroid") {
                damageShip(world, a);
            } else if (a.kind === "asteroid" && b.kind === "ship") {
                damageShip(world, b);
            }
        }
    }
}

function damageAsteroid(world: World, asteroid: Entity, projectile: Entity): void {
    asteroid.takeDamage(projectile.kind === "missile" ? 2 : 1);
    world.despawn(projectile.id);
    bus.emit("hit", { target: "asteroid" });

    if (!asteroid.alive) {
        world.score += 100;
        world.spawn(new Explosion(asteroid.pos));
        bus.emit("exploded", { target: "asteroid" });
    }
}

function damageShip(world: World, ship: Entity): void {
    const wasAlive = ship.alive;
    ship.takeDamage(1);

    if (wasAlive && !ship.alive) {
        world.spawn(new Explosion(ship.pos));
        bus.emit("exploded", { target: "ship" });
    }
}

// Type assertions for ship-specific properties
interface ShipEntity extends Entity {
    missileCount: number;
}