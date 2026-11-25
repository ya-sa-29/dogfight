import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { setupWebSocket } from "../src/ws.js";
import { roomManager } from "../src/roomManager.js";

const ROOM_CONFIG = {
    id: "test-room",
    name: "Test Room",
    width: 1200,
    height: 800,
    asteroidCount: 5,
};

class TestClient {
    constructor(url) {
        this.ws = new WebSocket(url);
        this.messages = [];
        this.waiters = [];
        this.error = null;
        this.closeInfo = null;
        this.closeCalled = false;

        this.closed = new Promise((resolve) => {
            this.ws.on("close", (code, reason) => {
                this.closeInfo = { code, reason: reason.toString() };
                resolve(this.closeInfo);
            });
        });

        this.ws.on("error", (error) => {
            this.error = error;
        });

        this.ws.on("message", (data) => {
            const message = JSON.parse(data.toString());
            this.messages.push(message);

            for (const waiter of [...this.waiters]) {
                if (waiter.predicate(message)) {
                    this.waiters.splice(this.waiters.indexOf(waiter), 1);
                    clearTimeout(waiter.timer);
                    waiter.resolve(message);
                }
            }
        });
    }

    open() {
        if (this.ws.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            this.ws.once("open", resolve);
            this.ws.once("error", reject);
        });
    }

    send(message) {
        this.ws.send(JSON.stringify(message));
    }

    waitFor(predicate, timeoutMs = 3000) {
        const existing = this.messages.find(predicate);
        if (existing) {
            return Promise.resolve(existing);
        }

        return new Promise((resolve, reject) => {
            const waiter = { predicate, resolve };
            waiter.timer = setTimeout(() => {
                const index = this.waiters.indexOf(waiter);
                if (index !== -1) {
                    this.waiters.splice(index, 1);
                }
                reject(new Error("Timed out waiting for server message"));
            }, timeoutMs);

            this.waiters.push(waiter);
        });
    }

    close() {
        if (this.closeCalled) {
            return this.closed;
        }
        this.closeCalled = true;

        for (const waiter of this.waiters) {
            clearTimeout(waiter.timer);
            waiter.resolve(null);
        }
        this.waiters.length = 0;

        if (
            this.ws.readyState === WebSocket.OPEN ||
            this.ws.readyState === WebSocket.CONNECTING
        ) {
            this.ws.close();
        }

        return this.closed;
    }
}

async function startServer(overrides = {}) {
    const httpServer = createServer();
    const wss = setupWebSocket(httpServer, overrides);

    await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));

    const { port } = httpServer.address();

    return {
        httpServer,
        wss,
        url: `ws://127.0.0.1:${port}/ws`,
    };
}

async function stopServer(context, clients) {
    for (const client of clients) {
        client.close();
    }
    await Promise.all(clients.map((client) => client.closed));

    await new Promise((resolve) => context.wss.close(resolve));
    await new Promise((resolve) => context.httpServer.close(resolve));
}

async function waitFor(predicate, description, maxTurns = 5000) {
    for (let turn = 0; turn < maxTurns; turn += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setImmediate(resolve));
    }

    throw new Error(`Timed out waiting for ${description}`);
}

async function cleanupMatches() {
    for (const match of roomManager.matches.values()) {
        match.stop();
        await match.matchLog.close();
    }
    roomManager.matches.clear();
}

