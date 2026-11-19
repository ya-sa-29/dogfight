
import test from "node:test";
import assert from "node:assert/strict";

import {
    validateClientMessage,
    ProtocolValidationError,
    encodeJsonMessage,
    decodeJsonMessage,
    CLIENT_MESSAGE_TYPES,
    SERVER_MESSAGE_TYPES,
} from "../src/index.js";

test("message type definitions are available", () => {
    assert.equal(CLIENT_MESSAGE_TYPES.JOIN, "join");
    assert.equal(CLIENT_MESSAGE_TYPES.INPUT, "input");
    assert.equal(SERVER_MESSAGE_TYPES.SNAPSHOT, "snapshot");
});

test("valid join message is normalized", () => {
    const result = validateClientMessage({
        type: "join",
        roomId: "  training  ",
        playerName: "  Player  ",
    });

    assert.deepEqual(result, {
        type: "join",
        roomId: "training",
        playerName: "Player",
    });
});

test("valid chat message is normalized", () => {
    const result = validateClientMessage({
        type: "chat",
        message: "  Hello world  ",
    });

    assert.deepEqual(result, {
        type: "chat",
        message: "Hello world",
    });
});

test("valid input without firing is accepted", () => {
    const message = {
        type: "input",
        seq: 42,
        thrust: true,
        turn: -1,
        fire: false,
    };

    assert.deepEqual(
        validateClientMessage(message),
        message,
    );
});

test("valid firing input with clientShotId is accepted", () => {
    const message = {
        type: "input",
        seq: 43,
        thrust: false,
        turn: 0,
        fire: true,
        clientShotId: "player-123:1",
    };

    assert.deepEqual(
        validateClientMessage(message),
        message,
    );
});

test("valid ping message is accepted", () => {
    assert.deepEqual(
        validateClientMessage({
            type: "ping",
            timestamp: 12345.67,
        }),
        {
            type: "ping",
            timestamp: 12345.67,
        },
    );
});

test("valid leave message is accepted", () => {
    assert.deepEqual(
        validateClientMessage({ type: "leave" }),
        { type: "leave" },
    );
});

test("invalid message structures are rejected", () => {
    const invalidMessages = [
        null,
        undefined,
        [],
        "join",
        {},
        { type: 123 },
    ];

    for (const message of invalidMessages) {
        assert.throws(
            () => validateClientMessage(message),
            ProtocolValidationError,
        );
    }
});

test("invalid join messages are rejected", () => {
    const invalidMessages = [
        { type: "join", roomId: "", playerName: "Player" },
        { type: "join", roomId: "training", playerName: "" },
        { type: "join", roomId: "x".repeat(65), playerName: "Player" },
        { type: "join", roomId: "training", playerName: "x".repeat(33) },
        { type: "join", roomId: 123, playerName: "Player" },
    ];

    for (const message of invalidMessages) {
        assert.throws(
            () => validateClientMessage(message),
            /Invalid join message/,
        );
    }
});

test("invalid chat messages are rejected", () => {
    const invalidMessages = [
        { type: "chat", message: "" },
        { type: "chat", message: "   " },
        { type: "chat", message: "x".repeat(1001) },
        { type: "chat", message: 123 },
    ];

    for (const message of invalidMessages) {
        assert.throws(
            () => validateClientMessage(message),
            /Invalid chat message/,
        );
    }
});

test("invalid input messages are rejected", () => {
    const base = {
        type: "input",
        seq: 1,
        thrust: true,
        turn: 0,
        fire: false,
    };

    const invalidMessages = [
        { ...base, seq: 0 },
        { ...base, seq: -1 },
        { ...base, seq: 1.5 },
        { ...base, seq: Number.MAX_SAFE_INTEGER + 1 },
        { ...base, thrust: 1 },
        { ...base, turn: 2 },
        { ...base, turn: "1" },
        { ...base, fire: "true" },
        { ...base, clientShotId: "player-1:1" },
        { ...base, fire: true },
        { ...base, fire: true, clientShotId: "" },
        { ...base, fire: true, clientShotId: "   " },
        { ...base, fire: true, clientShotId: "x".repeat(65) },
        { ...base, fire: true, clientShotId: 1 },
    ];

    for (const message of invalidMessages) {
        assert.throws(
            () => validateClientMessage(message),
            /Invalid input message/,
        );
    }
});

test("invalid ping messages are rejected", () => {
    const invalidMessages = [
        { type: "ping", timestamp: "123" },
        { type: "ping", timestamp: NaN },
        { type: "ping", timestamp: Infinity },
        { type: "ping", timestamp: null },
    ];

    for (const message of invalidMessages) {
        assert.throws(
            () => validateClientMessage(message),
            /Invalid ping message/,
        );
    }
});

test("unknown message types are rejected", () => {
    assert.throws(
        () => validateClientMessage({ type: "unknown" }),
        /Unknown message type/,
    );
});

test("JSON codec round-trips messages", () => {
    const message = {
        type: "input",
        seq: 12,
        thrust: true,
        turn: 1,
        fire: true,
        clientShotId: "player-123:1",
    };

    const encoded = encodeJsonMessage(message);
    const decoded = decodeJsonMessage(encoded);

    assert.deepEqual(decoded, message);
});

test("JSON decoder rejects invalid JSON", () => {
    assert.throws(
        () => decodeJsonMessage("{invalid json"),
        /Invalid JSON/,
    );
});

test("JSON decoder requires a string", () => {
    assert.throws(
        () => decodeJsonMessage(Buffer.from("{}")),
        /must be a string/,
    );
});
