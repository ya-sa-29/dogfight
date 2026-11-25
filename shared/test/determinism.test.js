import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
    World,
    Ship,
    Asteroid,
    Bullet,
    Missile,
    Pickup,
    Explosion,
    Vector2,
    Entity,
    integrate,
    createRNG,
    initializeWorld,
    createWorldFromSeed,
} from "../index.js";

describe("Determinism Tests", () => {
    test("same inputs produce same simulation state", () => {
        const seed = 12345;
        const rng1 = createRNG(seed);
        const rng2 = createRNG(seed);

        const world1 = new World();
        const world2 = new World();

        const ship1 = new Ship(400, 300, 1);
        const ship2 = new Ship(400, 300, 1);

        world1.spawn(ship1);
        world2.spawn(ship2);

        for (let i = 0; i < 10; i++) {
            const asteroid1 = new Asteroid(
                new Vector2(
                    100 + rng1.random() * 600,
                    100 + rng1.random() * 400,
                ),
                new Vector2(
                    (rng1.random() - 0.5) * 80,
                    (rng1.random() - 0.5) * 80,
                ),
                18 + rng1.random() * 17,
                i + 10,
            );
            const asteroid2 = new Asteroid(
                new Vector2(
                    100 + rng2.random() * 600,
                    100 + rng2.random() * 400,
                ),
                new Vector2(
                    (rng2.random() - 0.5) * 80,
                    (rng2.random() - 0.5) * 80,
                ),
                18 + rng2.random() * 17,
                i + 10,
            );
            world1.spawn(asteroid1);
            world2.spawn(asteroid2);
        }

        const inputs = {
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };

        const dt = 1 / 30;

        for (let tick = 0; tick < 100; tick++) {
            const projectiles1 = ship1.update(dt, inputs, world1);
            const projectiles2 = ship2.update(dt, inputs, world2);

            for (const p of projectiles1) world1.spawn(p);
            for (const p of projectiles2) world2.spawn(p);

            const events1 = world1.step(dt, inputs);
            const events2 = world2.step(dt, inputs);

            assert.deepEqual(
                events1,
                events2,
                `Collision events differ at tick ${tick}`,
            );
        }

        const snapshot1 = world1.getEntitiesSnapshot();
        const snapshot2 = world2.getEntitiesSnapshot();

        assert.equal(
            snapshot1.length,
            snapshot2.length,
            "Entity count differs",
        );

        for (let i = 0; i < snapshot1.length; i++) {
            const e1 = snapshot1[i];
            const e2 = snapshot2[i];

            assert.equal(e1.id, e2.id, `Entity ${i} id differs`);
            assert.equal(e1.kind, e2.kind, `Entity ${i} kind differs`);
            assert.equal(e1.x, e2.x, `Entity ${i} x differs`);
            assert.equal(e1.y, e2.y, `Entity ${i} y differs`);
            assert.equal(e1.angle, e2.angle, `Entity ${i} angle differs`);
            assert.equal(e1.hp, e2.hp, `Entity ${i} hp differs`);
        }
    });

    test("integrate function is deterministic", () => {
        const ship = { pos: { x: 400, y: 300 }, vel: { x: 0, y: 0 }, angle: 0 };
        const input = { thrust: true, turnLeft: false, turnRight: false };
        const dt = 1 / 30;

        const result1 = integrate(ship, input, dt);
        const result2 = integrate(ship, input, dt);

        assert.deepEqual(result1, result2);
    });

    test("seeded RNG produces same sequence", () => {
        const seed = 42;
        const rng1 = createRNG(seed);
        const rng2 = createRNG(seed);

        for (let i = 0; i < 1000; i++) {
            assert.equal(
                rng1.random(),
                rng2.random(),
                `RNG differs at index ${i}`,
            );
        }
    });

    test("different seeds produce different sequences", () => {
        const rng1 = createRNG(1);
        const rng2 = createRNG(2);

        let allSame = true;
        for (let i = 0; i < 100; i++) {
            if (rng1.random() !== rng2.random()) {
                allSame = false;
                break;
            }
        }
        assert.equal(
            allSame,
            false,
            "Different seeds should produce different sequences",
        );
    });
});

