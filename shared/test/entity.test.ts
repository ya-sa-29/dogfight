import { describe, expect, test } from "vitest";
import { Entity } from "../../shared/sim/entity.ts";
import { Vector2 } from "../../shared/sim/vector.ts";
import { Ship } from "../../shared/sim/ship.ts";
import { Bullet } from "../../shared/sim/bullet.ts";
import { Asteroid } from "../../shared/sim/asteroid.ts";
import { Pickup } from "../../shared/sim/pickup.ts";
import { Explosion } from "../../shared/sim/explosion.ts";
import { World } from "../../shared/sim/world.ts";

describe("Entity", () => {
    test("constructor sets all properties", () => {
        const e = new Entity({
            pos: new Vector2(100, 200),
            vel: new Vector2(10, 20),
            radius: 15,
            kind: "ship",
            hp: 3,
            id: 42,
        });
        expect(e.pos.x).toBe(100);
        expect(e.pos.y).toBe(200);
        expect(e.vel.x).toBe(10);
        expect(e.vel.y).toBe(20);
        expect(e.radius).toBe(15);
        expect(e.kind).toBe("ship");
        expect(e.hp).toBe(3);
        expect(e.id).toBe(42);
        expect(e.alive).toBe(true);
    });

    test("takeDamage reduces hp and can kill", () => {
        const e = new Entity({
            pos: new Vector2(0, 0),
            vel: new Vector2(0, 0),
            radius: 5,
            kind: "asteroid",
            hp: 2,
            id: 1,
        });
        expect(e.alive).toBe(true);
        e.takeDamage(1);
        expect(e.hp).toBe(1);
        expect(e.alive).toBe(true);
        e.takeDamage(1);
        expect(e.hp).toBe(0);
        expect(e.alive).toBe(false);
    });

    test("toSnapshot preserves state", () => {
        const e = new Entity({
            pos: new Vector2(100, 200),
            vel: new Vector2(10, 20),
            radius: 15,
            kind: "ship",
            hp: 2,
            id: 42,
            angle: 0.5,
            thrust: true,
        });
        const snapshot = e.toSnapshot();
        expect(snapshot.id).toBe(42);
        expect(snapshot.kind).toBe("ship");
        expect(snapshot.x).toBe(100);
        expect(snapshot.y).toBe(200);
        expect(snapshot.hp).toBe(2);
        expect(snapshot.angle).toBe(0.5);
        expect(snapshot.alive).toBe(true);
    });

    test("fromSnapshot restores entity", () => {
        const snapshot = {
            id: 7,
            kind: "ship" as const,
            x: 50,
            y: 60,
            angle: 0.3,
            radius: 12,
            hp: 1,
            alive: true,
            thrust: false,
        };
        const restored = Entity.fromSnapshot(snapshot);
        expect(restored.id).toBe(7);
        expect(restored.kind).toBe("ship");
        expect(restored.pos.x).toBe(50);
        expect(restored.pos.y).toBe(60);
        expect(restored.hp).toBe(1);
        expect(restored.alive).toBe(true);
    });

    test("dead entity fromSnapshot stays dead", () => {
        const snapshot = {
            id: 3,
            kind: "asteroid" as const,
            x: 10,
            y: 10,
            angle: 0,
            radius: 20,
            hp: 0,
            alive: false,
        };
        const restored = Entity.fromSnapshot(snapshot);
        expect(restored.hp).toBe(0);
        expect(restored.alive).toBe(false);
    });
});

describe("Ship", () => {
    test("constructor sets ship-specific properties", () => {
        const ship = new Ship(400, 300, 1);
        expect(ship.pos.x).toBe(400);
        expect(ship.pos.y).toBe(300);
        expect(ship.id).toBe(1);
        expect(ship.weapon).toBe("bullet");
        expect(ship.missileCount).toBe(0);
        expect(ship.fireCooldown).toBe(0);
        expect(ship.invulnerabilityTimer).toBe(0);
        expect(ship.alive).toBe(true);
    });

    test("update returns projectiles when firing", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        world.spawn(ship);
        const projectiles = ship.update(
            1 / 30,
            {
                thrust: false,
                turnLeft: false,
                turnRight: false,
                fire: true,
                switchWeapon: false,
            },
            world,
        );
        expect(Array.isArray(projectiles)).toBe(true);
    });
});

describe("Bullet", () => {
    test("constructor and snapshot round-trip", () => {
        const bullet = new Bullet(
            new Vector2(100, 100),
            new Vector2(50, 50),
            0.5,
            1.5,
            10,
        );
        expect(bullet.ttl).toBe(1.5);
        expect(bullet.kind).toBe("bullet");
        const snapshot = bullet.toSnapshot();
        expect(snapshot.id).toBe(10);
        expect(snapshot.kind).toBe("bullet");
        expect(snapshot.x).toBe(100);
        expect(snapshot.y).toBe(100);

        const restored = Bullet.fromSnapshot(snapshot);
        expect(restored.ttl).toBe(1.5);
        expect(restored.id).toBe(10);
    });
});

describe("Asteroid", () => {
    test("constructor and snapshot round-trip", () => {
        const asteroid = new Asteroid(
            new Vector2(100, 200),
            new Vector2(10, 10),
            30,
            42,
        );
        const snapshot = asteroid.toSnapshot();
        expect(snapshot.radius).toBe(30);
        expect(snapshot.id).toBe(42);
        expect(snapshot.kind).toBe("asteroid");

        const restored = Asteroid.fromSnapshot(snapshot);
        expect(restored.radius).toBe(30);
        expect(restored.id).toBe(42);
    });
});

describe("Pickup", () => {
    test("constructor and snapshot round-trip", () => {
        const pickup = new Pickup(new Vector2(405, 300), 2);
        const snapshot = pickup.toSnapshot();
        expect(snapshot.id).toBe(2);
        expect(snapshot.kind).toBe("pickup");

        const restored = Pickup.fromSnapshot(snapshot);
        expect(restored.id).toBe(2);
        expect(restored.kind).toBe("pickup");
    });

    test("fromSnapshot throws for non-pickup kind", () => {
        const data = {
            kind: "ship" as const,
            x: 100,
            y: 200,
            angle: 0,
            radius: 15,
            hp: 3,
            alive: true,
            id: 1,
        };
        expect(() => Pickup.fromSnapshot(data as never)).toThrow(
            "Cannot create Pickup from non-pickup snapshot",
        );
    });
});

describe("Entity fromSnapshot edge cases", () => {
    test("fromSnapshot throws for unknown entity kind", () => {
        const data = {
            kind: "unknown" as never,
            x: 100,
            y: 200,
            angle: 0,
            radius: 10,
            hp: 1,
            alive: true,
            id: 1,
        };
        expect(() => Entity.fromSnapshot(data)).toThrow(
            "Unknown entity kind: unknown",
        );
    });
});

describe("Explosion", () => {
    test("constructor creates particles", () => {
        const explosion = new Explosion(
            new Vector2(100, 100),
            12,
            Math.random,
            1,
            true,
        );
        expect(explosion.particles.length).toBe(12);
    });

    test("toSnapshot includes particles", () => {
        const rng = () => 0.5;
        const explosion = new Explosion(new Vector2(100, 100), 3, rng, 1, true);
        const snapshot = explosion.toSnapshot();
        expect(snapshot.particles.length).toBe(3);
        expect(typeof snapshot.particles[0]!.x).toBe("number");
    });
});



