import {
    decodeJsonMessage,
    validateClientMessage,
    ProtocolValidationError,
} from "@dogfight/shared";

export const MAX_MESSAGE_SIZE = 16 * 1024;

export class ProtocolError extends Error {
    constructor(message, closeCode = 1008) {
        super(message);
        this.name = "ProtocolError";
        this.closeCode = closeCode;
    }
}

export function parseClientMessage(data) {
    const buffer = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);

    if (buffer.length > MAX_MESSAGE_SIZE) {
        throw new ProtocolError("Message too large", 1009);
    }

    let message;

    try {
        message = decodeJsonMessage(buffer.toString("utf-8"));
    } catch {
        throw new ProtocolError("Invalid JSON");
    }

    try {
        return validateClientMessage(message);
    } catch (error) {
        if (error instanceof ProtocolValidationError) {
            throw new ProtocolError(
                error.message,
                error.closeCode,
            );
        }

        throw error;
    }
}