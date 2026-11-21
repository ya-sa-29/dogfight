import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

import { validateInputMessage, encodeBinary, decodeBinary } from "@dogfight/shared";
import {
    encodeServerMessage,
    decodeClientFrame,
    normalizeCodec,
    TRANSPORT_BINARY,
    TRANSPORT_JSON,
} from "../src/wire.js";
import { encodeClientMessage, decodeServerFrame } from "../../client/src/network/wire.js";

function makeSnapshot() {
    return {
        type: "snapshot",
        tick: 1,
        serverTime: 1.5,
        seed: 42,
        score: 0,
        entities: [
            {
                id: 1,
                kind: "ship",
                x: 10,
                y: 20,
                angle: 0.5,
                radius: 15,
                hp: 3,
                alive: true,
                thrust: true,
                weapon: "bullet",
                missileCount: 0,
                fireCooldown: 0,
                invulnerabilityTimer: 0,
            },
        ],
        playerAcks: { p1: 0 },
    };
}

function makeInput() {
    return {
        type: "input",
        seq: 0,
        tick: 1,
        thrust: true,
        turnLeft: false,
        turnRight: false,
        fire: true,
        switchWeapon: false,
    };
}

/**
 * Run one full session against a real WebSocket server that mirrors the live
 * ws.js encode/decode path (using the real wire helpers + validateInputMessage).
 * Returns { serverInput, clientSnapshot, joinedCodec }.
 */
function runSession(codec) {
    return new Promise((resolve, reject) => {
        const server = createServer();
        const wss = new WebSocketServer({ server, path: "/ws" });

        let serverInput = null;
        let resolveInput;
        const inputReceived = new Promise((r) => {
            resolveInput = r;
        });

        wss.on("connection", (socket) => {
            let transportCodec = TRANSPORT_JSON;

            socket.on("message", (data, isBinary) => {
                let message;
                try {
                    message = decodeClientFrame(data, isBinary);
                } catch (error) {
                    socket.close(1008, error.message);
                    return;
                }

                if (message.type === "join") {
                    transportCodec = normalizeCodec(message.codec);
                    // joined is control-plane -> always JSON.
                    socket.send(
                        encodeServerMessage(
                            {
                                type: "joined",
                                playerId: "p1",
                                shipId: 1,
                                codec: transportCodec,
                            },
                            transportCodec,
                        ),
                    );
                    // snapshot is data-plane -> encoded for the negotiated codec.
                    socket.send(encodeServerMessage(makeSnapshot(), transportCodec));
                } else if (message.type === "input") {
                    // Exercise the real server-side validation path.
                    serverInput = validateInputMessage(message);
                    resolveInput(serverInput);
                }
            });
        });

        const cleanup = () => {
            for (const client of wss.clients) client.terminate();
            wss.close();
            server.close();
        };

        server.listen(0, () => {
            const { port } = server.address();
            const ws = new WebSocket(`ws://localhost:${port}/ws`);
            if (codec === TRANSPORT_BINARY) {
                ws.binaryType = "arraybuffer";
            }

            let clientSnapshot = null;
            let joinedCodec = null;
            let resolveSnapshot;
            const snapshotReceived = new Promise((r) => {
                resolveSnapshot = r;
            });

            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(`session (${codec}) timed out`));
            }, 3000);

            ws.on("open", () => {
                // join is control-plane -> always JSON, even in binary mode.
                ws.send(
                    encodeClientMessage(
                        {
                            type: "join",
                            roomId: "room-1",
                            playerName: "tester",
                            codec,
                        },
                        codec,
                    ),
                );
            });

            ws.on("message", (data, isBinary) => {
                // Mirror the browser: binaryType makes binary frames distinct.
                const payload = isBinary ? data : data.toString("utf-8");
                let message;
                try {
                    message = decodeServerFrame(payload);
                } catch (error) {
                    cleanup();
                    reject(error);
                    return;
                }

                if (message.type === "joined") {
                    joinedCodec = message.codec;
                    // Send input in the negotiated codec.
                    ws.send(encodeClientMessage(makeInput(), codec));
                } else if (message.type === "snapshot") {
                    clientSnapshot = message;
                    resolveSnapshot();
                }
            });

            ws.on("error", (error) => {
                clearTimeout(timer);
                cleanup();
                reject(error);
            });

            Promise.all([inputReceived, snapshotReceived]).then(() => {
                clearTimeout(timer);
                ws.close();
                cleanup();
                resolve({ serverInput, clientSnapshot, joinedCodec });
            });
        });
    });
}

