import {
  ClientMessage,
  JoinMessage,
  ChatMessage,
  LeaveMessage,
  PingMessage,
  InputMessage,
  parseClientMessage,
  validateInputMessage,
  ProtocolError as SharedProtocolError,
  Codec,
  MessageType,
} from "@dogfight/shared";

export const MAX_MESSAGE_SIZE = 16 * 1024;

/**
 * Protocol error with WebSocket close code.
 * Re-exported from shared for backwards compatibility.
 */
export { SharedProtocolError as ProtocolError };

/**
 * Parse a client message from raw data.
 * Returns a Result - never throws.
 * @param data - Raw message data (Buffer, Uint8Array, or string)
 * @returns Result containing the parsed message or error
 */
export function parseClientMessageFromBuffer(data: Buffer | Uint8Array | string): {
  success: true;
  data: ClientMessage;
} | {
  success: false;
  error: Error;
} {
  const buffer = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data);

  if (buffer.length > MAX_MESSAGE_SIZE) {
    return {
      success: false,
      error: new SharedProtocolError("Message too large", 1009),
    };
  }

  let message: unknown;
  try {
    message = JSON.parse(buffer.toString("utf-8"));
  } catch {
    return {
      success: false,
      error: new SharedProtocolError("Invalid JSON"),
    };
  }

  const result = parseClientMessage(message);
  if (!result.success) {
    // ZodError has `issues` array with error details
    const errorMessages = result.error.issues.map((issue: { message: string }) => issue.message).join(", ");
    return {
      success: false,
      error: new SharedProtocolError(`Invalid message: ${errorMessages}`),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Type guard for JoinMessage.
 */
export function isJoinMessage(msg: ClientMessage): msg is JoinMessage {
  return msg.type === MessageType.JOIN;
}

/**
 * Type guard for ChatMessage.
 */
export function isChatMessage(msg: ClientMessage): msg is ChatMessage {
  return msg.type === MessageType.CHAT;
}

/**
 * Type guard for LeaveMessage.
 */
export function isLeaveMessage(msg: ClientMessage): msg is LeaveMessage {
  return msg.type === MessageType.LEAVE;
}

/**
 * Type guard for PingMessage.
 */
export function isPingMessage(msg: ClientMessage): msg is PingMessage {
  return msg.type === MessageType.PING;
}

/**
 * Type guard for InputMessage.
 */
export function isInputMessage(msg: ClientMessage): msg is InputMessage {
  return msg.type === MessageType.INPUT;
}

/**
 * Normalize codec value.
 */
export function normalizeCodec(codec: string): Codec {
  return codec === "binary" ? "binary" : "json";
}

/**
 * Re-export shared types for backwards compatibility.
 */
export type {
  ClientMessage,
  JoinMessage,
  ChatMessage,
  LeaveMessage,
  PingMessage,
  InputMessage,
  Codec,
} from "@dogfight/shared";

/**
 * Re-export parseClientMessage for backwards compatibility.
 */
export { parseClientMessage } from "@dogfight/shared";

/**
 * Re-export validateInputMessage for backwards compatibility with ws.ts.
 * Uses the new Zod-based parseClientMessage internally.
 */
export { validateInputMessage } from "@dogfight/shared";