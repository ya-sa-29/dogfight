
import test from "node:test";
import assert from "node:assert/strict";

import { Match } from "../src/match.js";

function createMatch() {
    const room = {
        id: "test-room",
        config: {
            width: 1600,
            height: 900,
            asteroidCount: 0,
        },
    };

    const match = new Match(room);

    const player = {
        id: "player-1",
        socket: {
            close() {},
        },
    };

    match.addPlayer(player);
    match.stop();

    match.running = true;
    match.broadcastSnapshot = () => {};
    match.scheduleTick = () => {};

    return { match, player };
}

function runTick(match) {
    match.runTick();
}

test("Match processes only one queued input per tick", () => {
    const { match, player } = createMatch();
    const state = match.players.get(player.id);

    match.setInput(player.id, {
        seq: 1,
        thrust: true,
        turn: 0,
        fire: false,
    });

    match.setInput(player.id, {
        seq: 2,
        thrust: false,
        turn: 1,
        fire: false,
    });

    match.setInput(player.id, {
        seq: 3,
        thrust: true,
        turn: -1,
        fire: true,
        clientShotId: "player-1:1",
    });

    assert.equal(state.pendingInputs.length, 3);

    runTick(match);

    assert.equal(state.lastProcessedSeq, 1);
    assert.equal(state.pendingInputs.length, 2);

    runTick(match);

    assert.equal(state.lastProcessedSeq, 2);
    assert.equal(state.pendingInputs.length, 1);

    runTick(match);

    assert.equal(state.lastProcessedSeq, 3);
    assert.equal(state.pendingInputs.length, 0);

    match.stop();
});

test("Match preserves movement input when queue is empty", () => {
    const { match, player } = createMatch();
    const state = match.players.get(player.id);

    match.setInput(player.id, {
        seq: 1,
        thrust: true,
        turn: 1,
        fire: false,
    });

    runTick(match);

    const appliedInput = match.inputs.get(player.id);

    assert.equal(appliedInput.seq, 1);
    assert.equal(appliedInput.thrust, true);
    assert.equal(appliedInput.turn, 1);

    runTick(match);

    assert.equal(state.lastProcessedSeq, 1);
    assert.equal(match.inputs.get(player.id), appliedInput);
    assert.equal(state.pendingInputs.length, 0);

    match.stop();
});

test("Match rejects duplicate and outdated input sequences", () => {
    const { match, player } = createMatch();

    const input = {
        seq: 1,
        thrust: true,
        turn: 0,
        fire: false,
    };

    assert.equal(match.setInput(player.id, input), true);
    assert.equal(match.setInput(player.id, input), false);

    assert.equal(
        match.setInput(player.id, {
            ...input,
            seq: 0,
        }),
        false,
    );

    assert.equal(
        match.players.get(player.id).pendingInputs.length,
        1,
    );

    match.stop();
});

test("Match rejects input when pending queue is full", () => {
    const { match, player } = createMatch();
    const state = match.players.get(player.id);

    for (let seq = 1; seq <= 120; seq++) {
        assert.equal(
            match.setInput(player.id, {
                seq,
                thrust: false,
                turn: 0,
                fire: false,
            }),
            true,
        );
    }

    assert.equal(state.pendingInputs.length, 120);

    assert.equal(
        match.setInput(player.id, {
            seq: 121,
            thrust: true,
            turn: 0,
            fire: false,
        }),
        false,
    );

    assert.equal(state.pendingInputs.length, 120);
    assert.equal(state.lastReceivedSeq, 120);

    match.stop();
});

test("Match rejects firing input without clientShotId", () => {
    const { match, player } = createMatch();

    assert.equal(
        match.setInput(player.id, {
            seq: 1,
            thrust: false,
            turn: 0,
            fire: true,
        }),
        false,
    );

    assert.equal(
        match.players.get(player.id).pendingInputs.length,
        0,
    );

    match.stop();
});

test("Match rejects reuse of a clientShotId", () => {
    const { match, player } = createMatch();

    const firstShot = {
        seq: 1,
        thrust: false,
        turn: 0,
        fire: true,
        clientShotId: "player-1:1",
    };

    assert.equal(match.setInput(player.id, firstShot), true);

    assert.equal(
        match.setInput(player.id, {
            ...firstShot,
            seq: 2,
        }),
        false,
    );

    assert.equal(
        match.players.get(player.id).pendingInputs.length,
        1,
    );

    match.stop();
});

test("Match creates only one bullet for a one-shot input", () => {
    const { match, player } = createMatch();

    match.setInput(player.id, {
        seq: 1,
        thrust: false,
        turn: 0,
        fire: true,
        clientShotId: "player-1:1",
    });

    runTick(match);

    assert.equal([...match.world.ofKind("bullet")].length, 1);

    runTick(match);

    assert.equal([...match.world.ofKind("bullet")].length, 1);

    match.stop();
});

test("Match includes bullet ownership and shot identity in snapshots", () => {
    const { match, player } = createMatch();

    match.setInput(player.id, {
        seq: 1,
        thrust: false,
        turn: 0,
        fire: true,
        clientShotId: "player-1:42",
    });

    runTick(match);

    const snapshot = match.createSnapshot(player.id);
    const bullet = snapshot.entities.find(
        (entity) => entity.kind === "bullet",
    );

    assert.ok(bullet);
    assert.equal(bullet.playerId, player.id);
    assert.equal(bullet.clientShotId, "player-1:42");

    match.stop();
});

test("Match includes world events in snapshots", () => {
    const { match, player } = createMatch();

    const events = [
        {
            type: "fired",
            weapon: "bullet",
            playerId: player.id,
            clientShotId: "player-1:42",
            position: { x: 100, y: 200 },
        },
        {
            type: "hit",
            target: "asteroid",
            playerId: player.id,
            clientShotId: "player-1:42",
            position: { x: 300, y: 400 },
        },
    ];

    match.world.events = events;

    const snapshot = match.createSnapshot(player.id);

    assert.deepEqual(snapshot.events, events);

    match.stop();
});
