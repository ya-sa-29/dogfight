import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
    encodeBinary,
    decodeBinary,
    CodecError,
    BINARY_FORMAT_VERSION,
} from "../codec/binaryCodec.js";

const POS_TOL = 0.05;
const ANGLE_TOL = 0.001;
const FLOAT_TOL = 0.01;

function assertClose(actual, expected, tol, label) {
    assert.ok(
        Math.abs(actual - expected) <= tol,
        `${label}: expected ~${expected}, got ${actual}`,
    );
}

function inputMessage(overrides = {}) {
    return {
        type: "input",
        seq: 7,
        tick: 42,
        thrust: true,
        turnLeft: false,
        turnRight: true,
        fire: true,
        switchWeapon: false,
        ...overrides,
    };
}

function shipEntity(overrides = {}) {
    return {
        id: 1,
        kind: "ship",
        x: 100.5,
        y: 200.25,
        angle: 1.234,
        radius: 15,
        hp: 3,
        alive: true,
        thrust: true,
        weapon: "bullet",
        missileCount: 2,
        fireCooldown: 0.1,
        invulnerabilityTimer: 0,
        ...overrides,
    };
}

function snapshotMessage(overrides = {}) {
    return {
        type: "snapshot",
        tick: 99,
        serverTime: 123456.789,
        seed: 2147483647,
        score: 12,
        entities: [shipEntity()],
        playerAcks: { "player-uuid-1": 5 },
        ...overrides,
    };
}

describe("binaryCodec — input", () => {
    test("round-trips a full input message", () => {
        const msg = inputMessage();
        const decoded = decodeBinary(encodeBinary(msg));
        assert.deepEqual(decoded, msg);
    });

    test("round-trips input with all booleans false", () => {
        const msg = inputMessage({
            thrust: false,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        });
        assert.deepEqual(decodeBinary(encodeBinary(msg)), msg);
    });

    test("round-trips optional clientBulletId when present", () => {
        const msg = inputMessage({ fire: true, clientBulletId: 4242 });
        const decoded = decodeBinary(encodeBinary(msg));
        assert.equal(decoded.clientBulletId, 4242);
    });

    test("omits clientBulletId when absent", () => {
        const decoded = decodeBinary(encodeBinary(inputMessage()));
        assert.equal("clientBulletId" in decoded, false);
    });

    test("encoded input is 15 bytes", () => {
        const buf = encodeBinary(inputMessage());
        assert.equal(buf.byteLength, 15);
    });
});