describe("Snapshot Tests", () => {
    test("Entity snapshot preserves hp and restores correctly", () => {
        const entity = new Entity({ pos: new Vector2(100, 200), vel: new Vector2(10, 20), radius: 15, kind: "test", hp: 3, id: 42 });

        entity.takeDamage(1);
        assert.equal(entity.hp, 2);

        const snapshot = entity.toSnapshot();
        assert.equal(snapshot.hp, 2);
        assert.equal(snapshot.id, 42);
        assert.equal(snapshot.x, 100);
        assert.equal(snapshot.y, 200);

        const restored = Entity.fromSnapshot(snapshot);
        assert.equal(restored.hp, 2);
        assert.equal(restored.id, 42);
        assert.equal(restored.alive, true);

        // Test dead entity
        const deadEntity = new Entity({ pos: new Vector2(0, 0), hp: 1, id: 1 });
        deadEntity.takeDamage(1);
        assert.equal(deadEntity.hp, 0);
        assert.equal(deadEntity.alive, false);

        const deadSnapshot = deadEntity.toSnapshot();
        const restoredDead = Entity.fromSnapshot(deadSnapshot);
        assert.equal(restoredDead.hp, 0);
        assert.equal(restoredDead.alive, false);
    });

    test("Asteroid snapshot preserves hp and restores correctly", () => {
        const asteroid = new Asteroid(new Vector2(100, 200), new Vector2(10, 10), 30, 42);
        asteroid.takeDamage(1);

        const snapshot = asteroid.toSnapshot();
        assert.equal(snapshot.hp, 1);
        assert.equal(snapshot.radius, 30);

        const restored = Asteroid.fromSnapshot(snapshot);
        assert.equal(restored.hp, 1);
        assert.equal(restored.radius, 30);
        assert.equal(restored.id, 42);
    });

    test("Ship snapshot preserves all properties", () => {
        const ship = new Ship(400, 300, 1);
        ship.thrust = true;
        ship.weapon = "missile";
        ship.missileCount = 3;
        ship.takeDamage(1);

        const snapshot = ship.toSnapshot();
        assert.equal(snapshot.hp, 2);
        assert.equal(snapshot.thrust, true);
        assert.equal(snapshot.weapon, "missile");
        assert.equal(snapshot.missileCount, 3);

        const restored = Ship.fromSnapshot(snapshot);
        assert.equal(restored.hp, 2);
        assert.equal(restored.thrust, true);
        assert.equal(restored.weapon, "missile");
        assert.equal(restored.missileCount, 3);
    });

    test("Bullet and Missile snapshots work correctly", () => {
        const bullet = new Bullet(new Vector2(100, 100), new Vector2(50, 50), 0.5, 1.5, 10);
        const bulletSnapshot = bullet.toSnapshot();
        assert.equal(bulletSnapshot.ttl, 1.5);
        assert.equal(bulletSnapshot.id, 10);
        const restoredBullet = Bullet.fromSnapshot(bulletSnapshot);
        assert.equal(restoredBullet.ttl, 1.5);
        assert.equal(restoredBullet.id, 10);

        const missile = new Missile(new Vector2(200, 200), new Vector2(30, 30), 1.0, null, 4.0, 20);
        const missileSnapshot = missile.toSnapshot();
        assert.equal(missileSnapshot.ttl, 4.0);
        assert.equal(missileSnapshot.id, 20);
        const restoredMissile = Missile.fromSnapshot(missileSnapshot);
        assert.equal(restoredMissile.ttl, 4.0);
        assert.equal(restoredMissile.id, 20);
    });
});

describe("Collision Events Tests", () => {
    test("World.step returns collision events", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        const asteroid = new Asteroid(new Vector2(410, 300), new Vector2(0, 0), 20, 2);

        world.spawn(ship);
        world.spawn(asteroid);

        const inputs = { thrust: false, turnLeft: false, turnRight: false, fire: false, switchWeapon: false };
        const events = world.step(1/30, inputs);

        // Ship and asteroid overlap -> hit event
        const hitEvents = events.filter(e => e.type === "hit" && e.target === "ship");
        assert.equal(hitEvents.length, 1);
        assert.equal(hitEvents[0].shipId, 1);
        assert.equal(hitEvents[0].asteroidId, 2);
    });

    test("Projectile-asteroid collision generates hit event with destroyed flag", () => {
        const world = new World();
        const bullet = new Bullet(new Vector2(100, 100), new Vector2(0, 0), 0, 1.5, 1);
        const asteroid = new Asteroid(new Vector2(100, 100), new Vector2(0, 0), 10, 2);

        world.spawn(bullet);
        world.spawn(asteroid);

        const inputs = { thrust: false, turnLeft: false, turnRight: false, fire: false, switchWeapon: false };
        const events = world.step(1/30, inputs);

        const hitEvents = events.filter(e => e.type === "hit" && e.target === "asteroid");
        assert.equal(hitEvents.length, 1);
        assert.equal(hitEvents[0].asteroidId, 2);
        assert.equal(hitEvents[0].projectileId, 1);
        // Asteroid has 2 HP, bullet does 1 damage -> not destroyed
        assert.equal(hitEvents[0].destroyed, false);

        // Second hit should destroy
        const bullet2 = new Bullet(new Vector2(100, 100), new Vector2(0, 0), 0, 1.5, 3);
        world.spawn(bullet2);
        const events2 = world.step(1/30, inputs);

        const hitEvents2 = events2.filter(e => e.type === "hit" && e.target === "asteroid");
        assert.equal(hitEvents2.length, 1);
        assert.equal(hitEvents2[0].destroyed, true);
    });

    test("Ship-pickup collision generates pickup event", () => {
        const world = new World();
        const ship = new Ship(400, 300, 1);
        const pickup = new Pickup(new Vector2(405, 300), 2);

        world.spawn(ship);
        world.spawn(pickup);

        const inputs = { thrust: false, turnLeft: false, turnRight: false, fire: false, switchWeapon: false };
        const events = world.step(1/30, inputs);

        const pickupEvents = events.filter(e => e.type === "pickup");
        assert.equal(pickupEvents.length, 1);
        assert.equal(pickupEvents[0].shipId, 1);
        assert.equal(pickupEvents[0].pickupId, 2);
    });
});

