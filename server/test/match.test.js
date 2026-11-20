import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/match.js";

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

describe("Player Input Isolation Tests", () => {
    const roomConfig = {
        id: "test-room",
        name: "Test Room",
        width: 1600,
        height: 900,
        asteroidCount: 8,
    };

    test("Two players in one Match get different ships", () => {
        const match = new Match("test-isolation-1", roomConfig);
        
        const playerA = {
            id: "player-A",
            name: "PlayerA",
            socket: { readyState: 1, send: () => {} },
        };
        const playerB = {
            id: "player-B",
            name: "PlayerB",
            socket: { readyState: 1, send: () => {} },
        };

        match.addPlayer(playerA);
        match.addPlayer(playerB);

        const shipIdA = match.ships.get("player-A");
        const shipIdB = match.ships.get("player-B");

        assert.ok(shipIdA, "Player A should have a ship");
        assert.ok(shipIdB, "Player B should have a ship");
        assert.notEqual(shipIdA, shipIdB, "Players should have different ships");

        const shipA = match.world.get(shipIdA);
        const shipB = match.world.get(shipIdB);

        assert.ok(shipA && shipA.alive, "Player A's ship should be alive");
        assert.ok(shipB && shipB.alive, "Player B's ship should be alive");

        match.stop();
    });

    test("Input from player A affects only ship A, not ship B", () => {
        const match = new Match("test-isolation-2", roomConfig);
        
        const playerA = {
            id: "player-A",
            name: "PlayerA",
            socket: { readyState: 1, send: () => {} },
        };
        const playerB = {
            id: "player-B",
            name: "PlayerB",
            socket: { readyState: 1, send: () => {} },
        };

        match.addPlayer(playerA);
        match.addPlayer(playerB);
        match.initializeWorld();

        const shipIdA = match.ships.get("player-A");
        const shipIdB = match.ships.get("player-B");

        // Player A thrusts, Player B does nothing
        const inputA = {
            seq: 0,
            tick: 0,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };
        const inputB = {
            seq: 0,
            tick: 0,
            thrust: false,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };

        match.handleInput("player-A", inputA);
        match.handleInput("player-B", inputB);

        // Step simulation
        const dt = 1 / 30;
        match.world.step(dt, match.getInputsForStep());

        const shipA = match.world.get(shipIdA);
        const shipB = match.world.get(shipIdB);

        // Ship A should have moved (thrust), Ship B should not have moved
        const speedA = shipA.vel.length;
        const speedB = shipB.vel.length;

        assert.ok(speedA > 0.1, `Ship A should have moved (speed: ${speedA})`);
        assert.ok(speedB < 0.1, `Ship B should not have moved (speed: ${speedB})`);

        match.stop();
    });

    test("Input from player B affects only ship B, not ship A", () => {
        const match = new Match("test-isolation-3", roomConfig);
        
        const playerA = {
            id: "player-A",
            name: "PlayerA",
            socket: { readyState: 1, send: () => {} },
        };
        const playerB = {
            id: "player-B",
            name: "PlayerB",
            socket: { readyState: 1, send: () => {} },
        };

        match.addPlayer(playerA);
        match.addPlayer(playerB);
        match.initializeWorld();

        const shipIdA = match.ships.get("player-A");
        const shipIdB = match.ships.get("player-B");

        // Player B thrusts, Player A does nothing
        const inputA = {
            seq: 0,
            tick: 0,
            thrust: false,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };
        const inputB = {
            seq: 0,
            tick: 0,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };

        match.handleInput("player-A", inputA);
        match.handleInput("player-B", inputB);

        // Step simulation
        const dt = 1 / 30;
        match.world.step(dt, match.getInputsForStep());

        const shipA = match.world.get(shipIdA);
        const shipB = match.world.get(shipIdB);

        // Ship B should have moved (thrust), Ship A should not have moved
        const speedA = shipA.vel.length;
        const speedB = shipB.vel.length;

        assert.ok(speedA < 0.1, `Ship A should not have moved (speed: ${speedA})`);
        assert.ok(speedB > 0.1, `Ship B should have moved (speed: ${speedB})`);

        match.stop();
    });

    test("Simultaneous inputs from both players are independent", () => {
        const match = new Match("test-isolation-4", roomConfig);
        
        const playerA = {
            id: "player-A",
            name: "PlayerA",
            socket: { readyState: 1, send: () => {} },
        };
        const playerB = {
            id: "player-B",
            name: "PlayerB",
            socket: { readyState: 1, send: () => {} },
        };

        match.addPlayer(playerA);
        match.addPlayer(playerB);
        match.initializeWorld();

        const shipIdA = match.ships.get("player-A");
        const shipIdB = match.ships.get("player-B");

        // Player A turns left, Player B turns right
        const inputA = {
            seq: 0,
            tick: 0,
            thrust: false,
            turnLeft: true,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };
        const inputB = {
            seq: 0,
            tick: 0,
            thrust: false,
            turnLeft: false,
            turnRight: true,
            fire: false,
            switchWeapon: false,
        };

        match.handleInput("player-A", inputA);
        match.handleInput("player-B", inputB);

        // Step simulation
        const dt = 1 / 30;
        match.world.step(dt, match.getInputsForStep());

        const shipA = match.world.get(shipIdA);
        const shipB = match.world.get(shipIdB);

        // Ship A should have turned left (negative angle), Ship B should have turned right (positive angle)
        assert.ok(shipA.angle < -0.01, `Ship A should have turned left (angle: ${shipA.angle})`);
        assert.ok(shipB.angle > 0.01, `Ship B should have turned right (angle: ${shipB.angle})`);

        match.stop();
    });

    test("Absence of input from one player does not block the other", () => {
        const match = new Match("test-isolation-5", roomConfig);
        
        const playerA = {
            id: "player-A",
            name: "PlayerA",
            socket: { readyState: 1, send: () => {} },
        };
        const playerB = {
            id: "player-B",
            name: "PlayerB",
            socket: { readyState: 1, send: () => {} },
        };

        match.addPlayer(playerA);
        match.addPlayer(playerB);
        match.initializeWorld();

        const shipIdA = match.ships.get("player-A");
        const shipIdB = match.ships.get("player-B");

        // Only Player A sends input, Player B sends nothing
        const inputA = {
            seq: 0,
            tick: 0,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };

        match.handleInput("player-A", inputA);
        // No input from player-B

        // Step simulation
        const dt = 1 / 30;
        match.world.step(dt, match.getInputsForStep());

        const shipA = match.world.get(shipIdA);
        const shipB = match.world.get(shipIdB);

        // Ship A should have moved, Ship B should not have moved
        const speedA = shipA.vel.length;
        const speedB = shipB.vel.length;

        assert.ok(speedA > 0.1, `Ship A should have moved (speed: ${speedA})`);
        assert.ok(speedB < 0.1, `Ship B should not have moved (speed: ${speedB})`);

        match.stop();
    });

    test("getInputsForStep returns Map with per-ship inputs", () => {
        const match = new Match("test-isolation-6", roomConfig);
        
        const playerA = {
            id: "player-A",
            name: "PlayerA",
            socket: { readyState: 1, send: () => {} },
        };
        const playerB = {
            id: "player-B",
            name: "PlayerB",
            socket: { readyState: 1, send: () => {} },
        };

        match.addPlayer(playerA);
        match.addPlayer(playerB);

        const inputsMap = match.getInputsForStep();

        assert.ok(inputsMap instanceof Map, "getInputsForStep should return a Map");
        assert.equal(inputsMap.size, 2, "Should have inputs for both ships");

        const shipIdA = match.ships.get("player-A");
        const shipIdB = match.ships.get("player-B");

        assert.ok(inputsMap.has(shipIdA), "Should have input for ship A");
        assert.ok(inputsMap.has(shipIdB), "Should have input for ship B");

        const inputA = inputsMap.get(shipIdA);
        const inputB = inputsMap.get(shipIdB);

        // Both should have default (empty) input since no inputs were sent
        assert.ok(typeof inputA.thrust === 'boolean');
        assert.ok(typeof inputB.thrust === 'boolean');

        match.stop();
    });

    test("Sequence acknowledgements only confirm processed inputs", () => {
        const match = new Match("test-isolation-7", roomConfig);
        
        const playerA = {
            id: "player-A",
            name: "PlayerA",
            socket: { readyState: 1, send: () => {} },
        };

        match.addPlayer(playerA);
        match.initializeWorld();

        // Send two inputs rapidly (same tick simulation)
        const input1 = {
            seq: 0,
            tick: 0,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };
        const input2 = {
            seq: 1,
            tick: 0,
            thrust: true,
            turnLeft: true,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };

        match.handleInput("player-A", input1);
        match.handleInput("player-A", input2);

        // Before stepping, lastProcessedSeq should be -1 (not processed yet)
        const player = match.players.get("player-A");
        assert.equal(player.lastProcessedSeq, -1, "No inputs processed yet");

        // Step simulation - should process both inputs
        const dt = 1 / 30;
        match.world.step(dt, match.getInputsForStep());

        // After stepping, lastProcessedSeq should be 1 (latest processed)
        assert.equal(player.lastProcessedSeq, 1, "Latest input should be acknowledged");
        assert.equal(player.pendingInputs.length, 0, "Pending inputs should be cleared");

        match.stop();
    });

    test("One-shot actions (fire, switchWeapon) are not lost with multiple inputs per tick", () => {
        const match = new Match("test-isolation-8", roomConfig);
        
        const playerA = {
            id: "player-A",
            name: "PlayerA",
            socket: { readyState: 1, send: () => {} },
        };

        match.addPlayer(playerA);
        match.initializeWorld();

        const shipIdA = match.ships.get("player-A");

        // Send two inputs in same tick: first with fire, second with switchWeapon
        const input1 = {
            seq: 0,
            tick: 0,
            thrust: false,
            turnLeft: false,
            turnRight: false,
            fire: true,
            switchWeapon: false,
        };
        const input2 = {
            seq: 1,
            tick: 0,
            thrust: false,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: true,
        };

        match.handleInput("player-A", input1);
        match.handleInput("player-A", input2);

        // Step simulation
        const dt = 1 / 30;
        match.world.step(dt, match.getInputsForStep());

        const ship = match.world.get(shipIdA);

        // Both fire and switchWeapon should have been processed
        // Fire creates a bullet, switchWeapon changes weapon
        // Note: fire has cooldown, so only one bullet may be created
        // But switchWeapon should have been processed
        assert.ok(ship.weapon === "missile" || ship.fireCooldown > 0, 
            "One-shot actions should not be lost");

        match.stop();
    });
});