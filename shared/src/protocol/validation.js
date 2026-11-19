
export class ProtocolValidationError extends Error {
    constructor(message, closeCode = 1008) {
        super(message);
        this.name = "ProtocolValidationError";
        this.closeCode = closeCode;
    }
}

export function validateClientMessage(message) {
    if (
        !message ||
        typeof message !== "object" ||
        Array.isArray(message) ||
        typeof message.type !== "string"
    ) {
        throw new ProtocolValidationError(
            "Invalid message structure",
        );
    }

    switch (message.type) {
        case "join": {
            if (
                typeof message.roomId !== "string" ||
                typeof message.playerName !== "string" ||
                !message.roomId.trim() ||
                !message.playerName.trim() ||
                message.roomId.trim().length > 64 ||
                message.playerName.trim().length > 32
            ) {
                throw new ProtocolValidationError(
                    "Invalid join message",
                );
            }

            return {
                type: "join",
                roomId: message.roomId.trim(),
                playerName: message.playerName.trim(),
            };
        }

        case "chat": {
            if (
                typeof message.message !== "string" ||
                !message.message.trim() ||
                message.message.trim().length > 1000
            ) {
                throw new ProtocolValidationError(
                    "Invalid chat message",
                );
            }

            return {
                type: "chat",
                message: message.message.trim(),
            };
        }

        case "input": {
            if (
                !Number.isSafeInteger(message.seq) ||
                message.seq < 1 ||
                typeof message.thrust !== "boolean" ||
                ![-1, 0, 1].includes(message.turn) ||
                typeof message.fire !== "boolean"
            ) {
                throw new ProtocolValidationError(
                    "Invalid input message",
                );
            }

            if (message.fire) {
                if (
                    typeof message.clientShotId !== "string" ||
                    !message.clientShotId.trim() ||
                    message.clientShotId.length > 64
                ) {
                    throw new ProtocolValidationError(
                        "Invalid input message",
                    );
                }
            } else if (message.clientShotId !== undefined) {
                throw new ProtocolValidationError(
                    "Invalid input message",
                );
            }

            const result = {
                type: "input",
                seq: message.seq,
                thrust: message.thrust,
                turn: message.turn,
                fire: message.fire,
            };

            if (message.fire) {
                result.clientShotId = message.clientShotId;
            }

            return result;
        }

        case "ping": {
            if (!Number.isFinite(message.timestamp)) {
                throw new ProtocolValidationError(
                    "Invalid ping message",
                );
            }

            return {
                type: "ping",
                timestamp: message.timestamp,
            };
        }

        case "leave":
            return { type: "leave" };

        default:
            throw new ProtocolValidationError(
                "Unknown message type",
            );
    }
}
