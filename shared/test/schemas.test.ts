import { describe, expect, test } from "vitest";
import {
    ProtocolError,
    MessageType,
    Codec,
    JoinMessageSchema,
    parseClientMessage,
    parseServerMessage,
    isClientMessage,
    isServerMessage,
    assertNever,
    validateInputMessage,
    InputMessageSchema,
    ClientMessageSchema,
    ServerMessageSchema,
} from "../../shared/protocol/schemas.ts";

describe("ProtocolError", () => {
    test("creates error with message and close code", () => {
        const err = new ProtocolError("Bad message", 1008);
        expect(err.message).toBe("Bad message");
        expect(err.closeCode).toBe(1008);
        expect(err.name).toBe("ProtocolError");
    });

    test("defaults close code to 1008", () => {
        const err = new ProtocolError("Bad message");
        expect(err.closeCode).toBe(1008);
    });
});

describe("MessageType and Codec constants", () => {
    test("MessageType has expected values", () => {
        expect(MessageType.JOIN).toBe("join");
        expect(MessageType.INPUT).toBe("input");
        expect(MessageType.SNAPSHOT).toBe("snapshot");
        expect(MessageType.JOINED).toBe("joined");
    });

    test("Codec has expected values", () => {
        expect(Codec.JSON).toBe("json");
        expect(Codec.BINARY).toBe("binary");
    });
});

describe("JoinMessageSchema", () => {
    test("accepts valid join message", () => {
        const result = JoinMessageSchema.safeParse({
            type: "join",
            roomId: "room-1",
            playerName: "Alice",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.codec).toBe("json");
        }
    });

    test("accepts join message with binary codec", () => {
        const result = JoinMessageSchema.safeParse({
            type: "join",
            roomId: "room-1",
            playerName: "Alice",
            codec: "binary",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.codec).toBe("binary");
        }
    });

    test("rejects empty roomId", () => {
        const result = JoinMessageSchema.safeParse({
            type: "join",
            roomId: "",
            playerName: "Alice",
        });
        expect(result.success).toBe(false);
    });

    test("rejects missing playerName", () => {
        const result = JoinMessageSchema.safeParse({
            type: "join",
            roomId: "room-1",
        });
        expect(result.success).toBe(false);
    });
});

describe("InputMessageSchema transform", () => {
    test("removes clientBulletId when undefined", () => {
        const result = InputMessageSchema.safeParse({
            type: "input",
            seq: 1,
            tick: 10,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect("clientBulletId" in result.data).toBe(false);
        }
    });

    test("keeps clientBulletId when provided", () => {
        const result = InputMessageSchema.safeParse({
            type: "input",
            seq: 1,
            tick: 10,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
            clientBulletId: 5,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.clientBulletId).toBe(5);
        }
    });
});

describe("validateInputMessage", () => {
    test("returns InputMessage for valid input", () => {
        const result = validateInputMessage({
            type: "input",
            seq: 1,
            tick: 10,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        });
        expect(result.type).toBe("input");
        expect(result.seq).toBe(1);
    });

    test("throws ProtocolError for invalid input", () => {
        expect(() =>
            validateInputMessage({ type: "join", roomId: "r", playerName: "a" }),
        ).toThrow(ProtocolError);
    });

    test("throws ProtocolError for non-input message type", () => {
        expect(() =>
            validateInputMessage({
                type: "snapshot",
                tick: 1,
                serverTime: 0,
                seed: 0,
                score: 0,
                entities: [],
                playerAcks: {},
            }),
        ).toThrow(ProtocolError);
    });
});

describe("parseClientMessage", () => {
    test("returns success for valid join", () => {
        const result = parseClientMessage({
            type: "join",
            roomId: "room-1",
            playerName: "Alice",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.type).toBe("join");
        }
    });

    test("returns failure for garbage without throwing", () => {
        const result = parseClientMessage("not a message");
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBeDefined();
        }
    });

    test("returns failure for null without throwing", () => {
        const result = parseClientMessage(null);
        expect(result.success).toBe(false);
    });
});

describe("parseServerMessage", () => {
    test("returns success for valid snapshot", () => {
        const result = parseServerMessage({
            type: "snapshot",
            tick: 1,
            serverTime: 0,
            seed: 0,
            score: 0,
            entities: [],
            playerAcks: {},
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.type).toBe("snapshot");
        }
    });

    test("returns failure for garbage without throwing", () => {
        const result = parseServerMessage("not a message");
        expect(result.success).toBe(false);
    });
});

