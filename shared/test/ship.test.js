
import test from "node:test";
import assert from "node:assert/strict";

import { Ship } from "../src/sim/ship.js";
import { World } from "../src/sim/world.js";

test("ship moves forward when thrust is enabled", () => {
    const ship = new Ship(400, 300);

    ship.simulateMovement(1 / 30, {
        thrust: true,
        turn: 0,
    });

    assert.ok(ship.pos.x > 400);
    assert.equal(ship.pos.y, 300);
});

test("ship rotates according to input", () => {
    const ship = new Ship();

    ship.simulateMovement(1 / 30, {
        thrust: false,
        turn: 1,
    });

    assert.ok(ship.angle > 0);
});

test("ship does not move without thrust when velocity is zero", () => {
    const ship = new Ship(400, 300);

    ship.simulateMovement(1 / 30, {
        thrust: false,
        turn: 0,
    });

    assert.equal(ship.pos.x, 400);
    assert.equal(ship.pos.y, 300);
});

test("ship velocity does not exceed maximum speed", () => {
    const ship = new Ship();

    ship.vel = ship.vel.add({ x: 1000, y: 0 });

    ship.simulateMovement(1 / 30, {
        thrust: false,
        turn: 0,
    });

    assert.ok(ship.vel.length <= 300);
});

test("movement simulation does not create projectiles", () => {
    const ship = new Ship();

    const fakeWorld = {
        spawn() {
            assert.fail("Movement must not spawn entities");
        },
        events: [],
    };

    ship.simulateMovement(1 / 30, {
        thrust: true,
        turn: 0,
        fire: true,
    });

    assert.equal(fakeWorld.events.length, 0);
});

test("same initial state and inputs produce identical movement", () => {
    const first = new Ship();
    const second = new Ship();

    const inputs = [
        { thrust: true, turn: 0 },
        { thrust: true, turn: 1 },
        { thrust: true, turn: -1 },
        { thrust: false, turn: 0 },
    ];

    for (const input of inputs) {
        first.simulateMovement(1 / 30, input);
        second.simulateMovement(1 / 30, input);
    }

    assert.deepEqual(
        {
            x: first.pos.x,
            y: first.pos.y,
            vx: first.vel.x,
            vy: first.vel.y,
            angle: first.angle,
        },
        {
            x: second.pos.x,
            y: second.pos.y,
            vx: second.vel.x,
            vy: second.vel.y,
            angle: second.angle,
        },
    );
});

test("ship creates a bullet with the supplied shot identity", () => {
    const world = new World();
    const ship = world.spawn(new Ship(400, 300));

    world.step(1 / 30, new Map([
        [ship.id, {
            fire: true,
            playerId: "player-1",
            clientShotId: "player-1:1",
        }],
    ]));

    const bullets = [...world.ofKind("bullet")];

    assert.equal(bullets.length, 1);
    assert.equal(bullets[0].playerId, "player-1");
    assert.equal(bullets[0].clientShotId, "player-1:1");
});

test("ship does not fire repeatedly when no new fire event arrives", () => {
    const world = new World();
    const ship = world.spawn(new Ship());

    world.step(1 / 30, new Map([
        [ship.id, {
            fire: true,
            playerId: "player-1",
            clientShotId: "player-1:1",
        }],
    ]));

    for (let i = 0; i < 15; i++) {
        world.step(1 / 30);
    }

    assert.equal([...world.ofKind("bullet")].length, 1);
});

test("ship ignores a fire event while the weapon is on cooldown", () => {
    const world = new World();
    const ship = world.spawn(new Ship());

    ship.fireCooldown = 0.1;

    world.step(1 / 30, new Map([
        [ship.id, {
            fire: true,
            playerId: "player-1",
            clientShotId: "player-1:2",
        }],
    ]));

    assert.equal([...world.ofKind("bullet")].length, 0);

    for (let i = 0; i < 10; i++) {
        world.step(1 / 30);
    }

    assert.equal([...world.ofKind("bullet")].length, 0);
});
