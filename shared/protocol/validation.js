import { MessageType } from "./messageTypes.js";

export class ProtocolError extends Error {
    constructor(message, closeCode = 1008) {
        super(message);
        this.name = "ProtocolError";
        this.closeCode = closeCode;
    }
}

export function validateInputMessage(message) {
    if (
        typeof message.seq !== "number" ||
        !Number.isInteger(message.seq) ||
        message.seq < 0
    ) {
        throw new ProtocolError("Invalid input seq");
    }

    if (
        typeof message.tick !== "number" ||
        !Number.isInteger(message.tick) ||
        message.tick < 0
    ) {
        throw new ProtocolError("Invalid input tick");
    }

    if (typeof message.thrust !== "boolean") {
        throw new ProtocolError("Invalid thrust value");
    }

    if (typeof message.turnLeft !== "boolean") {
        throw new ProtocolError("Invalid turnLeft value");
    }

    if (typeof message.turnRight !== "boolean") {
        throw new ProtocolError("Invalid turnRight value");
    }

    if (typeof message.fire !== "boolean") {
        throw new ProtocolError("Invalid fire value");
    }

    if (typeof message.switchWeapon !== "boolean") {
        throw new ProtocolError("Invalid switchWeapon value");
    }

    if (message.fire && message.clientBulletId !== undefined) {
        if (
            typeof message.clientBulletId !== "number" ||
            !Number.isInteger(message.clientBulletId) ||
            message.clientBulletId < 0
        ) {
            throw new ProtocolError("Invalid clientBulletId");
        }
    }

    return {
        type: MessageType.INPUT,
        seq: message.seq,
        tick: message.tick,
        thrust: message.thrust,
        turnLeft: message.turnLeft,
        turnRight: message.turnRight,
        fire: message.fire,
        switchWeapon: message.switchWeapon,
        clientBulletId: message.clientBulletId,
    };
}

export function validateSnapshotMessage(message) {
    // Basic validation - more detailed validation can be added
    return message;
}
