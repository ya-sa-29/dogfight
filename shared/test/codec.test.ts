import { describe, expect, test } from "vitest";
import { jsonCodec, binaryCodec, getCodec } from "../../shared/codec/codec.ts";
import { encode, decode } from "../../shared/codec/jsonCodec.ts";

describe("jsonCodec", () => {
    test("encode produces JSON string", () => {
        const result = encode({ type: "join", roomId: "room-1" });
        expect(typeof result).toBe("string");
        expect(JSON.parse(result)).toEqual({ type: "join", roomId: "room-1" });
    });

    test("decode parses JSON string", () => {
        const result = decode('{"type":"join","roomId":"room-1"}');
        expect(result).toEqual({ type: "join", roomId: "room-1" });
    });

    test("decode returns null for invalid JSON", () => {
        const result = decode("not json");
        expect(result).toBeNull();
    });
});

describe("Codec interface", () => {
    test("jsonCodec has name 'json'", () => {
        expect(jsonCodec.name).toBe("json");
    });

    test("binaryCodec has name 'binary'", () => {
        expect(binaryCodec.name).toBe("binary");
    });

    test("getCodec returns jsonCodec for 'json'", () => {
        expect(getCodec("json")).toBe(jsonCodec);
    });

    test("getCodec returns binaryCodec for 'binary'", () => {
        expect(getCodec("binary")).toBe(binaryCodec);
    });

    test("jsonCodec round-trips a client message", () => {
        const message = {
            type: "input",
            seq: 1,
            tick: 10,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };
        const encoded = jsonCodec.encodeClientMessage(message);
        const decoded = jsonCodec.decodeClientFrame(encoded);
        expect(decoded).toEqual(message);
    });

    test("jsonCodec encodes snapshot as JSON string", () => {
        const message = { type: "snapshot", tick: 10, entities: [] };
        const encoded = jsonCodec.encodeServerMessage(message);
        expect(typeof encoded).toBe("string");
        expect(JSON.parse(encoded)).toEqual(message);
    });

    test("binaryCodec encodes input as binary ArrayBuffer", () => {
        const message = { type: "input", seq: 1, tick: 10, thrust: true };
        const encoded = binaryCodec.encodeClientMessage(message);
        expect(encoded instanceof ArrayBuffer).toBe(true);
    });

    test("binaryCodec encodes snapshot as binary ArrayBuffer", () => {
        const message = { type: "snapshot", tick: 10, entities: [] };
        const encoded = binaryCodec.encodeServerMessage(message);
        expect(encoded instanceof ArrayBuffer).toBe(true);
    });

    test("binaryCodec encodes control messages as JSON string", () => {
        const message = { type: "join", roomId: "room-1", playerName: "Alice" };
        const encoded = binaryCodec.encodeClientMessage(message);
        expect(typeof encoded).toBe("string");
        expect(JSON.parse(encoded)).toEqual(message);
    });

    test("binaryCodec decodes binary input frame", () => {
        const message = {
            type: "input",
            seq: 1,
            tick: 10,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };
        const encoded = binaryCodec.encodeClientMessage(message);
        const decoded = binaryCodec.decodeClientFrame(encoded);
        expect(decoded!.seq).toBe(message.seq);
        expect(decoded!.tick).toBe(message.tick);
        expect(decoded!.thrust).toBe(message.thrust);
    });

    test("binaryCodec decodes binary snapshot frame", () => {
        const message = {
            type: "snapshot",
            tick: 10,
            serverTime: 0,
            seed: 0,
            score: 0,
            entities: [],
            playerAcks: {},
        };
        const encoded = binaryCodec.encodeServerMessage(message);
        const decoded = binaryCodec.decodeServerFrame(encoded);
        expect(decoded!.tick).toBe(message.tick);
        expect(decoded!.type).toBe(message.type);
    });

    test("binaryCodec decodes JSON text frame", () => {
        const message = { type: "join", roomId: "room-1", playerName: "Alice" };
        const encoded = JSON.stringify(message);
        const decoded = binaryCodec.decodeClientFrame(encoded);
        expect(decoded!.type).toBe(message.type);
        expect(decoded!.roomId).toBe(message.roomId);
        expect(decoded!.playerName).toBe(message.playerName);
    });

    test("binaryCodec returns null for invalid binary frame", () => {
        const decoded = binaryCodec.decodeClientFrame(new ArrayBuffer(0));
        expect(decoded).toBeNull();
    });

    test("binaryCodec returns null for non-string text frame", () => {
        const decoded = binaryCodec.decodeClientFrame(new ArrayBuffer(8));
        expect(decoded).toBeNull();
    });

    test("binaryCodec decodeServerFrame returns null for invalid JSON", () => {
        const decoded = binaryCodec.decodeServerFrame("not json");
        expect(decoded).toBeNull();
    });

    test("binaryCodec decodeServerFrame returns null for CodecError on binary", () => {
        const decoded = binaryCodec.decodeServerFrame(new ArrayBuffer(0));
        expect(decoded).toBeNull();
    });

    test("binaryCodec decodeClientFrame decodes Uint8Array binary input", () => {
        const message = {
            type: "input",
            seq: 1,
            tick: 10,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };
        const encoded = binaryCodec.encodeClientMessage(message);
        const decoded = binaryCodec.decodeClientFrame(new Uint8Array(encoded));
        expect(decoded!.seq).toBe(message.seq);
    });

    test("binaryCodec decodeServerFrame decodes Uint8Array binary snapshot", () => {
        const message = {
            type: "snapshot",
            tick: 10,
            serverTime: 0,
            seed: 0,
            score: 0,
            entities: [],
            playerAcks: {},
        };
        const encoded = binaryCodec.encodeServerMessage(message);
        const decoded = binaryCodec.decodeServerFrame(new Uint8Array(encoded));
        expect(decoded!.tick).toBe(message.tick);
    });

    test("binaryCodec decodeClientFrame returns null for CodecError on Uint8Array", () => {
        const decoded = binaryCodec.decodeClientFrame(new Uint8Array(0));
        expect(decoded).toBeNull();
    });

    test("binaryCodec decodeServerFrame returns null for CodecError on Uint8Array", () => {
        const decoded = binaryCodec.decodeServerFrame(new Uint8Array(0));
        expect(decoded).toBeNull();
    });

    test("binaryCodec decodeServerFrame decodes binary snapshot", () => {
        const message = {
            type: "snapshot",
            tick: 10,
            serverTime: 0,
            seed: 0,
            score: 0,
            entities: [],
            playerAcks: {},
        };
        const encoded = binaryCodec.encodeServerMessage(message);
        const decoded = binaryCodec.decodeServerFrame(encoded);
        expect(decoded!.tick).toBe(message.tick);
        expect(decoded!.type).toBe(message.type);
    });
});