describe("binaryCodec — snapshot", () => {
    test("round-trips a snapshot with one ship", () => {
        const msg = snapshotMessage();
        const decoded = decodeBinary(encodeBinary(msg));
        assert.equal(decoded.type, "snapshot");
        assert.equal(decoded.tick, msg.tick);
        assertClose(decoded.serverTime, msg.serverTime, 1e-6, "serverTime");
        assert.equal(decoded.seed, msg.seed);
        assert.equal(decoded.score, msg.score);
        assert.deepEqual(decoded.playerAcks, msg.playerAcks);
        assert.equal(decoded.entities.length, 1);
        assertEntityClose(decoded.entities[0], msg.entities[0]);
    });

    test("round-trips every entity kind with kind-specific fields", () => {
        const entities = [
            shipEntity({ id: 1 }),
            shipEntity({ id: 2, weapon: "missile", missileCount: 3, thrust: false }),
            { id: 3, kind: "bullet", x: 10, y: 20, angle: 0, radius: 3, hp: 1, alive: true, ttl: 1.2 },
            { id: 4, kind: "missile", x: 30, y: 40, angle: 0, radius: 6, hp: 1, alive: true, ttl: 3.5 },
            { id: 5, kind: "asteroid", x: 50, y: 60, angle: 0, radius: 25, hp: 2, alive: true },
            { id: 6, kind: "pickup", x: 70, y: 80, angle: 0, radius: 12, hp: 1, alive: true },
            {
                id: 7,
                kind: "explosion",
                x: 90,
                y: 100,
                angle: 0,
                radius: 0,
                hp: 1,
                alive: true,
                particles: [
                    { x: 1, y: 2, vx: 3, vy: 4, life: 0.5, maxLife: 0.8 },
                    { x: 5, y: 6, vx: 7, vy: 8, life: 0.2, maxLife: 0.6 },
                ],
            },
        ];
        const msg = snapshotMessage({ entities });
        const decoded = decodeBinary(encodeBinary(msg));
        assert.equal(decoded.entities.length, entities.length);
        for (let i = 0; i < entities.length; i += 1) {
            assertEntityClose(decoded.entities[i], entities[i]);
        }
    });

    test("round-trips empty entities and empty playerAcks", () => {
        const msg = snapshotMessage({ entities: [], playerAcks: {} });
        const decoded = decodeBinary(encodeBinary(msg));
        assert.deepEqual(decoded.entities, []);
        assert.deepEqual(decoded.playerAcks, {});
    });

    test("round-trips multiple playerAcks (UUID keys)", () => {
        const msg = snapshotMessage({
            playerAcks: {
                "550e8400-e29b-41d4-a716-446655440000": 3,
                "6ba7b810-9dad-11d1-80b4-00c04fd430c8": -1,
            },
        });
        const decoded = decodeBinary(encodeBinary(msg));
        assert.deepEqual(decoded.playerAcks, msg.playerAcks);
    });

    test("round-trips a dead entity (alive=false)", () => {
        const msg = snapshotMessage({
            entities: [shipEntity({ alive: false, hp: 0 })],
        });
        const decoded = decodeBinary(encodeBinary(msg));
        assert.equal(decoded.entities[0].alive, false);
        assert.equal(decoded.entities[0].hp, 0);
    });

    test("accepts a Node Buffer (Uint8Array view) on decode", () => {
        const buf = Buffer.from(encodeBinary(snapshotMessage()));
        const decoded = decodeBinary(buf);
        assert.equal(decoded.type, "snapshot");
    });
});

describe("binaryCodec — angle quantization", () => {
    test("angle round-trips within quantization tolerance", () => {
        const angle = 1.23456;
        const msg = snapshotMessage({ entities: [shipEntity({ angle })] });
        const decoded = decodeBinary(encodeBinary(msg));
        assertClose(decoded.entities[0].angle, angle, ANGLE_TOL, "angle");
    });

    test("angle outside [-PI, PI] wraps (periodic-safe)", () => {
        const angle = 10.0; // > 2*PI
        const msg = snapshotMessage({ entities: [shipEntity({ angle })] });
        const decoded = decodeBinary(encodeBinary(msg));
        const normalized = Math.atan2(
            Math.sin(decoded.entities[0].angle),
            Math.cos(decoded.entities[0].angle),
        );
        const expected = Math.atan2(Math.sin(angle), Math.cos(angle));
        assertClose(normalized, expected, ANGLE_TOL, "wrapped angle");
    });
});

describe("binaryCodec — format constants", () => {
    test("exposes a format version", () => {
        assert.equal(BINARY_FORMAT_VERSION, 1);
    });
});

