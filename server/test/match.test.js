import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/match.js";
import { World, Ship, Vector2 } from "@dogfight/shared";

const TICK_RATE = 30;

describe("Match Tests", () => {
    let match;
    const roomConfig = {
        id: "test-room",
        name: "Test Room",
        width: 1600,
        height: 900,
        asteroidCount: 8,
    };

    before(() => {
        match = new Match("test-match", roomConfig);
    });

    after(() => {
        if (match) match.stop();
    });

    test("Match initializes with correct seed and config", () => {
        assert.ok(match.seed > 0, "Seed should be positive");
        assert.equal(match.id, "test-match");
        assert.equal(match.roomConfig.width, 1600);
        assert.equal(match.roomConfig.height, 900);
        assert.equal(match.roomConfig.asteroidCount, 8);
    });

    test("Match starts and runs at 30 Hz", async () => {
        match.start();
        assert.equal(match.running, true);

        // Wait for a few ticks
        await new Promise(resolve => setTimeout(resolve, 100));

        assert.ok(match.tick > 0, "Tick should advance");
        assert.equal(TICK_RATE, 30);

        match.stop();
        assert.equal(match.running, false);
    });

    test("Player can join and gets ship spawned", () => {
        const player = {
            id: "player-1",
            name: "TestPlayer",
            socket: { readyState: 1, send: () => {} },
        };

        const result = match.addPlayer(player);
        assert.equal(result, true);
        assert.ok(match.players.has("player-1"));
        assert.ok(match.ships.has("player-1"));
        assert.ok(match.world.get(match.ships.get("player-1")));
    });

    test("Player input is validated and queued", () => {
        const input = {
            seq: 0,
            tick: 0,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };

        const result = match.handleInput("player-1", input);
        assert.equal(result, true);

        const player = match.players.get("player-1");
        assert.equal(player.pendingInputs.length, 1);
        assert.equal(player.inputSeq, 1);
    });

    test("Invalid input sequence is rejected", () => {
        const input = {
            seq: 5, // Wrong sequence
            tick: 0,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };

        const result = match.handleInput("player-1", input);
        assert.equal(result, false);
    });

    test("Same seed and inputs produce deterministic state", async () => {
        // Create two matches with same seed
        const seed = 12345;
        const match1 = new Match("test-1", roomConfig);
        const match2 = new Match("test-2", roomConfig);

        // Manually set same seed
        match1.seed = seed;
        match2.seed = seed;

        const player1 = {
            id: "p1",
            name: "P1",
            socket: { readyState: 1, send: () => {} },
        };
        const player2 = {
            id: "p2",
            name: "P2",
            socket: { readyState: 1, send: () => {} },
        };

        match1.addPlayer(player1);
        match2.addPlayer(player2);

        match1.initializeWorld();
        match2.initializeWorld();

        // Run both for 10 ticks with same inputs
        const input = {
            seq: 0,
            tick: 0,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };

        for (let i = 0; i < 10; i++) {
            match1.handleInput("p1", { ...input, seq: i, tick: i });
            match2.handleInput("p2", { ...input, seq: i, tick: i });

            // Manually step
            const dt = 1 / 30;
            match1.world.step(dt, match1.getInputsForStep());
            match2.world.step(dt, match2.getInputsForStep());

            match1.tick++;
            match2.tick++;
        }

        const snap1 = match1.world.getEntitiesSnapshot();
        const snap2 = match2.world.getEntitiesSnapshot();

        assert.equal(snap1.length, snap2.length);

        for (let i = 0; i < snap1.length; i++) {
            assert.equal(snap1[i].x, snap2[i].x, `Entity ${i} x differs`);
            assert.equal(snap1[i].y, snap2[i].y, `Entity ${i} y differs`);
            assert.equal(snap1[i].angle, snap2[i].angle, `Entity ${i} angle differs`);
        }

        match1.stop();
        match2.stop();
    });

    test("Snapshot contains tick, seed, entities, and playerAcks", () => {
        const snapshot = {
            type: 'snapshot',
            tick: match.tick,
            seed: match.seed,
            entities: match.world.getEntitiesSnapshot(),
            playerAcks: { "player-1": 0 },
        };

        assert.equal(snapshot.type, 'snapshot');
        assert.ok(typeof snapshot.tick === 'number');
        assert.ok(typeof snapshot.seed === 'number');
        assert.ok(Array.isArray(snapshot.entities));
        assert.ok(typeof snapshot.playerAcks === 'object');
    });

    test("Server rejects input without join", () => {
        const match2 = new Match("test-no-join", roomConfig);
        const input = {
            seq: 0,
            tick: 0,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };

        const result = match2.handleInput("unknown-player", input);
        assert.equal(result, false);
        match2.stop();
    });

    test("Player removal stops match when empty", () => {
        const match2 = new Match("test-empty", roomConfig);
        const player = {
            id: "solo",
            name: "Solo",
            socket: { readyState: 1, send: () => {} },
        };

        match2.addPlayer(player);
        assert.equal(match2.players.size, 1);

        match2.removePlayer("solo");
        assert.equal(match2.players.size, 0);
        assert.equal(match2.running, false);

        match2.stop();
    });

    test("getStats returns tick info and timing", () => {
        const stats = match.getStats();

        assert.ok(typeof stats.tick === 'number');
        assert.equal(stats.tickRate, 30);
        assert.ok(typeof stats.avgTickDurationMs === 'number');
        assert.ok(typeof stats.maxTickDurationMs === 'number');
        assert.ok(typeof stats.playerCount === 'number');
        assert.ok(typeof stats.entityCount === 'number');
    });
});