describe("WS join race (ghost players)", () => {
    test("socket closed while getRooms() is pending does not register a player", async () => {
        let resolveRooms;
        let signalLoadStarted;
        const loadStarted = new Promise((resolve) => {
            signalLoadStarted = resolve;
        });
        const roomsPending = new Promise((resolve) => {
            resolveRooms = resolve;
        });

        const context = await startServer({
            loadRooms: () => {
                signalLoadStarted();
                return roomsPending;
            },
        });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();

            client.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "Ghost",
            });

            await loadStarted;

            const closed = client.close();
            await waitFor(
                () => context.wss.clients.size === 0,
                "server socket to close",
            );
            await closed;

            resolveRooms([ROOM_CONFIG]);
            await new Promise((resolve) => setImmediate(resolve));

            assert.equal(
                roomManager.getMatch(ROOM_CONFIG.id),
                null,
                "abandoned join must not create a match",
            );
        } finally {
            resolveRooms([ROOM_CONFIG]);
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test("getRooms() resolving after the socket closed does not consume capacity", async () => {
        let resolveRooms;
        let signalLoadStarted;
        const loadStarted = new Promise((resolve) => {
            signalLoadStarted = resolve;
        });
        const roomsPending = new Promise((resolve) => {
            resolveRooms = resolve;
        });

        let loadCalls = 0;
        const context = await startServer({
            loadRooms: () => {
                loadCalls += 1;
                if (loadCalls === 1) {
                    signalLoadStarted();
                    return roomsPending;
                }
                return Promise.resolve([ROOM_CONFIG]);
            },
        });
        const clients = [];

        try {
            const abandoned = new TestClient(context.url);
            clients.push(abandoned);
            await abandoned.open();

            abandoned.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "Ghost",
            });

            await loadStarted;

            const closed = abandoned.close();
            await waitFor(
                () => context.wss.clients.size === 0,
                "server socket to close",
            );
            await closed;

            resolveRooms([ROOM_CONFIG]);
            await new Promise((resolve) => setImmediate(resolve));

            assert.equal(
                roomManager.getMatch(ROOM_CONFIG.id),
                null,
                "abandoned join must not create a match",
            );

            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();

            client.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "Alice",
            });

            const joined = await client.waitFor(
                (message) => message.type === "joined",
            );
            assert.equal(joined.roomId, ROOM_CONFIG.id);
            assert.ok(joined.playerId);

            const match = roomManager.getMatch(ROOM_CONFIG.id);
            assert.ok(match, "normal join should create a match");
            assert.equal(
                match.players.size,
                1,
                "abandoned join must not consume room capacity",
            );
        } finally {
            resolveRooms([ROOM_CONFIG]);
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });
});

describe("WS join flow", () => {
    test("normal join registers exactly one player and sends a roster", async () => {
        const context = await startServer();
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();

            client.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "Alice",
            });

            const joined = await client.waitFor(
                (message) => message.type === "joined",
            );
            assert.equal(joined.roomId, ROOM_CONFIG.id);
            assert.ok(joined.playerId);

            const roster = await client.waitFor(
                (message) => message.type === "roster",
            );
            assert.equal(roster.players.length, 1);
            assert.equal(roster.players[0].name, "Alice");

            const match = roomManager.getMatch(ROOM_CONFIG.id);
            assert.ok(match);
            assert.equal(match.players.size, 1);
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test("ninth player is rejected with 1008 Room is full", async () => {
        const context = await startServer();
        const clients = [];

        try {
            for (let index = 0; index < 8; index += 1) {
                const client = new TestClient(context.url);
                clients.push(client);
                await client.open();

                client.send({
                    type: "join",
                    roomId: ROOM_CONFIG.id,
                    playerName: `Player ${index + 1}`,
                });

                await client.waitFor((message) => message.type === "joined");
            }

            const match = roomManager.getMatch(ROOM_CONFIG.id);
            assert.ok(match);
            assert.equal(match.players.size, 8);

            const ninth = new TestClient(context.url);
            clients.push(ninth);
            await ninth.open();

            ninth.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "Ninth",
            });

            const closeInfo = await ninth.closed;
            assert.equal(closeInfo.code, 1008);
            assert.equal(closeInfo.reason, "Room is full");

            assert.equal(
                roomManager.getMatch(ROOM_CONFIG.id).players.size,
                8,
                "rejected join must not change occupancy",
            );
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test("disconnect cleanup removes a registered player and deletes the empty match", async () => {
        const context = await startServer();
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();

            client.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "Solo",
            });
            await client.waitFor((message) => message.type === "joined");

            assert.equal(roomManager.getMatch(ROOM_CONFIG.id).players.size, 1);

            await client.close();

            await waitFor(
                () => roomManager.getMatch(ROOM_CONFIG.id) === null,
                "empty match to be deleted",
            );

            assert.equal(roomManager.getMatch(ROOM_CONFIG.id), null);
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });
});