describe("binaryCodec — malformed / unsupported (safe failures)", () => {
    test("throws on unsupported message type", () => {
        assert.throws(() => encodeBinary({ type: "chat", message: "hi" }), CodecError);
        assert.throws(() => encodeBinary({ type: "join" }), CodecError);
    });

    test("throws on non-object input", () => {
        assert.throws(() => encodeBinary(null), CodecError);
        assert.throws(() => encodeBinary(42), CodecError);
    });

    test("throws on truncated input buffer", () => {
        const full = encodeBinary(inputMessage());
        const truncated = full.slice(0, full.byteLength - 3);
        assert.throws(() => decodeBinary(truncated), CodecError);
    });

    test("throws on truncated snapshot (cut mid-entity)", () => {
        const full = encodeBinary(snapshotMessage());
        const truncated = full.slice(0, full.byteLength - 8);
        assert.throws(() => decodeBinary(truncated), CodecError);
    });

    test("throws on empty / too-short buffer", () => {
        assert.throws(() => decodeBinary(new ArrayBuffer(0)), CodecError);
        assert.throws(() => decodeBinary(new ArrayBuffer(1)), CodecError);
    });

    test("throws on unknown message-type code", () => {
        const writer = new Uint8Array([9, 1, 0, 0]);
        assert.throws(() => decodeBinary(writer.buffer), CodecError);
    });

    test("throws on unsupported version", () => {
        // type=INPUT(1), version=2, then a few bytes.
        const buf = new Uint8Array([1, 2, 0, 0, 0, 0]);
        assert.throws(() => decodeBinary(buf.buffer), CodecError);
    });

    test("throws on unknown entity kind code", () => {
        // Build a snapshot with an invalid kind code (99) by hand.
        // type=2, version=1, tick(4), serverTime(8), seed(4), score(4),
        // entityCount=1, ackCount=0, then entity: id(4), kind=99.
        const buf = new ArrayBuffer(2 + 1 + 4 + 8 + 4 + 4 + 2 + 2 + 4 + 1);
        const v = new DataView(buf);
        let o = 0;
        v.setUint8(o, 2); o += 1; // snapshot
        v.setUint8(o, 1); o += 1; // version
        v.setUint32(o, 0, true); o += 4; // tick
        v.setFloat64(o, 0, true); o += 8; // serverTime
        v.setUint32(o, 0, true); o += 4; // seed
        v.setInt32(o, 0, true); o += 4; // score
        v.setUint16(o, 1, true); o += 2; // entityCount
        v.setUint16(o, 0, true); o += 2; // ackCount
        v.setUint32(o, 1, true); o += 4; // id
        v.setUint8(o, 99); o += 1; // invalid kind
        assert.throws(() => decodeBinary(buf), CodecError);
    });

    test("decodeBinary rejects non-buffer input", () => {
        assert.throws(() => decodeBinary("a string"), CodecError);
        assert.throws(() => decodeBinary(undefined), CodecError);
    });
});

function assertEntityClose(actual, expected) {
    assert.equal(actual.id, expected.id, "id");
    assert.equal(actual.kind, expected.kind, "kind");
    assert.equal(actual.alive, expected.alive, "alive");
    assert.equal(actual.hp, expected.hp, "hp");
    assertClose(actual.x, expected.x, POS_TOL, "x");
    assertClose(actual.y, expected.y, POS_TOL, "y");
    assertClose(actual.angle, expected.angle, ANGLE_TOL, "angle");
    assertClose(actual.radius, expected.radius, POS_TOL, "radius");

    switch (expected.kind) {
        case "ship":
            assert.equal(actual.thrust, expected.thrust, "thrust");
            assert.equal(actual.weapon, expected.weapon, "weapon");
            assert.equal(actual.missileCount, expected.missileCount, "missileCount");
            assertClose(actual.fireCooldown, expected.fireCooldown, FLOAT_TOL, "fireCooldown");
            assertClose(
                actual.invulnerabilityTimer,
                expected.invulnerabilityTimer,
                FLOAT_TOL,
                "invulnerabilityTimer",
            );
            break;
        case "bullet":
        case "missile":
            assertClose(actual.ttl, expected.ttl, FLOAT_TOL, "ttl");
            break;
        case "explosion": {
            const want = expected.particles || [];
            const got = actual.particles || [];
            assert.equal(got.length, want.length, "particleCount");
            for (let i = 0; i < want.length; i += 1) {
                assertClose(got[i].x, want[i].x, POS_TOL, "particle.x");
                assertClose(got[i].y, want[i].y, POS_TOL, "particle.y");
                assertClose(got[i].vx, want[i].vx, POS_TOL, "particle.vx");
                assertClose(got[i].vy, want[i].vy, POS_TOL, "particle.vy");
                assertClose(got[i].life, want[i].life, FLOAT_TOL, "particle.life");
                assertClose(got[i].maxLife, want[i].maxLife, FLOAT_TOL, "particle.maxLife");
            }
            break;
        }
        default:
            break;
    }
}