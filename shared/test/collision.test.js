
import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/sim/world.js";
import { Missile } from "../src/sim/missile.js";
import { Asteroid } from "../src/sim/asteroid.js";
import { Vector2 } from "../src/sim/vector.js";

test("missile preserves player and shot identity", () => {
    const missile = new Missile(
        new Vector2(100, 100),
        new Vector2(0, 0),
        0,
        null,
        4,
        {
            playerId: "player-1",
            clientShotId: "player-1:1",
        },
    );

    assert.equal(missile.playerId, "player-1");
    assert.equal(missile.clientShotId, "player-1:1");
});

test("missile hit event contains player and shot identity", () => {
    const world = new World();

    const missile = world.spawn(
        new Missile(
            new Vector2(100, 100),
            new Vector2(0, 0),
            0,
            null,
            4,
            {
                playerId: "player-1",
                clientShotId: "player-1:1",
            },
        ),
    );

    const asteroid = world.spawn(
        new Asteroid(
            new Vector2(100, 100),
            new Vector2(0, 0),
        ),
    );

    world.step(1 / 30);

    const hitEvent = world.events.find(
        (event) => event.type === "hit",
    );

    assert.ok(hitEvent);
    assert.equal(hitEvent.playerId, "player-1");
    assert.equal(hitEvent.clientShotId, "player-1:1");
    assert.equal(hitEvent.target, "asteroid");

    assert.equal(world.get(missile.id), undefined);
    assert.equal(world.get(asteroid.id), asteroid);
});
