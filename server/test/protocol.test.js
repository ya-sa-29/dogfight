
import test from "node:test";
import assert from "node:assert/strict";

import {
    parseClientMessage,
    ProtocolError,
    MAX_MESSAGE_SIZE,
} from "../src/protocol.js";

test("server parses a valid JSON Buffer", () => {
    const input = {
        type: "input",
        seq: 10,
        thrust: true,
        turn: 0,
        fire: false,
    };

    const result = parseClientMessage(
        Buffer.from(JSON.stringify(input)),
    );

    assert.deepEqual(result, input);
});

test("server parses a firing input with clientShotId", () => {
    const input = {
        type: "input",
        seq: 11,
        thrust: false,
        turn: 0,
        fire: true,
        clientShotId: "player-123:1",
    };

    const result = parseClientMessage(
        Buffer.from(JSON.stringify(input)),
    );

    assert.deepEqual(result, input);
});

test("server parses a valid string", () => {
    const result = parseClientMessage(
        JSON.stringify({
            type: "leave",
        }),
    );

    assert.deepEqual(result, { type: "leave" });
});

test("server rejects invalid JSON", () => {
    assert.throws(
        () => parseClientMessage(Buffer.from("{invalid")),
        (error) => {
            assert.ok(error instanceof ProtocolError);
            assert.equal(error.message, "Invalid JSON");
            assert.equal(error.closeCode, 1008);
            return true;
        },
    );
});

test("server rejects oversized messages", () => {
    const oversized = Buffer.alloc(MAX_MESSAGE_SIZE + 1, 32);

    assert.throws(
        () => parseClientMessage(oversized),
        (error) => {
            assert.ok(error instanceof ProtocolError);
            assert.equal(error.message, "Message too large");
            assert.equal(error.closeCode, 1009);
            return true;
        },
    );
});

test("server converts validation errors to ProtocolError", () => {
    const invalid = Buffer.from(
        JSON.stringify({
            type: "input",
            seq: 0,
            thrust: true,
            turn: 0,
            fire: false,
        }),
    );

    assert.throws(
        () => parseClientMessage(invalid),
        (error) => {
            assert.ok(error instanceof ProtocolError);
            assert.equal(error.message, "Invalid input message");
            assert.equal(error.closeCode, 1008);
            return true;
        },
    );
});

test("server rejects firing input without clientShotId", () => {
    const invalid = Buffer.from(
        JSON.stringify({
            type: "input",
            seq: 12,
            thrust: false,
            turn: 0,
            fire: true,
        }),
    );

    assert.throws(
        () => parseClientMessage(invalid),
        (error) => {
            assert.ok(error instanceof ProtocolError);
            assert.equal(error.message, "Invalid input message");
            assert.equal(error.closeCode, 1008);
            return true;
        },
    );
});
