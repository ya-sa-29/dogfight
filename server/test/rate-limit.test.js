import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { setupWebSocket } from '../src/ws.js';
import { roomManager } from '../src/roomManager.js';

const ROOM_CONFIG = {
    id: 'rate-room',
    name: 'Rate Room',
    width: 1200,
    height: 800,
    asteroidCount: 0,
};

function createFakeClock(startMs = 0) {
    let current = startMs;

    return {
        now: () => current,
        advance(seconds) {
            current += seconds * 1000;
        },
    };
}

class TestClient {
    constructor(url) {
        this.ws = new WebSocket(url);
        this.messages = [];
        this.waiters = [];
        this.closeInfo = null;

        this.closed = new Promise((resolve) => {
            this.ws.on('close', (code, reason) => {
                this.closeInfo = { code, reason: reason.toString() };
                resolve(this.closeInfo);
            });
        });

        this.ws.on('error', () => {});

        this.ws.on('message', (data) => {
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
            this.ws.once('open', resolve);
            this.ws.once('error', reject);
        });
    }

    send(message) {
        this.ws.send(JSON.stringify(message));
    }

    sendRaw(raw) {
        this.ws.send(raw);
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
                reject(new Error('Timed out waiting for server message'));
            }, timeoutMs);

            this.waiters.push(waiter);
        });
    }

    close() {
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
    const wss = setupWebSocket(httpServer, {
        loadRooms: async () => [ROOM_CONFIG],
        ...overrides,
    });

    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

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

async function joinClient(client) {
    client.send({
        type: 'join',
        roomId: ROOM_CONFIG.id,
        playerName: 'Tester',
    });

    const joined = await client.waitFor((message) => message.type === 'joined');
    return joined;
}

function inputMessage(seq) {
    return {
        type: 'input',
        seq,
        tick: 0,
        thrust: false,
        turnLeft: false,
        turnRight: false,
        fire: false,
        switchWeapon: false,
    };
}

describe('WS rate limiting', () => {
    test('sustained 30 input messages/s is accepted', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();
            await joinClient(client);

            // 30 inputs spread over one second: 40/s refill keeps up. The clock
            // is advanced between sends and the event loop is yielded so the
            // server processes each message at the intended fake time.
            for (let seq = 0; seq < 30; seq += 1) {
                clock.advance(1 / 30);
                client.send(inputMessage(seq));
                await new Promise((resolve) => setImmediate(resolve));
            }

            await new Promise((resolve) => setImmediate(resolve));

            assert.equal(
                client.closeInfo,
                null,
                '30 inputs/s must not trip the limiter',
            );

            const match = roomManager.getMatch(ROOM_CONFIG.id);
            const player = match.players.get(
                client.messages.find((m) => m.type === 'joined').playerId,
            );
            assert.equal(
                player.inputSeq,
                30,
                'all 30 inputs must reach the match',
            );
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test('input traffic does not consume control tokens', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();
            await joinClient(client);

            // Drain the input bucket completely (burst 20, no time advance).
            for (let seq = 0; seq < 20; seq += 1) {
                client.send(inputMessage(seq));
            }

            await new Promise((resolve) => setImmediate(resolve));

            // The control bucket is untouched: pings still work.
            const before = client.messages.filter((m) => m.type === 'pong').length;

            client.send({ type: 'ping', timestamp: 1, seq: 1 });

            await client.waitFor(
                (message) => message.type === 'pong' && message.seq === 1,
            );

            const after = client.messages.filter((m) => m.type === 'pong').length;
            assert.equal(after, before + 1, 'control traffic must still be accepted');
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test('control traffic does not consume input tokens', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();
            await joinClient(client);

            // Exhaust the control bucket with pings (join already took one).
            for (let seq = 1; seq <= 19; seq += 1) {
                client.send({ type: 'ping', timestamp: seq, seq });
            }

            await waitFor(
                () => client.messages.filter((m) => m.type === 'pong').length >= 19,
                '19 pongs',
            );

            // Input bucket is untouched: a fresh input is accepted.
            client.send(inputMessage(0));

            await new Promise((resolve) => setImmediate(resolve));

            assert.equal(
                client.closeInfo,
                null,
                'input must still be accepted after control exhaustion',
            );
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test('control bucket enforces 10/s with burst 20', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();

            // Join consumes one control token, leaving 19 in the burst.
            await joinClient(client);

            for (let seq = 1; seq <= 19; seq += 1) {
                client.send({ type: 'ping', timestamp: seq, seq });
            }

            await waitFor(
                () => client.messages.filter((m) => m.type === 'pong').length >= 19,
                '19 pongs',
            );

            assert.equal(client.closeInfo, null, 'burst must allow 20 control messages');

            // The 21st control message exhausts the bucket.
            client.send({ type: 'ping', timestamp: 99, seq: 99 });

            const closeInfo = await client.closed;
            assert.equal(closeInfo.code, 1008);
            assert.equal(closeInfo.reason, 'Rate limit exceeded');
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test('control bucket refills at 10/s', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();
            await joinClient(client);

            for (let seq = 1; seq <= 19; seq += 1) {
                client.send({ type: 'ping', timestamp: seq, seq });
            }

            await waitFor(
                () => client.messages.filter((m) => m.type === 'pong').length >= 19,
                '19 pongs',
            );

            // Refill one second worth (10 tokens) and confirm they are usable.
            clock.advance(1);

            for (let seq = 100; seq < 110; seq += 1) {
                client.send({ type: 'ping', timestamp: seq, seq });
            }

            await waitFor(
                () => client.messages.filter((m) => m.type === 'pong').length >= 29,
                '10 refilled pongs',
            );

            assert.equal(client.closeInfo, null, 'refilled tokens must be accepted');
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test('buckets are isolated per connection', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const first = new TestClient(context.url);
            clients.push(first);
            await first.open();
            await joinClient(first);

            // Exhaust the first connection's control bucket.
            for (let seq = 1; seq <= 19; seq += 1) {
                first.send({ type: 'ping', timestamp: seq, seq });
            }

            await waitFor(
                () => first.messages.filter((m) => m.type === 'pong').length >= 19,
                '19 pongs on first connection',
            );

            first.send({ type: 'ping', timestamp: 999, seq: 999 });

            const firstClose = await first.closed;
            assert.equal(firstClose.code, 1008);

            // A second connection has its own full buckets.
            const second = new TestClient(context.url);
            clients.push(second);
            await second.open();

            await joinClient(second);

            const joined = second.messages.find((m) => m.type === 'joined');
            assert.ok(joined, 'second connection must join successfully');

            assert.equal(
                second.closeInfo,
                null,
                'second connection must not inherit the first bucket state',
            );
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test('malformed JSON is rate limited', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();
            await joinClient(client);

            // Malformed messages consume control tokens. Exhaust the burst with
            // valid control traffic first, then confirm a malformed message is
            // rejected by the limiter rather than by the parser.
            for (let seq = 1; seq <= 19; seq += 1) {
                client.send({ type: 'ping', timestamp: seq, seq });
            }

            await waitFor(
                () => client.messages.filter((m) => m.type === 'pong').length >= 19,
                '19 pongs',
            );

            assert.equal(client.closeInfo, null);

            client.sendRaw('{not json');

            const closeInfo = await client.closed;
            assert.equal(closeInfo.code, 1008);
            assert.equal(
                closeInfo.reason,
                'Rate limit exceeded',
                'the limiter must reject before the parser reports Invalid JSON',
            );
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test('unknown message types are rate limited', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();
            await joinClient(client);

            for (let seq = 1; seq <= 19; seq += 1) {
                client.send({ type: 'ping', timestamp: seq, seq });
            }

            await waitFor(
                () => client.messages.filter((m) => m.type === 'pong').length >= 19,
                '19 pongs',
            );

            assert.equal(client.closeInfo, null);

            client.send({ type: 'bogus' });

            const closeInfo = await client.closed;
            assert.equal(closeInfo.code, 1008);
            assert.equal(
                closeInfo.reason,
                'Rate limit exceeded',
                'unknown types must not bypass the limiter',
            );
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test('malformed JSON is rejected with the parser close code when tokens remain', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();
            await joinClient(client);

            // With tokens available the limiter passes and the parser rejects.
            client.sendRaw('{not json');

            const closeInfo = await client.closed;
            assert.equal(closeInfo.code, 1008);
            assert.equal(closeInfo.reason, 'Invalid JSON');
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test('input exhaustion closes with 1008', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();
            await joinClient(client);

            // Burst is 20; the 21st input without any refill is rejected.
            for (let seq = 0; seq < 20; seq += 1) {
                client.send(inputMessage(seq));
            }

            await new Promise((resolve) => setImmediate(resolve));

            assert.equal(client.closeInfo, null, 'burst of 20 inputs must be accepted');

            client.send(inputMessage(20));

            const closeInfo = await client.closed;
            assert.equal(closeInfo.code, 1008);
            assert.equal(closeInfo.reason, 'Rate limit exceeded');
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });

    test('input bucket refills at 40/s', async () => {
        const clock = createFakeClock();
        const context = await startServer({ now: clock.now });
        const clients = [];

        try {
            const client = new TestClient(context.url);
            clients.push(client);
            await client.open();
            await joinClient(client);

            for (let seq = 0; seq < 20; seq += 1) {
                client.send(inputMessage(seq));
            }

            await new Promise((resolve) => setImmediate(resolve));
            assert.equal(client.closeInfo, null);

            // 1 second at 40/s refills the bucket to burst.
            clock.advance(1);

            for (let seq = 20; seq < 40; seq += 1) {
                client.send(inputMessage(seq));
            }

            await new Promise((resolve) => setImmediate(resolve));

            assert.equal(
                client.closeInfo,
                null,
                'refilled input tokens must be accepted',
            );
        } finally {
            await stopServer(context, clients);
            await cleanupMatches();
        }
    });
});