import pino, { type Logger } from "pino";
import { config } from "./config.js";

const logLevel = config.logLevel ?? "info";

export const logger: Logger = pino({
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
});

export type LogContext = {
    roomId?: string;
    playerId?: string;
};

export function childLogger(context: LogContext): Logger {
    const { roomId, playerId } = context;
    const fields: Record<string, string> = {};
    if (roomId) fields["roomId"] = roomId;
    if (playerId) fields["playerId"] = playerId;
    return logger.child(fields);
}

export { config };
