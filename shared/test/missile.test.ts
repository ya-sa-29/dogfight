import { describe, expect, test } from "vitest";
import { Missile } from "../../shared/sim/missile.ts";
import { Vector2 } from "../../shared/sim/vector.ts";
import { World } from "../../shared/sim/world.ts";
import { Asteroid } from "../../shared/sim/asteroid.ts";

describe("Missile", () => {
    test("constructor sets ttl and kind", () => {
        const target = new EntityLike(
            new Vector2(500, 500),
            new Vector2(0, 0),
            20,
            1,
        );
        const missile = new Missile(
            new Vector2(100, 100),
            new Vector2(0, 0),
            0,
            target,
        );

        expect(missile.kind).toBe("missile");
        expect(missile.ttl).toBe(4);
        expect(missile.behaviors.length).toBe(1);
    });

    test("constructor with null target has no homing behavior", () => {
        const missile = new Missile(
            new Vector2(100, 100),
            new Vector2(0, 0),
            0,
            null,
        );
        expect(missile.behaviors.length).toBe(0);
    });

    test("update decrements ttl", () => {
        const target = new EntityLike(
            new Vector2(500, 500),
            new Vector2(0, 0),
            20,
            1,
        );
        const missile = new Missile(
            new Vector2(100, 100),
            new Vector2(0, 0),
            0,
            target,
            4,
            1,
        );

        const world = new World();
        world.spawn(missile);
        world.spawn(target);

        missile.update(
            1,
            {
                thrust: false,
                turnLeft: false,
                turnRight: false,
                fire: false,
                switchWeapon: false,
            },
            world,
        );
        expect(missile.ttl).toBe(3);
    });

    test("missile despawns when ttl expires", () => {
        const target = new EntityLike(
            new Vector2(500, 500),
            new Vector2(0, 0),
            20,
            1,
        );
        const missile = new Missile(
            new Vector2(100, 100),
            new Vector2(0, 0),
            0,
            target,
            0.5,
            1,
        );

        const world = new World();
        world.spawn(missile);
        world.spawn(target);

        missile.update(
            1,
            {
                thrust: false,
                turnLeft: false,
                turnRight: false,
                fire: false,
                switchWeapon: false,
            },
            world,
        );
        expect(missile.ttl).toBeLessThanOrEqual(0);
    });

    test("fromSnapshot restores missile", () => {
        const target = new EntityLike(
            new Vector2(500, 500),
            new Vector2(0, 0),
            20,
            1,
        );
        const missile = new Missile(
            new Vector2(100, 100),
            new Vector2(0, 0),
            0,
            target,
            3.5,
            42,
        );
        const snapshot = missile.toSnapshot();

        const restored = Missile.fromSnapshot(snapshot);
        expect(restored.ttl).toBe(3.5);
        expect(restored.id).toBe(42);
        expect(restored.kind).toBe("missile");
    });
});

class EntityLike {
    constructor(
        public pos: Vector2,
        public vel: Vector2,
        public radius: number,
        public id: number,
        public kind: "asteroid" = "asteroid",
        public hp = 1,
        public alive = true,
    ) {}
    behaviors: { update: (e: EntityLike, dt: number) => void }[] = [];
}



