import { describe, expect, test } from "vitest";
import { Ship } from "../../shared/sim/ship.js";
import { Vector2 } from "../../shared/sim/vector.js";
import { World } from "../../shared/sim/world.js";
import { Asteroid } from "../../shared/sim/asteroid.js";
import { Pickup } from "../../shared/sim/pickup.js";

describe("Ship", () => {
    test("constructor sets ship-specific state", () => {
        const ship = new Ship(400, 300, 1);
        expect(ship.pos.x).toBe(400);
        expect(ship.pos.y).toBe(300);
        expect(ship.id).toBe(1);
        expect(ship.weapon).toBe("bullet");
        expect(ship.missileCount).toBe(0);
        expect(ship.fireCooldown).toBe(0);
        expect(ship.invulnerabilityTimer).toBe(0);
        expect(ship.thrust).toBe(false);
        expect(ship.alive).toBe(true);
    });

    test("fire cooldown prevents rapid firing", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        world.spawn(ship);

        const fire = {
            thrust: false,
            turnLeft: false,
            turnRight: false,
            fire: true,
            switchWeapon: false,
        };

        const p1 = ship.update(1 / 30, fire, world);
        expect(p1.length).toBeGreaterThan(0);
        expect(ship.fireCooldown).toBeGreaterThan(0);

        const p2 = ship.update(1 / 30, fire, world);
        expect(p2.length).toBe(0);
    });

    test("fire cooldown expires after 0.25s", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        world.spawn(ship);

        const fire = {
            thrust: false,
            turnLeft: false,
            turnRight: false,
            fire: true,
            switchWeapon: false,
        };
        ship.update(1 / 30, fire, world);
        expect(ship.fireCooldown).toBe(0.25);

        // Advance past cooldown
        for (let i = 0; i < 30; i++) {
            ship.update(1 / 30, { ...fire, fire: false }, world);
        }
        expect(ship.fireCooldown).toBe(0);
    });

    test("switchWeapon toggles between bullet and missile", () => {
        const ship = new Ship(400, 300, 1);
        expect(ship.weapon).toBe("bullet");

        ship.update(
            1 / 30,
            {
                thrust: false,
                turnLeft: false,
                turnRight: false,
                fire: false,
                switchWeapon: true,
            },
            new World(),
        );
        // No missiles, so switch back to bullet
        expect(ship.weapon).toBe("bullet");

        ship.missileCount = 1;
        ship.update(
            1 / 30,
            {
                thrust: false,
                turnLeft: false,
                turnRight: false,
                fire: false,
                switchWeapon: true,
            },
            new World(),
        );
        expect(ship.weapon).toBe("missile");
    });

    test("takeDamage sets invulnerabilityTimer", () => {
        const ship = new Ship(400, 300, 1);
        expect(ship.invulnerabilityTimer).toBe(0);

        ship.takeDamage(1);
        expect(ship.hp).toBe(2);
        expect(ship.invulnerabilityTimer).toBe(1);

        // Damage during invulnerability is ignored
        ship.takeDamage(1);
        expect(ship.hp).toBe(2);
    });

    test("createBullet returns bullet at ship nose", () => {
        const ship = new Ship(400, 300, 1);
        ship.angle = 0;
        const bullet = ship.createBullet();

        const expectedNose = ship.pos.add(Vector2.fromAngle(0).scale(15));
        expect(bullet.pos.x).toBeCloseTo(expectedNose.x);
        expect(bullet.pos.y).toBeCloseTo(expectedNose.y);
        expect(bullet.kind).toBe("bullet");
    });

    test("createMissile returns null when no asteroid target", () => {
        const ship = new Ship(400, 300, 1);
        const world = new World();
        world.spawn(ship);

        const missile = ship.createMissile(world);
        expect(missile).toBeNull();
    });

    test("createMissile returns missile when asteroid exists", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        world.spawn(ship);
        world.spawn(
            new Asteroid(new Vector2(500, 300), new Vector2(0, 0), 20, 10),
        );

        const missile = ship.createMissile(world);
        expect(missile).not.toBeNull();
        expect(missile!.kind).toBe("missile");
    });

    test("fromSnapshot restores ship state", () => {
        const ship = new Ship(100, 200, 5);
        ship.angle = 0.5;
        ship.weapon = "missile";
        ship.missileCount = 3;
        ship.fireCooldown = 0.1;
        ship.invulnerabilityTimer = 0.5;
        const snapshot = ship.toSnapshot();

        const restored = Ship.fromSnapshot(snapshot);
        expect(restored.pos.x).toBe(100);
        expect(restored.pos.y).toBe(200);
        expect(restored.angle).toBe(0.5);
        expect(restored.weapon).toBe("missile");
        expect(restored.missileCount).toBe(3);
        expect(restored.fireCooldown).toBe(0.1);
        expect(restored.invulnerabilityTimer).toBe(0.5);
    });
});