describe("WS match lifecycle", () => {
    test("first registered player starts the match and receives the first snapshot", async () => {
        const context = await startServer();
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();

            client.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "Alice",
            });
            await client.waitFor((message) => message.type === "joined");

            const match = roomManager.getMatch(ROOM_CONFIG.id);
            assert.ok(match);
            assert.equal(
                match.running,
                true,
                "match must be running after the first player registers",
            );

            const snapshot = await client.waitFor(
                (message) => message.type === "snapshot",
            );
            assert.equal(snapshot.tick, 0, "first snapshot must have tick 0");
            assert.ok(Array.isArray(snapshot.entities));
            assert.ok(
                match.tick >= 1,
                "tick loop must advance after a snapshot",
            );
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test("second player does not start the match again", async () => {
        const context = await startServer();
        const clients = [];

        try {
            const first = new TestClient(context.url);
            clients.push(first);
            await first.open();

            first.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "Alice",
            });
            await first.waitFor((message) => message.type === "joined");

            const match = roomManager.getMatch(ROOM_CONFIG.id);
            assert.ok(match);
            assert.equal(match.running, true);

            let startCalls = 0;
            const originalStart = match.start.bind(match);
            match.start = () => {
                startCalls += 1;
                return originalStart();
            };

            const second = new TestClient(context.url);
            clients.push(second);
            await second.open();

            second.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "Bob",
            });
            await second.waitFor((message) => message.type === "joined");

            assert.equal(
                startCalls,
                0,
                "second join must not call Match.start() again",
            );
            assert.equal(match.players.size, 2);
            assert.equal(match.running, true);
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test("join with an unknown room does not create or start a match", async () => {
        const context = await startServer();
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();

            client.send({
                type: "join",
                roomId: "missing-room",
                playerName: "Nobody",
            });

            const closeInfo = await client.closed;
            assert.equal(closeInfo.code, 1008);
            assert.equal(closeInfo.reason, "Room not found");
            assert.equal(roomManager.getMatch("missing-room"), null);
            assert.equal(
                roomManager.matches.size,
                0,
                "failed join must not create a match",
            );
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test("closed-socket join does not create or start a match", async () => {
        let resolveRooms;
        let signalLoadStarted;
        const loadStarted = new Promise((resolve) => {
            signalLoadStarted = resolve;
        });
        const roomsPending = new Promise((resolve) => {
            resolveRooms = resolve;
        });

        const context = await startServer({
            loadRooms: () => {
                signalLoadStarted();
                return roomsPending;
            },
        });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();

            client.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "Ghost",
            });
            await loadStarted;

            const closed = client.close();
            await waitFor(
                () => context.wss.clients.size === 0,
                "server socket to close",
            );
            await closed;

            resolveRooms([ROOM_CONFIG]);
            await new Promise((resolve) => setImmediate(resolve));

            assert.equal(roomManager.getMatch(ROOM_CONFIG.id), null);
            assert.equal(
                roomManager.matches.size,
                0,
                "abandoned join must not create or start a match",
            );
        } finally {
            resolveRooms([ROOM_CONFIG]);
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });
});

describe("WS latency injector - pong path", () => {
    // Reuse the existing test room id so the default loadRooms() resolves it.
    const ROOM_CONFIG = {
        id: "test-room",
        name: "Test Room",
        width: 1200,
        height: 800,
        asteroidCount: 5,
    };

    async function measurePongRtt(query) {
        const context = await startServer();
        const clients = [];
        try {
            const url = query ? `${context.url}?${query}` : context.url;
            const client = new TestClient(url);
            clients.push(client);
            await client.open();

            client.send({
                type: "join",
                roomId: ROOM_CONFIG.id,
                playerName: "LatencyTester",
            });
            await client.waitFor((m) => m.type === "joined");

            const start = performance.now();
            client.send({
                type: "ping",
                timestamp: start,
                seq: 1,
            });
            const pong = await client.waitFor((m) => m.type === "pong");

            return {
                rtt: performance.now() - start,
                pong,
            };
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    }

    test("without latency, pong arrives with negligible delay", async () => {
        const { rtt } = await measurePongRtt(null);

        // No injected latency: the pong must round-trip well under 100 ms.
        assert.ok(
            rtt < 100,
            `expected negligible RTT, got ${rtt.toFixed(1)} ms`,
        );
    });

    test("with latency=100, RTT includes ~100 ms upstream + ~100 ms downstream", async () => {
        const { rtt, pong } = await measurePongRtt("latency=100");

        // The pong is echoed unchanged (timestamp + seq preserved).
        assert.equal(pong.seq, 1);
        assert.ok(typeof pong.timestamp === "number");

        // Real timers: expect ~200 ms but allow generous tolerance for CI.
        assert.ok(
            rtt >= 150,
            `expected at least ~200 ms, got ${rtt.toFixed(1)} ms`,
        );
        assert.ok(
            rtt <= 500,
            `expected at most ~500 ms, got ${rtt.toFixed(1)} ms`,
        );
    });
});