describe("wire — transport selection (unit)", () => {
    test("normalizeCodec defaults to json and accepts binary", () => {
        assert.equal(normalizeCodec(undefined), TRANSPORT_JSON);
        assert.equal(normalizeCodec("json"), TRANSPORT_JSON);
        assert.equal(normalizeCodec("binary"), TRANSPORT_BINARY);
        assert.equal(normalizeCodec("nonsense"), TRANSPORT_JSON);
    });

    test("encodeServerMessage: only snapshot is binary", () => {
        const joinedJson = encodeServerMessage({ type: "joined" }, TRANSPORT_BINARY);
        assert.equal(typeof joinedJson, "string");

        const snapBin = encodeServerMessage(makeSnapshot(), TRANSPORT_BINARY);
        assert.ok(Buffer.isBuffer(snapBin), "binary snapshot is a Buffer");
        assert.deepEqual(
            decodeBinary(snapBin),
            makeSnapshot(),
        );

        const snapJson = encodeServerMessage(makeSnapshot(), TRANSPORT_JSON);
        assert.equal(typeof snapJson, "string");
    });

    test("encodeClientMessage: only input is binary", () => {
        const joinJson = encodeClientMessage(
            { type: "join", roomId: "r", playerName: "n", codec: "binary" },
            TRANSPORT_BINARY,
        );
        assert.equal(typeof joinJson, "string");

        const inputBin = encodeClientMessage(makeInput(), TRANSPORT_BINARY);
        assert.ok(inputBin instanceof ArrayBuffer);
        assert.deepEqual(decodeBinary(inputBin), makeInput());

        const inputJson = encodeClientMessage(makeInput(), TRANSPORT_JSON);
        assert.equal(typeof inputJson, "string");
    });

    test("decodeServerFrame handles string and ArrayBuffer", () => {
        const json = JSON.stringify({ type: "joined", codec: "json" });
        assert.deepEqual(decodeServerFrame(json), {
            type: "joined",
            codec: "json",
        });

        const bin = encodeBinary(makeInput());
        assert.deepEqual(decodeServerFrame(bin), makeInput());
    });

    test("decodeClientFrame classifies binary vs text", () => {
        const binFrame = encodeBinary(makeInput());
        assert.deepEqual(decodeClientFrame(binFrame, true), makeInput());

        const textFrame = JSON.stringify({
            type: "join",
            roomId: "r",
            playerName: "n",
        });
        const parsed = decodeClientFrame(Buffer.from(textFrame), false);
        assert.equal(parsed.type, "join");
        assert.equal(parsed.codec, "json");
    });
});

describe("wire — real WebSocket round trip", () => {
    test("JSON mode: join/input/snapshot are JSON text frames", async () => {
        const { serverInput, clientSnapshot, joinedCodec } =
            await runSession(TRANSPORT_JSON);

        assert.equal(joinedCodec, "json");
        // Both paths run the real validateInputMessage, so the decoded+validated
        // input matches the normalized form (which always carries the optional
        // clientBulletId key).
        assert.deepEqual(serverInput, validateInputMessage(makeInput()));
        assert.equal(clientSnapshot.type, "snapshot");
        assert.equal(clientSnapshot.entities[0].kind, "ship");
        assert.deepEqual(clientSnapshot.playerAcks, { p1: 0 });
    });

    test("Binary mode: input/snapshot are binary frames", async () => {
        const { serverInput, clientSnapshot, joinedCodec } =
            await runSession(TRANSPORT_BINARY);

        assert.equal(joinedCodec, "binary");
        // The server decoded the binary input and validated it identically to
        // the JSON path (same normalized form).
        assert.deepEqual(serverInput, validateInputMessage(makeInput()));
        // The client decoded the binary snapshot identically to JSON mode.
        assert.equal(clientSnapshot.type, "snapshot");
        assert.equal(clientSnapshot.entities[0].kind, "ship");
        assert.deepEqual(clientSnapshot.playerAcks, { p1: 0 });
    });
});