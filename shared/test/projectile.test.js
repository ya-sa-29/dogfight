import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
    World,
    Ship,
    Asteroid,
    Bullet,
    Pickup,
    Vector2,
    initializeWorld,
} from "../index.js";

function idleInput(overrides = {}) {
    return {
        thrust: false,
        turnLeft: false,
        turnRight: false,
        fire: false,
        switchWeapon: false,
        ...overrides,
    };
}

describe("Projectile lifecycle", () => {
    test("firing creates a bullet in the world", () => {
        const world = new World();
        const ship = new Ship(400, 300, "ship-1");
        world.spawn(ship);

        assert.equal(world.ofKind("bullet").next().value, undefined);

        world.step(1 / 60, new Map([[ship.id, idleInput({ fire: true })]]));

        const bullets = [...world.ofKind("bullet")];
        assert.equal(bullets.length, 1, "one bullet must exist after firing");
        assert.ok(bullets[0] instanceof Bullet);
    });

    test("the projectile appears in the world snapshot", () => {
        const world = new World();
        const ship = new Ship(400, 300, "ship-1");
        world.spawn(ship);

        world.step(1 / 60, new Map([[ship.id, idleInput({ fire: true })]]));

        const snapshot = world.getEntitiesSnapshot();
        const bulletSnapshot = snapshot.find((entity) => entity.kind === "bullet");

        assert.ok(bulletSnapshot, "snapshot must contain a bullet entity");
        assert.equal(typeof bulletSnapshot.x, "number");
        assert.equal(typeof bulletSnapshot.y, "number");
        assert.ok(bulletSnapshot.alive);
    });

    test("the projectile moves during subsequent simulation steps", () => {
        const world = new World();
        const ship = new Ship(400, 300, "ship-1");
        world.spawn(ship);

        world.step(1 / 60, new Map([[ship.id, idleInput({ fire: true })]]));

        const bullet = world.ofKind("bullet").next().value;
        const startX = bullet.pos.x;
        const startY = bullet.pos.y;

        // Advance several steps with no further firing.
        for (let i = 0; i < 5; i += 1) {
            world.step(1 / 60, new Map());
        }

        assert.ok(
            bullet.pos.x !== startX || bullet.pos.y !== startY,
            "the bullet must move on subsequent steps",
        );
    });

    test("the projectile is not updated twice on the step it is spawned", () => {
        const world = new World();
        const ship = new Ship(400, 300, "ship-1");
        world.spawn(ship);

        world.step(1 / 60, new Map([[ship.id, idleInput({ fire: true })]]));

        const bullet = world.ofKind("bullet").next().value;

        // A freshly spawned bullet has not been integrated yet: its position is
        // the muzzle position, exactly where Ship.createBullet put it.
        const expected = ship.pos.add(
            Vector2.fromAngle(ship.angle).scale(ship.radius),
        );

        assert.ok(
            Math.abs(bullet.pos.x - expected.x) < 1e-9 &&
                Math.abs(bullet.pos.y - expected.y) < 1e-9,
            "a bullet spawned this step must not be integrated until the next step",
        );
    });

    test("existing cooldown prevents firing too frequently", () => {
        const world = new World();
        const ship = new Ship(400, 300, "ship-1");
        world.spawn(ship);

        const fire = new Map([[ship.id, idleInput({ fire: true })]]);

        world.step(1 / 60, fire);
        assert.equal([...world.ofKind("bullet")].length, 1);

        // Immediately firing again must not spawn a second bullet.
        world.step(1 / 60, fire);
        assert.equal(
            [...world.ofKind("bullet")].length,
            1,
            "cooldown must block a second shot",
        );

        // After the 0.25s cooldown elapses, firing works again.
        for (let i = 0; i < 20; i += 1) {
            world.step(1 / 60, new Map());
        }

        world.step(1 / 60, fire);
        assert.equal(
            [...world.ofKind("bullet")].length,
            2,
            "a new bullet must spawn once the cooldown expires",
        );
    });

    test("each projectile receives a unique id", () => {
        const world = new World();
        const ship = new Ship(400, 300, "ship-1");
        world.spawn(ship);

        const fire = new Map([[ship.id, idleInput({ fire: true })]]);

        world.step(1 / 60, fire);
        for (let i = 0; i < 20; i += 1) {
            world.step(1 / 60, new Map());
        }
        world.step(1 / 60, fire);

        const ids = [...world.ofKind("bullet")].map((bullet) => bullet.id);

        assert.equal(ids.length, 2);
        assert.notEqual(ids[0], ids[1], "projectile ids must be unique");
    });

    test("spawned projectiles do not clobber the pickup id", () => {
        const world = new World();
        const ship = new Ship(400, 300, "ship-1");
        world.spawn(ship);
        world.spawn(new Pickup(new Vector2(700, 300)));

        world.step(1 / 60, new Map([[ship.id, idleInput({ fire: true })]]));

        assert.equal(
            world.ofKind("pickup").next().value !== undefined,
            true,
            "the pickup must survive projectile spawning",
        );
        assert.equal([...world.ofKind("bullet")].length, 1);
    });

    test("projectiles despawn when their ttl expires", () => {
        const world = new World();
        const ship = new Ship(400, 300, "ship-1");
        world.spawn(ship);

        world.step(1 / 60, new Map([[ship.id, idleInput({ fire: true })]]));
        assert.equal([...world.ofKind("bullet")].length, 1);

        // Bullet ttl is 1.5s; advance well past it.
        for (let i = 0; i < 120; i += 1) {
            world.step(1 / 60, new Map());
        }

        assert.equal(
            [...world.ofKind("bullet")].length,
            0,
            "expired bullets must be removed",
        );
    });

    test("two worlds stepped identically produce identical projectile state", () => {
        const run = () => {
            const world = new World();
            const ship = new Ship(400, 300, "ship-1");
            world.spawn(ship);
            world.spawn(
                new Asteroid(new Vector2(600, 300), new Vector2(0, 0), 20, 10),
            );

            const fire = new Map([[ship.id, idleInput({ fire: true })]]);

            for (let i = 0; i < 40; i += 1) {
                world.step(1 / 60, i % 20 === 0 ? fire : new Map());
            }

            return world.getEntitiesSnapshot();
        };

        assert.deepEqual(run(), run(), "simulation must remain deterministic");
    });
});