describe("isClientMessage", () => {
    test("returns true for client message types", () => {
        expect(isClientMessage({ type: "join", roomId: "r", playerName: "a" } as never)).toBe(true);
        expect(isClientMessage({ type: "input", seq: 1, tick: 1, thrust: false, turnLeft: false, turnRight: false, fire: false, switchWeapon: false } as never)).toBe(true);
        expect(isClientMessage({ type: "leave" } as never)).toBe(true);
        expect(isClientMessage({ type: "ping", timestamp: 1, seq: 1 } as never)).toBe(true);
        expect(isClientMessage({ type: "chat", message: "hi" } as never)).toBe(true);
    });

    test("returns false for server message types", () => {
        expect(isClientMessage({ type: "joined", playerId: "p1", shipId: 0, seed: 0, roomConfig: { width: 10, height: 10, asteroidCount: 1 } } as never)).toBe(false);
        expect(isClientMessage({ type: "snapshot", tick: 1, serverTime: 0, seed: 0, score: 0, entities: [], playerAcks: {} } as never)).toBe(false);
    });
});

describe("isServerMessage", () => {
    test("returns true for server message types", () => {
        expect(isServerMessage({ type: "joined", playerId: "p1", shipId: 0, seed: 0, roomConfig: { width: 10, height: 10, asteroidCount: 1 } } as never)).toBe(true);
        expect(isServerMessage({ type: "snapshot", tick: 1, serverTime: 0, seed: 0, score: 0, entities: [], playerAcks: {} } as never)).toBe(true);
        expect(isServerMessage({ type: "error", message: "err" } as never)).toBe(true);
        expect(isServerMessage({ type: "pong", timestamp: 1, seq: 1 } as never)).toBe(true);
        expect(isServerMessage({ type: "chat", playerName: "a", message: "hi" } as never)).toBe(true);
    });

    test("returns false for client message types", () => {
        expect(isServerMessage({ type: "input", seq: 1, tick: 1, thrust: false, turnLeft: false, turnRight: false, fire: false, switchWeapon: false } as never)).toBe(false);
        expect(isServerMessage({ type: "join", roomId: "r", playerName: "a" } as never)).toBe(false);
    });
});

describe("assertNever", () => {
    test("throws for any value", () => {
        expect(() => assertNever("never" as never)).toThrow("Unhandled message type");
    });
});

describe("ClientMessageSchema discriminated union", () => {
    test("accepts input message", () => {
        const result = ClientMessageSchema.safeParse({
            type: "input",
            seq: 1,
            tick: 10,
            thrust: true,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        });
        expect(result.success).toBe(true);
    });

    test("accepts join message", () => {
        const result = ClientMessageSchema.safeParse({
            type: "join",
            roomId: "room-1",
            playerName: "Alice",
        });
        expect(result.success).toBe(true);
    });

    test("accepts leave message", () => {
        const result = ClientMessageSchema.safeParse({
            type: "leave",
        });
        expect(result.success).toBe(true);
    });

    test("accepts ping message", () => {
        const result = ClientMessageSchema.safeParse({
            type: "ping",
            timestamp: 1000,
            seq: 1,
        });
        expect(result.success).toBe(true);
    });

    test("accepts chat message", () => {
        const result = ClientMessageSchema.safeParse({
            type: "chat",
            message: "Hello",
        });
        expect(result.success).toBe(true);
    });
});

describe("ServerMessageSchema discriminated union", () => {
    test("accepts joined message", () => {
        const result = ServerMessageSchema.safeParse({
            type: "joined",
            playerId: "p1",
            shipId: 0,
            seed: 0,
            roomConfig: { width: 100, height: 100, asteroidCount: 5 },
            codec: "json",
        });
        expect(result.success).toBe(true);
    });

    test("accepts error message", () => {
        const result = ServerMessageSchema.safeParse({
            type: "error",
            message: "Something went wrong",
        });
        expect(result.success).toBe(true);
    });

    test("accepts pong message", () => {
        const result = ServerMessageSchema.safeParse({
            type: "pong",
            timestamp: 1000,
            seq: 1,
        });
        expect(result.success).toBe(true);
    });

    test("accepts roster message", () => {
        const result = ServerMessageSchema.safeParse({
            type: "roster",
            players: [{ id: "p1", name: "Alice" }],
        });
        expect(result.success).toBe(true);
    });
});



