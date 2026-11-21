import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
    createLatencyQueue,
    parseLatencyConfig,
} from "../src/latency-injector.js";

class FakeClock {
    constructor() {
        this._now = 0;
        this._timers = new Map();
        this._nextId = 0;
    }

    now() {
        return this._now;
    }

    setTimeout(fn, delay) {
        const id = ++this._nextId;
        this._timers.set(id, { fn, runAt: this._now + delay });
        return id;
    }

    clearTimeout(id) {
        this._timers.delete(id);
    }

    advance(ms) {
        this._now += ms;
        this._flushDue();
    }

    _flushDue() {
        let progressed = true;
        while (progressed) {
            progressed = false;
            const due = [];
            for (const [id, timer] of this._timers) {
                if (timer.runAt <= this._now) {
                    due.push(id);
                }
            }
            // Sort by runAt, then by insertion order (id)
            due.sort((a, b) => {
                const ta = this._timers.get(a);
                const tb = this._timers.get(b);
                if (ta.runAt !== tb.runAt) return ta.runAt - tb.runAt;
                return a - b;
            });
            for (const id of due) {
                const timer = this._timers.get(id);
                if (timer) {
                    this._timers.delete(id);
                    timer.fn();
                    progressed = true;
                }
            }
        }
    }

    getTimerCount() {
        return this._timers.size;
    }
}

function createTestSocket() {
    return { readyState: 1 };
}

function createTestConfig(overrides = {}) {
    return {
        upstream: {
            enabled: true,
            baseMs: 100,
            jitterMs: 50,
            dropRate: 0,
            maxMessages: 1000,
            maxBytes: 256 * 1024,
            ...overrides.upstream,
        },
        downstream: {
            enabled: true,
            baseMs: 100,
            jitterMs: 50,
            dropRate: 0,
            maxMessages: 500,
            maxBytes: 512 * 1024,
            ...overrides.downstream,
        },
    };
}

describe("LatencyQueue - FIFO ordering", () => {
    let clock, socket, config;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
        config = createTestConfig();
    });

    test("messages delivered in FIFO order", () => {
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "downstream",
            clock,
            () => 0.5,
        );

        q.enqueue("msg1", (s, d) => sent.push(d), clock);
        q.enqueue("msg2", (s, d) => sent.push(d), clock);
        q.enqueue("msg3", (s, d) => sent.push(d), clock);

        clock.advance(1000);

        assert.deepEqual(sent, ["msg1", "msg2", "msg3"]);
    });

    test("independent jitter samples per message", () => {
        const sent = [];
        const q = createLatencyQueue(socket, config, "downstream", clock);

        q.enqueue("a", (s, d) => sent.push(d), clock);
        q.enqueue("b", (s, d) => sent.push(d), clock);

        clock.advance(1000);

        assert.deepEqual(sent, ["a", "b"]);
    });

    test("disabled latency delivers immediately", () => {
        const sent = [];
        const disabledConfig = {
            upstream: { enabled: false },
            downstream: { enabled: false },
        };
        const q = createLatencyQueue(
            socket,
            disabledConfig,
            "downstream",
            clock,
        );

        q.enqueue("immediate", (s, d) => sent.push(d), clock);

        assert.deepEqual(sent, ["immediate"]);
    });
});

describe("LatencyQueue - Upstream message drop policy", () => {
    let clock, socket, config;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
        config = createTestConfig({
            upstream: { dropRate: 1 },
            downstream: { dropRate: 0 },
        });
    });

    test("upstream input is never randomly dropped", () => {
        const sent = [];
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const inputMsg = JSON.stringify({
            type: "input",
            seq: 1,
            thrust: true,
        });
        q.enqueue(inputMsg, (s, d) => sent.push(d), clock);

        clock.advance(1000);

        assert.deepEqual(sent, [inputMsg]);
    });

    test("upstream join is never randomly dropped", () => {
        const sent = [];
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const joinMsg = JSON.stringify({
            type: "join",
            roomId: "test",
            playerName: "Player",
        });
        q.enqueue(joinMsg, (s, d) => sent.push(d), clock);

        clock.advance(1000);

        assert.deepEqual(sent, [joinMsg]);
    });

    test("upstream leave is never randomly dropped", () => {
        const sent = [];
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const leaveMsg = JSON.stringify({ type: "leave" });
        q.enqueue(leaveMsg, (s, d) => sent.push(d), clock);

        clock.advance(1000);

        assert.deepEqual(sent, [leaveMsg]);
    });

    test("upstream chat can be dropped", () => {
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "upstream",
            clock,
            () => 0.1,
        );

        const chatMsg = JSON.stringify({ type: "chat", message: "hello" });
        q.enqueue(chatMsg, (s, d) => sent.push(d), clock);

        clock.advance(1000);

        assert.deepEqual(sent, []);
    });
});

