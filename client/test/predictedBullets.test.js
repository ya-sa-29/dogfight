
import test from "node:test";
import assert from "node:assert/strict";

import { createPredictedBullets } from "../src/network/predictedBullets.js";

function createShip() {
    return {
        pos: { x: 400, y: 300 },
        vel: { x: 10, y: 0 },
        angle: 0,
        radius: 15,
    };
}

test("predicted bullet spawns immediately", () => {
    const bullets = createPredictedBullets();

    const spawned = bullets.spawn({
        ship: createShip(),
        playerId: "player-1",
        clientShotId: "player-1:1",
    });

    assert.equal(spawned, true);
    assert.equal(bullets.size, 1);
});

test("predicted bullet uses server shooting physics", () => {
    const bullets = createPredictedBullets();

    bullets.spawn({
        ship: createShip(),
        playerId: "player-1",
        clientShotId: "player-1:1",
    });

    const [bullet] = bullets.getAll();

    assert.equal(bullet.pos.x, 415);
    assert.equal(bullet.pos.y, 300);
    assert.equal(bullet.vel.x, 460);
    assert.equal(bullet.vel.y, 0);
    assert.equal(bullet.radius, 3);
    assert.equal(bullet.ttl, 1.5);
});

test("predicted bullet moves and loses lifetime", () => {
    const bullets = createPredictedBullets();

    bullets.spawn({
        ship: createShip(),
        playerId: "player-1",
        clientShotId: "player-1:1",
    });

    bullets.update(1 / 30);

    const [bullet] = bullets.getAll();

    assert.ok(bullet.pos.x > 415);
    assert.ok(bullet.ttl < 1.5);
});

test("authoritative bullet replaces predicted bullet by ID", () => {
    const bullets = createPredictedBullets();

    bullets.spawn({
        ship: createShip(),
        playerId: "player-1",
        clientShotId: "player-1:1",
    });

    bullets.reconcile([
        {
            id: 100,
            kind: "bullet",
            clientShotId: "player-1:1",
        },
    ]);

    assert.equal(bullets.size, 0);
});

test("unrelated authoritative bullets do not remove prediction", () => {
    const bullets = createPredictedBullets();

    bullets.spawn({
        ship: createShip(),
        playerId: "player-1",
        clientShotId: "player-1:1",
    });

    bullets.reconcile([
        {
            id: 100,
            kind: "bullet",
            clientShotId: "player-2:1",
        },
    ]);

    assert.equal(bullets.size, 1);
});

test("predicted bullet expires after its lifetime", () => {
    const bullets = createPredictedBullets();

    bullets.spawn({
        ship: createShip(),
        playerId: "player-1",
        clientShotId: "player-1:1",
    });

    bullets.update(1.5);

    assert.equal(bullets.size, 0);
});

test("duplicate shot IDs are rejected", () => {
    const bullets = createPredictedBullets();

    const shot = {
        ship: createShip(),
        playerId: "player-1",
        clientShotId: "player-1:1",
    };

    assert.equal(bullets.spawn(shot), true);
    assert.equal(bullets.spawn(shot), false);
    assert.equal(bullets.size, 1);
});

test("server hit removes predicted bullet by shot ID", () => {
    const bullets = createPredictedBullets();

    bullets.spawn({
        ship: createShip(),
        playerId: "player-1",
        clientShotId: "player-1:42",
    });

    assert.equal(bullets.remove("player-1:42"), true);
    assert.equal(bullets.size, 0);

    assert.equal(bullets.remove("player-1:42"), false);
});