describe("World initialization", () => {
    test("pickup spawns inside the playable world", () => {
        const world = new World();
        const ship = new Ship(600, 400, "ship-1");
        world.spawn(ship);

        initializeWorld(world, 12345, 1200, 800, 5, ship);

        const pickup = world.ofKind("pickup").next().value;

        assert.ok(pickup, "a pickup must exist");
        assert.ok(pickup.pos.x > 0 && pickup.pos.x < 1200, "x inside world");
        assert.ok(pickup.pos.y > 0 && pickup.pos.y < 800, "y inside world");
    });

    test("pickup is included in the world snapshot", () => {
        const world = new World();
        const ship = new Ship(600, 400, "ship-1");
        world.spawn(ship);

        initializeWorld(world, 12345, 1200, 800, 5, ship);

        const snapshot = world.getEntitiesSnapshot();

        assert.ok(
            snapshot.some((entity) => entity.kind === "pickup"),
            "snapshot must include the pickup",
        );
    });

    test("ship collects the pickup on contact", () => {
        const world = new World();
        const ship = new Ship(600, 400, "ship-1");
        world.spawn(ship);
        world.spawn(new Pickup(new Vector2(600, 400)));

        const events = world.step(1 / 60, new Map([[ship.id, idleInput()]]));

        assert.equal(ship.missileCount, 1, "ship must gain a missile");
        assert.equal(
            world.ofKind("pickup").next().value,
            undefined,
            "collected pickup must be removed",
        );
        assert.ok(
            events.some((event) => event.type === "pickup"),
            "a pickup event must be emitted",
        );
    });
});