describe("LatencyQueue - Downstream message drop policy", () => {
    let clock, socket, config;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
        config = createTestConfig({
            upstream: { dropRate: 0 },
            downstream: { dropRate: 1 },
        });
    });

    test("downstream joined is never randomly dropped", () => {
        const sent = [];
        const q = createLatencyQueue(socket, config, "downstream", clock);

        const joinedMsg = JSON.stringify({
            type: "joined",
            playerId: "p1",
            shipId: "s1",
        });
        q.enqueue(joinedMsg, (s, d) => sent.push(d), clock);

        clock.advance(1000);

        assert.deepEqual(sent, [joinedMsg]);
    });

    test("downstream snapshot can be dropped", () => {
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "downstream",
            clock,
            () => 0.1,
        );

        const snapMsg = JSON.stringify({
            type: "snapshot",
            tick: 1,
            entities: [],
        });
        q.enqueue(snapMsg, (s, d) => sent.push(d), clock);

        clock.advance(1000);

        assert.deepEqual(sent, []);
    });
});

describe("LatencyQueue - Queue bounds", () => {
    let clock, socket;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
    });

    test("upstream queue message-count limit", () => {
        const config = createTestConfig({
            upstream: { maxMessages: 2, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const msg = JSON.stringify({ type: "chat", message: "test" });

        assert.deepEqual(
            q.enqueue(msg, () => {}, clock),
            { accepted: true, delayed: true, dropped: false },
        );
        assert.deepEqual(
            q.enqueue(msg, () => {}, clock),
            { accepted: true, delayed: true, dropped: false },
        );
        const result = q.enqueue(msg, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");
    });

    test("downstream queue message-count limit", () => {
        const config = createTestConfig({
            downstream: { maxMessages: 2, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "downstream", clock);

        const msg = JSON.stringify({ type: "chat", message: "test" });

        assert.deepEqual(
            q.enqueue(msg, () => {}, clock),
            { accepted: true, delayed: true, dropped: false },
        );
        assert.deepEqual(
            q.enqueue(msg, () => {}, clock),
            { accepted: true, delayed: true, dropped: false },
        );
        const result = q.enqueue(msg, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");
    });

    test("upstream queue byte limit", () => {
        const config = createTestConfig({
            upstream: { maxBytes: 100, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const smallMsg = JSON.stringify({ type: "chat", message: "x" });
        const largeMsg = JSON.stringify({
            type: "chat",
            message: "x".repeat(200),
        });

        assert.deepEqual(
            q.enqueue(smallMsg, () => {}, clock),
            { accepted: true, delayed: true, dropped: false },
        );
        const result = q.enqueue(largeMsg, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");
    });

    test("downstream queue byte limit", () => {
        const config = createTestConfig({
            downstream: { maxBytes: 100, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "downstream", clock);

        const smallMsg = JSON.stringify({ type: "chat", message: "x" });
        const largeMsg = JSON.stringify({
            type: "chat",
            message: "x".repeat(200),
        });

        assert.deepEqual(
            q.enqueue(smallMsg, () => {}, clock),
            { accepted: true, delayed: true, dropped: false },
        );
        const result = q.enqueue(largeMsg, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");
    });
});

describe("LatencyQueue - Upstream overflow behavior", () => {
    let clock, socket;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
        // Set up close handler before queue creation
        let socketClosed = false;
        let closeCode = null;
        let closeReason = null;
        socket.close = (code, reason) => {
            socketClosed = true;
            closeCode = code;
            closeReason = reason;
            socket.readyState = 3; // CLOSED
        };
        // Expose for tests
        socket._testState = {
            get socketClosed() {
                return socketClosed;
            },
            get closeCode() {
                return closeCode;
            },
            get closeReason() {
                return closeReason;
            },
        };
    });

    test("upstream overflow uses safe cleanup path for input", () => {
        const config = createTestConfig({
            upstream: { maxMessages: 1, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const inputMsg = JSON.stringify({
            type: "input",
            seq: 1,
            thrust: true,
        });
        assert.deepEqual(
            q.enqueue(inputMsg, () => {}, clock),
            { accepted: true, delayed: true, dropped: false },
        );

        // Second message overflows
        const result = q.enqueue(inputMsg, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");
    });
});

describe("LatencyQueue - Downstream overflow behavior", () => {
    let clock, socket;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
    });

    test("downstream overflow rejects newest and preserves FIFO", () => {
        const config = createTestConfig({
            downstream: { maxMessages: 2, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "downstream", clock);

        const sent = [];
        const msg1 = JSON.stringify({ type: "snapshot", tick: 1 });
        const msg2 = JSON.stringify({ type: "snapshot", tick: 2 });
        const msg3 = JSON.stringify({ type: "snapshot", tick: 3 });

        assert.deepEqual(
            q.enqueue(msg1, (s, d) => sent.push(d), clock),
            { accepted: true, delayed: true, dropped: false },
        );
        assert.deepEqual(
            q.enqueue(msg2, (s, d) => sent.push(d), clock),
            { accepted: true, delayed: true, dropped: false },
        );

        // Third message should be rejected
        const result = q.enqueue(msg3, (s, d) => sent.push(d), clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");

        // Deliver queued messages
        clock.advance(1000);
        assert.deepEqual(sent, [msg1, msg2]);
    });
});

describe("LatencyQueue - Payload byte calculation", () => {
    let clock, socket;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
    });

    test("plain object byte calculation", () => {
        const q = createLatencyQueue(
            socket,
            createTestConfig(),
            "downstream",
            clock,
        );

        const obj = { type: "snapshot", tick: 1, entities: [] };
        const expectedBytes = Buffer.byteLength(JSON.stringify(obj));

        const result = q.enqueue(obj, () => {}, clock);
        assert.equal(result.accepted, true);
        assert.equal(q.getQueuedBytes(), expectedBytes);
    });

    test("string payload byte calculation", () => {
        const q = createLatencyQueue(
            socket,
            createTestConfig(),
            "downstream",
            clock,
        );

        const str = '{"type":"test"}';
        const expectedBytes = Buffer.byteLength(str);

        const result = q.enqueue(str, () => {}, clock);
        assert.equal(result.accepted, true);
        assert.equal(q.getQueuedBytes(), expectedBytes);
    });

    test("Buffer payload byte calculation", () => {
        const q = createLatencyQueue(
            socket,
            createTestConfig(),
            "downstream",
            clock,
        );

        const buf = Buffer.from("test data");
        const expectedBytes = buf.length;

        const result = q.enqueue(buf, () => {}, clock);
        assert.equal(result.accepted, true);
        assert.equal(q.getQueuedBytes(), expectedBytes);
    });

    test("Uint8Array payload byte calculation", () => {
        const q = createLatencyQueue(
            socket,
            createTestConfig(),
            "downstream",
            clock,
        );

        const arr = new Uint8Array([1, 2, 3, 4, 5]);
        const expectedBytes = arr.byteLength;

        const result = q.enqueue(arr, () => {}, clock);
        assert.equal(result.accepted, true);
        assert.equal(q.getQueuedBytes(), expectedBytes);
    });
});

describe("LatencyQueue - QueuedBytes accounting with varying payload sizes", () => {
    let clock, socket;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
    });

    test("queuedBytes tracks each message correctly and decrements on dequeue", () => {
        const sent = [];
        // Use jitter to ensure messages are scheduled at different times
        const config = createTestConfig({
            downstream: { baseMs: 100, jitterMs: 10, dropRate: 0 },
        });
        // Random is called twice per enqueue: once for shouldDrop, once for jitter
        // For 3 messages: shouldDrop(1), jitter(1), shouldDrop(2), jitter(2), shouldDrop(3), jitter(3)
        // We want jitter values: 0.1, 0.5, 0.9 (giving scheduledAt ~92, 100, 108)
        let randCall = 0;
        const q = createLatencyQueue(
            socket,
            config,
            "downstream",
            clock,
            () => {
                const vals = [0.5, 0.1, 0.5, 0.5, 0.5, 0.9]; // shouldDrop, jitter, shouldDrop, jitter, shouldDrop, jitter
                return vals[randCall++ % vals.length];
            },
        );

        // Enqueue messages of different sizes
        const msg1 = JSON.stringify({
            type: "snapshot",
            tick: 1,
            data: "small",
        });
        const msg2 = JSON.stringify({
            type: "snapshot",
            tick: 2,
            data: "x".repeat(100),
        });
        const msg3 = JSON.stringify({
            type: "snapshot",
            tick: 3,
            data: "y".repeat(50),
        });

        const r1 = q.enqueue(msg1, (s, d) => sent.push(d), clock);
        assert.equal(r1.accepted, true);
        const bytesAfter1 = q.getQueuedBytes();
        assert.ok(bytesAfter1 > 0);

        const r2 = q.enqueue(msg2, (s, d) => sent.push(d), clock);
        assert.equal(r2.accepted, true);
        const bytesAfter2 = q.getQueuedBytes();
        assert.equal(bytesAfter2, bytesAfter1 + Buffer.byteLength(msg2));

        const r3 = q.enqueue(msg3, (s, d) => sent.push(d), clock);
        assert.equal(r3.accepted, true);
        const bytesAfter3 = q.getQueuedBytes();
        assert.equal(bytesAfter3, bytesAfter2 + Buffer.byteLength(msg3));

        // Advance to deliver first message (scheduled at ~92)
        clock.advance(95);
        assert.equal(q.getQueuedBytes(), bytesAfter3 - Buffer.byteLength(msg1));
        assert.deepEqual(sent, [msg1]);

        // Advance to deliver second message (scheduled at ~100)
        clock.advance(10);
        assert.equal(
            q.getQueuedBytes(),
            bytesAfter3 - Buffer.byteLength(msg1) - Buffer.byteLength(msg2),
        );
        assert.deepEqual(sent, [msg1, msg2]);

        // Advance to deliver third message (scheduled at ~108)
        clock.advance(10);
        assert.equal(q.getQueuedBytes(), 0);
        assert.deepEqual(sent, [msg1, msg2, msg3]);
    });

    test("queuedBytes never goes negative after cleanup", () => {
        const config = createTestConfig();
        const q = createLatencyQueue(socket, config, "downstream", clock);

        q.enqueue('{"type":"test"}', () => {}, clock);
        assert.ok(q.getQueuedBytes() > 0);

        q.cleanup();
        assert.equal(q.getQueuedBytes(), 0);

        // Repeated cleanup should not make it negative
        q.cleanup();
        q.cleanup();
        assert.equal(q.getQueuedBytes(), 0);
    });

    test("queuedBytes correct after partial delivery then cleanup", () => {
        const sent = [];
        const config = createTestConfig({
            downstream: { baseMs: 100, jitterMs: 10, dropRate: 0 },
        });
        // Random called twice per enqueue: shouldDrop, jitter
        // For 2 messages: shouldDrop(1), jitter(1), shouldDrop(2), jitter(2)
        // Want jitter: 0.1, 0.5 -> scheduledAt ~92, 100
        let randCall = 0;
        const q = createLatencyQueue(
            socket,
            config,
            "downstream",
            clock,
            () => {
                const vals = [0.5, 0.1, 0.5, 0.5]; // shouldDrop, jitter, shouldDrop, jitter
                return vals[randCall++ % vals.length];
            },
        );

        const msg1 = JSON.stringify({
            type: "snapshot",
            tick: 1,
            data: "a".repeat(10),
        });
        const msg2 = JSON.stringify({
            type: "snapshot",
            tick: 2,
            data: "b".repeat(20),
        });

        q.enqueue(msg1, (s, d) => sent.push(d), clock);
        q.enqueue(msg2, (s, d) => sent.push(d), clock);

        const totalBytes = q.getQueuedBytes();
        assert.ok(totalBytes > 0);

        // Deliver first message (scheduled at ~92)
        clock.advance(95);
        assert.equal(q.getQueuedBytes(), totalBytes - Buffer.byteLength(msg1));
        assert.deepEqual(sent, [msg1]);

        // Cleanup before second message delivers
        q.cleanup();
        assert.equal(q.getQueuedBytes(), 0);
    });
});

describe("LatencyQueue - Upstream overflow behavior", () => {
    let clock, socket;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
        // Set up close handler before queue creation
        let socketClosed = false;
        let closeCode = null;
        let closeReason = null;
        socket.close = (code, reason) => {
            socketClosed = true;
            closeCode = code;
            closeReason = reason;
            socket.readyState = 3; // CLOSED
        };
        // Expose for tests
        socket._testState = {
            get socketClosed() {
                return socketClosed;
            },
            get closeCode() {
                return closeCode;
            },
            get closeReason() {
                return closeReason;
            },
        };
    });

    test("upstream overflow uses safe cleanup path for input", () => {
        const config = createTestConfig({
            upstream: { maxMessages: 1, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const inputMsg = JSON.stringify({
            type: "input",
            seq: 1,
            thrust: true,
        });
        assert.deepEqual(
            q.enqueue(inputMsg, () => {}, clock),
            { accepted: true, delayed: true, dropped: false },
        );

        // Second message overflows
        const result = q.enqueue(inputMsg, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");
    });

    test("upstream input overflow closes socket to prevent sequence gap", () => {
        const config = createTestConfig({
            upstream: { maxMessages: 1, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const inputMsg = JSON.stringify({
            type: "input",
            seq: 1,
            thrust: true,
        });
        q.enqueue(inputMsg, () => {}, clock);

        let socketClosed = false;
        let closeCode = null;
        let closeReason = null;
        socket.close = (code, reason) => {
            socketClosed = true;
            closeCode = code;
            closeReason = reason;
            socket.readyState = 3; // CLOSED
        };

        const result = q.enqueue(inputMsg, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");

        assert.equal(socketClosed, true);
        assert.equal(closeCode, 1008);
        assert.ok(closeReason?.includes("Upstream queue overflow"));
    });

    test("upstream join overflow closes socket to prevent sequence gap", () => {
        const config = createTestConfig({
            upstream: { maxMessages: 1, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const joinMsg = JSON.stringify({
            type: "join",
            roomId: "test",
            playerName: "Player",
        });
        q.enqueue(joinMsg, () => {}, clock);

        let socketClosed = false;
        let closeCode = null;
        let closeReason = null;
        socket.close = (code, reason) => {
            socketClosed = true;
            closeCode = code;
            closeReason = reason;
            socket.readyState = 3; // CLOSED
        };

        const result = q.enqueue(joinMsg, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");

        assert.equal(socketClosed, true);
        assert.equal(closeCode, 1008);
        assert.ok(closeReason?.includes("Upstream queue overflow"));
    });

    test("upstream leave overflow closes socket to prevent sequence gap", () => {
        const config = createTestConfig({
            upstream: { maxMessages: 1, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const leaveMsg = JSON.stringify({ type: "leave" });
        q.enqueue(leaveMsg, () => {}, clock);

        let socketClosed = false;
        let closeCode = null;
        let closeReason = null;
        socket.close = (code, reason) => {
            socketClosed = true;
            closeCode = code;
            closeReason = reason;
            socket.readyState = 3; // CLOSED
        };

        const result = q.enqueue(leaveMsg, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");

        assert.equal(socketClosed, true);
        assert.equal(closeCode, 1008);
        assert.ok(closeReason?.includes("Upstream queue overflow"));
    });

    test("upstream chat overflow does not close socket (droppable)", () => {
        const config = createTestConfig({
            upstream: { maxMessages: 1, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const chatMsg = JSON.stringify({ type: "chat", message: "hello" });
        q.enqueue(chatMsg, () => {}, clock);

        let socketClosed = false;
        socket.close = () => {
            socketClosed = true;
            socket.readyState = 3;
        };

        const result = q.enqueue(chatMsg, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");
        assert.equal(socketClosed, false);
    });

    test("upstream byte limit overflow on input closes socket", () => {
        const config = createTestConfig({
            upstream: { maxBytes: 100, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const smallInput = JSON.stringify({
            type: "input",
            seq: 1,
            thrust: true,
        });
        q.enqueue(smallInput, () => {}, clock);

        let socketClosed = false;
        socket.close = () => {
            socketClosed = true;
            socket.readyState = 3;
        };

        const largeInput = JSON.stringify({
            type: "input",
            seq: 2,
            thrust: true,
            data: "x".repeat(200),
        });
        const result = q.enqueue(largeInput, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");
        assert.equal(socketClosed, true);
    });

    test("upstream byte limit overflow on join closes socket", () => {
        const config = createTestConfig({
            upstream: { maxBytes: 100, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const smallJoin = JSON.stringify({
            type: "join",
            roomId: "test",
            playerName: "Player",
        });
        q.enqueue(smallJoin, () => {}, clock);

        let socketClosed = false;
        socket.close = () => {
            socketClosed = true;
            socket.readyState = 3;
        };

        const largeJoin = JSON.stringify({
            type: "join",
            roomId: "test",
            playerName: "Player",
            data: "x".repeat(200),
        });
        const result = q.enqueue(largeJoin, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");
        assert.equal(socketClosed, true);
    });

    test("upstream byte limit overflow on leave closes socket", () => {
        const config = createTestConfig({
            upstream: { maxBytes: 100, dropRate: 0 },
        });
        const q = createLatencyQueue(socket, config, "upstream", clock);

        const smallLeave = JSON.stringify({ type: "leave" });
        q.enqueue(smallLeave, () => {}, clock);

        let socketClosed = false;
        socket.close = () => {
            socketClosed = true;
            socket.readyState = 3;
        };

        const largeLeave = JSON.stringify({
            type: "leave",
            data: "x".repeat(200),
        });
        const result = q.enqueue(largeLeave, () => {}, clock);
        assert.equal(result.accepted, false);
        assert.equal(result.reason, "queue_overflow");
        assert.equal(socketClosed, true);
    });
});

describe("LatencyQueue - Message type detection for Buffer/Uint8Array", () => {
    let clock, socket;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
    });

    test("detects message type from Buffer containing JSON", () => {
        const config = createTestConfig({
            upstream: { dropRate: 1 }, // Would drop if not never-drop type
        });
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "upstream",
            clock,
            () => 0.1,
        );

        const inputMsg = Buffer.from(
            JSON.stringify({ type: "input", seq: 1, thrust: true }),
        );
        const result = q.enqueue(inputMsg, (s, d) => sent.push(d), clock);
        assert.equal(result.accepted, true);
        assert.equal(result.dropped, false); // input should never drop

        clock.advance(1000);
        assert.deepEqual(sent, [inputMsg]);
    });

    test("detects message type from Uint8Array containing JSON", () => {
        const config = createTestConfig({
            upstream: { dropRate: 1 },
        });
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "upstream",
            clock,
            () => 0.1,
        );

        const inputMsg = new TextEncoder().encode(
            JSON.stringify({ type: "input", seq: 1, thrust: true }),
        );
        const result = q.enqueue(inputMsg, (s, d) => sent.push(d), clock);
        assert.equal(result.accepted, true);
        assert.equal(result.dropped, false);

        clock.advance(1000);
        assert.deepEqual(sent, [inputMsg]);
    });

    test("detects join type from Buffer", () => {
        const config = createTestConfig({
            upstream: { dropRate: 1 },
        });
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "upstream",
            clock,
            () => 0.1,
        );

        const joinMsg = Buffer.from(
            JSON.stringify({
                type: "join",
                roomId: "test",
                playerName: "Player",
            }),
        );
        const result = q.enqueue(joinMsg, (s, d) => sent.push(d), clock);
        assert.equal(result.accepted, true);
        assert.equal(result.dropped, false);

        clock.advance(1000);
        assert.deepEqual(sent, [joinMsg]);
    });

    test("detects leave type from Uint8Array", () => {
        const config = createTestConfig({
            upstream: { dropRate: 1 },
        });
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "upstream",
            clock,
            () => 0.1,
        );

        const leaveMsg = new TextEncoder().encode(
            JSON.stringify({ type: "leave" }),
        );
        const result = q.enqueue(leaveMsg, (s, d) => sent.push(d), clock);
        assert.equal(result.accepted, true);
        assert.equal(result.dropped, false);

        clock.advance(1000);
        assert.deepEqual(sent, [leaveMsg]);
    });

    test("detects joined type from Buffer in downstream", () => {
        const config = createTestConfig({
            downstream: { dropRate: 1 },
        });
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "downstream",
            clock,
            () => 0.1,
        );

        const joinedMsg = Buffer.from(
            JSON.stringify({ type: "joined", playerId: "p1", shipId: "s1" }),
        );
        const result = q.enqueue(joinedMsg, (s, d) => sent.push(d), clock);
        assert.equal(result.accepted, true);
        assert.equal(result.dropped, false);

        clock.advance(1000);
        assert.deepEqual(sent, [joinedMsg]);
    });

    test("invalid JSON in Buffer does not crash and treats as unknown type", () => {
        const config = createTestConfig({
            upstream: { dropRate: 0 },
        });
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "upstream",
            clock,
            () => 0.5,
        );

        const invalidMsg = Buffer.from("not valid json");
        const result = q.enqueue(invalidMsg, (s, d) => sent.push(d), clock);
        assert.equal(result.accepted, true);
        assert.equal(result.dropped, false);

        clock.advance(1000);
        assert.deepEqual(sent, [invalidMsg]);
    });

    test("invalid JSON in Uint8Array does not crash", () => {
        const config = createTestConfig({
            upstream: { dropRate: 0 },
        });
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "upstream",
            clock,
            () => 0.5,
        );

        const invalidMsg = new TextEncoder().encode("not valid json");
        const result = q.enqueue(invalidMsg, (s, d) => sent.push(d), clock);
        assert.equal(result.accepted, true);

        clock.advance(1000);
        assert.deepEqual(sent, [invalidMsg]);
    });

    test("never-drop policy holds for upstream join/leave/input with Buffer", () => {
        const config = createTestConfig({
            upstream: { dropRate: 1 },
        });
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "upstream",
            clock,
            () => 0.1,
        );

        const joinMsg = Buffer.from(
            JSON.stringify({ type: "join", roomId: "r", playerName: "p" }),
        );
        const leaveMsg = Buffer.from(JSON.stringify({ type: "leave" }));
        const inputMsg = Buffer.from(JSON.stringify({ type: "input", seq: 1 }));

        q.enqueue(joinMsg, (s, d) => sent.push(d), clock);
        q.enqueue(leaveMsg, (s, d) => sent.push(d), clock);
        q.enqueue(inputMsg, (s, d) => sent.push(d), clock);

        clock.advance(1000);
        assert.equal(sent.length, 3);
    });

    test("never-drop policy holds for downstream joined with Uint8Array", () => {
        const config = createTestConfig({
            downstream: { dropRate: 1 },
        });
        const sent = [];
        const q = createLatencyQueue(
            socket,
            config,
            "downstream",
            clock,
            () => 0.1,
        );

        const joinedMsg = new TextEncoder().encode(
            JSON.stringify({ type: "joined", playerId: "p1" }),
        );
        q.enqueue(joinedMsg, (s, d) => sent.push(d), clock);

        clock.advance(1000);
        assert.equal(sent.length, 1);
    });
});

describe("FakeClock", () => {
    test("advance executes all timers due at or before target time", () => {
        const clock = new FakeClock();
        const executed = [];

        clock.setTimeout(() => executed.push(1), 100);
        clock.setTimeout(() => executed.push(2), 200);
        clock.setTimeout(() => executed.push(3), 300);

        clock.advance(250);

        assert.deepEqual(executed, [1, 2]);
    });

    test("advance executes timers scheduled by callbacks during same advance if due", () => {
        const clock = new FakeClock();
        const executed = [];

        clock.setTimeout(() => {
            executed.push(1);
            clock.setTimeout(() => executed.push(2), 0);
        }, 100);

        clock.advance(200);

        assert.deepEqual(executed, [1, 2]);
    });

    test("deterministic ordering by deadline and insertion order", () => {
        const clock = new FakeClock();
        const executed = [];

        clock.setTimeout(() => executed.push("a"), 100);
        clock.setTimeout(() => executed.push("b"), 100);
        clock.setTimeout(() => executed.push("c"), 50);

        clock.advance(200);

        // c runs first (earlier deadline), then a, then b (insertion order for same deadline)
        assert.deepEqual(executed, ["c", "a", "b"]);
    });

    test("cleanup cancels pending delivery", () => {
        const clock = new FakeClock();
        const socket = createTestSocket();
        const config = createTestConfig();
        const sent = [];

        const q = createLatencyQueue(socket, config, "downstream", clock);
        q.enqueue("msg", (s, d) => sent.push(d), clock);
        q.cleanup();

        clock.advance(1000);

        assert.deepEqual(sent, []);
    });

    test("repeated cleanup is safe", () => {
        const clock = new FakeClock();
        const socket = createTestSocket();
        const config = createTestConfig();

        const q = createLatencyQueue(socket, config, "downstream", clock);
        q.cleanup();
        q.cleanup();
        q.cleanup();

        assert.equal(q.isClosed(), true);
        assert.equal(q.getQueueLength(), 0);
        assert.equal(q.getQueuedBytes(), 0);
    });

    test("cleanup resets queue length and queued byte count", () => {
        const clock = new FakeClock();
        const socket = createTestSocket();
        const config = createTestConfig();

        const q = createLatencyQueue(socket, config, "downstream", clock);
        q.enqueue("msg", () => {}, clock);
        assert.equal(q.getQueueLength(), 1);
        assert.ok(q.getQueuedBytes() > 0);

        q.cleanup();

        assert.equal(q.getQueueLength(), 0);
        assert.equal(q.getQueuedBytes(), 0);
    });
});

describe("Configuration parsing", () => {
    test("parses common latency parameter", () => {
        const config = parseLatencyConfig("/ws?latency=100");
        assert.equal(config.upstream.baseMs, 100);
        assert.equal(config.downstream.baseMs, 100);
    });

    test("parses upstream/downstream base overrides", () => {
        const config = parseLatencyConfig(
            "/ws?latency_up_base=50&latency_down_base=150",
        );
        assert.equal(config.upstream.baseMs, 50);
        assert.equal(config.downstream.baseMs, 150);
    });

    test("parses jitter parameters", () => {
        const config = parseLatencyConfig(
            "/ws?latency=100&latency_up_jitter=20&latency_down_jitter=30",
        );
        assert.equal(config.upstream.jitterMs, 20);
        assert.equal(config.downstream.jitterMs, 30);
    });

    test("parses drop rate parameters", () => {
        const config = parseLatencyConfig(
            "/ws?latency=100&latency_up_drop=0.1&latency_down_drop=0.2",
        );
        assert.equal(config.upstream.dropRate, 0.1);
        assert.equal(config.downstream.dropRate, 0.2);
    });

    test("clamps drop rate to [0, 1]", () => {
        const config = parseLatencyConfig("/ws?latency=100&latency_drop=1.5");
        assert.equal(config.upstream.dropRate, 1);
        assert.equal(config.downstream.dropRate, 1);

        const config2 = parseLatencyConfig("/ws?latency=100&latency_drop=-0.5");
        assert.equal(config2.upstream.dropRate, 0);
        assert.equal(config2.downstream.dropRate, 0);
    });

    test("defaults disabled when no latency params", () => {
        const config = parseLatencyConfig("/ws");
        assert.equal(config.upstream.enabled, false);
        assert.equal(config.downstream.enabled, false);
    });

    test("handles malformed numeric values", () => {
        const config = parseLatencyConfig(
            "/ws?latency=abc&latency_up_jitter=xyz",
        );
        assert.equal(config.upstream.baseMs, 0);
        assert.equal(config.upstream.jitterMs, 0);
        assert.equal(config.upstream.enabled, false);
    });
});

describe("Integration - Match snapshots through downstream queue", () => {
    test("enqueue with object payload goes through downstream queue", () => {
        const clock = new FakeClock();
        const socket = createTestSocket();
        const config = createTestConfig();
        const sent = [];

        const q = createLatencyQueue(socket, config, "downstream", clock);

        const snapshot = {
            type: "snapshot",
            tick: 1,
            entities: [],
            playerAcks: {},
        };
        q.enqueue(snapshot, (s, d) => sent.push(d), clock);

        clock.advance(1000);

        assert.deepEqual(sent, [snapshot]);
    });
});

describe("LatencyQueue - downstream pong handling", () => {
    let clock, socket;

    beforeEach(() => {
        clock = new FakeClock();
        socket = createTestSocket();
    });

    test("pong is delayed by downstream baseMs", () => {
        const sent = [];
        // Disable jitter so the delay is exactly baseMs and deterministic.
        const noJitter = createTestConfig({ downstream: { jitterMs: 0 } });
        const q = createLatencyQueue(socket, noJitter, "downstream", clock);

        const pong = { type: "pong", timestamp: 123, seq: 1 };
        q.enqueue(pong, (s, d) => sent.push(d), clock);

        // Not delivered before baseMs elapses.
        clock.advance(noJitter.downstream.baseMs - 1);
        assert.equal(sent.length, 0, "pong must not be sent before baseMs");

        // Delivered once baseMs has fully elapsed.
        clock.advance(1);
        assert.deepEqual(sent, [pong]);
    });

    test("pong is never randomly dropped even at dropRate=1", () => {
        const sent = [];
        const dropAll = createTestConfig({ downstream: { dropRate: 1 } });
        const q = createLatencyQueue(socket, dropAll, "downstream", clock);

        // With dropRate=1, a non-protected type would be dropped. pong must
        // survive because it is in DOWNSTREAM_NEVER_DROP.
        const pong = { type: "pong", timestamp: 456, seq: 2 };
        const result = q.enqueue(pong, (s, d) => sent.push(d), clock);

        // dropped=true would mean it was randomly dropped; must be false.
        assert.equal(
            result.dropped,
            false,
            "pong must not be reported as dropped",
        );
        assert.equal(result.accepted, true);

        clock.advance(1000);
        assert.deepEqual(sent, [pong], "pong must still be delivered");
    });
});