describe("Deterministic Initialization Tests", () => {
    test("createWorldFromSeed produces identical results for same seed", () => {
        const seed = 999;
        const roomWidth = 1600;
        const roomHeight = 900;
        const asteroidCount = 8;

        const result1 = createWorldFromSeed(seed, roomWidth, roomHeight, asteroidCount);
        const result2 = createWorldFromSeed(seed, roomWidth, roomHeight, asteroidCount);

        assert.equal(result1.asteroids.length, asteroidCount);
        assert.equal(result2.asteroids.length, asteroidCount);

        for (let i = 0; i < asteroidCount; i++) {
            const a1 = result1.asteroids[i];
            const a2 = result2.asteroids[i];
            assert.equal(a1.pos.x, a2.pos.x, `Asteroid ${i} pos.x differs`);
            assert.equal(a1.pos.y, a2.pos.y, `Asteroid ${i} pos.y differs`);
            assert.equal(a1.vel.x, a2.vel.x, `Asteroid ${i} vel.x differs`);
            assert.equal(a1.vel.y, a2.vel.y, `Asteroid ${i} vel.y differs`);
            assert.equal(a1.radius, a2.radius, `Asteroid ${i} radius differs`);
        }

        assert.equal(result1.pickupPos.x, result2.pickupPos.x);
        assert.equal(result1.pickupPos.y, result2.pickupPos.y);
    });

    test("Different seeds produce different worlds", () => {
        const roomWidth = 1600;
        const roomHeight = 900;
        const asteroidCount = 8;

        const result1 = createWorldFromSeed(111, roomWidth, roomHeight, asteroidCount);
        const result2 = createWorldFromSeed(222, roomWidth, roomHeight, asteroidCount);

        let allSame = true;
        for (let i = 0; i < asteroidCount; i++) {
            if (result1.asteroids[i].pos.x !== result2.asteroids[i].pos.x ||
                result1.asteroids[i].pos.y !== result2.asteroids[i].pos.y) {
                allSame = false;
                break;
            }
        }
        assert.equal(allSame, false, "Different seeds should produce different asteroid positions");
    });

    test("initializeWorld spawns correct entities", () => {
        const world = new World();
        const ship = new Ship(800, 450, 1);
        world.spawn(ship);

        initializeWorld(world, 12345, 1600, 900, 8, ship);

        const asteroids = [...world.ofKind("asteroid")];
        assert.equal(asteroids.length, 8);

        const pickups = [...world.ofKind("pickup")];
        assert.equal(pickups.length, 1);

        // First asteroid should have homing behavior
        assert.equal(asteroids[0].behaviors.length, 1);
    });
});

describe("Explosion Visual vs Deterministic", () => {
    test("Explosion.createVisual creates non-deterministic particles", () => {
        const exp1 = Explosion.createVisual(new Vector2(100, 100));
        const exp2 = Explosion.createVisual(new Vector2(100, 100));

        // Particles should differ (visual randomness)
        let particlesDiffer = false;
        for (let i = 0; i < exp1.particles.length; i++) {
            if (exp1.particles[i].vel.x !== exp2.particles[i].vel.x ||
                exp1.particles[i].vel.y !== exp2.particles[i].vel.y) {
                particlesDiffer = true;
                break;
            }
        }
        // Note: This might occasionally pass if random happens to be same, but extremely unlikely
        // The point is visual explosions use Math.random()
        assert.ok(particlesDiffer, "Visual explosions should have different particles");
    });

    test("Explosion with deterministic particles serializes particles", () => {
        const rng = createRNG(42);
        const exp = new Explosion(new Vector2(100, 100), 12, rng.random.bind(rng), 1, true);

        const snapshot = exp.toSnapshot();
        assert.ok(snapshot.particles);
        assert.equal(snapshot.particles.length, 12);
        assert.ok(typeof snapshot.particles[0].x === "number");
        assert.ok(typeof snapshot.particles[0].vx === "number");
    });
});