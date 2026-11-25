import { describe, expect, test } from "vitest";
import { Bullet } from "../../shared/sim/bullet.ts";
import { Vector2 } from "../../shared/sim/vector.ts";
import { World } from "../../shared/sim/world.ts";

describe("Bullet", () => {
    test("update decrements ttl and moves position", () => {
        const bullet = new Bullet(
            new Vector2(100, 100),
            new Vector2(100, 0),
            0,
            2,
            1,
        );
        const world = new World();
        world.spawn(bullet);

        bullet.update(
            0.5,
            {
                thrust: false,
                turnLeft: false,
                turnRight: false,
                fire: false,
                switchWeapon: false,
            },
            world,
        );

        expect(bullet.ttl).toBe(1.5);
        expect(bullet.pos.x).toBe(150);
    });

    test("despawns when ttl expires", () => {
        const bullet = new Bullet(
            new Vector2(100, 100),
            new Vector2(0, 0),
            0,
            0.5,
            1,
        );
        const world = new World();
        world.spawn(bullet);

        bullet.update(
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
        expect(bullet.ttl).toBeLessThanOrEqual(0);
        expect(bullet.alive).toBe(false);
    });

    test("fromSnapshot throws for non-bullet kind", () => {
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
        expect(() => Bullet.fromSnapshot(data as never)).toThrow(
            "Cannot create Bullet from non-bullet snapshot",
        );
    });

    test("fromSnapshot restores bullet with ttl", () => {
        const data = {
            kind: "bullet" as const,
            x: 100,
            y: 200,
            angle: 0.5,
            radius: 3,
            hp: 1,
            alive: true,
            id: 7,
            ttl: 1.0,
        };
        const bullet = Bullet.fromSnapshot(data as never);
        expect(bullet.ttl).toBe(1.0);
        expect(bullet.id).toBe(7);
        expect(bullet.pos.x).toBe(100);
        expect(bullet.pos.y).toBe(200);
    });
});



