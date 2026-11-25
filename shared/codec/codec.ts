/**
 * Common Codec interface for protocol message encoding/decoding.
 *
 * Both JSON and binary codecs implement this interface, allowing the
 * transport layer to be codec-agnostic.
 */

import type { ClientMessage, ServerMessage } from "../protocol/schemas";
import { parseClientMessage, parseServerMessage } from "../protocol/schemas";
import { encodeBinary, decodeBinary, CodecError } from "./binaryCodec";

/**
 * Encoded message output - either a string (JSON) or ArrayBuffer (binary).
 */
export type EncodedMessage = string | ArrayBuffer;

/**
 * Codec interface for encoding/decoding protocol messages.
 *
 * The codec handles the wire format for a specific transport mode.
 * Control-plane messages always use JSON; data-plane messages use
 * the negotiated codec.
 */
export interface Codec {
  /**
   * The codec identifier.
   */
  readonly name: "json" | "binary";

  /**
   * Encode a client->server message.
   * Only `input` messages may be binary-encoded; all others are JSON.
   */
  encodeClientMessage(message: ClientMessage): EncodedMessage;

  /**
   * Encode a server->client message.
   * Only `snapshot` messages may be binary-encoded; all others are JSON.
   */
  encodeServerMessage(message: ServerMessage): EncodedMessage;

  /**
   * Decode an inbound client frame (client->server).
   * Binary frames are decoded as binary input; text frames as JSON.
   */
  decodeClientFrame(data: string | ArrayBuffer | ArrayBufferView): ClientMessage | null;

  /**
   * Decode an inbound server frame (server->client).
   * Binary frames are decoded as binary snapshot; text frames as JSON.
   */
  decodeServerFrame(data: string | ArrayBuffer | ArrayBufferView): ServerMessage | null;
}

/**
 * JSON codec implementation.
 * All messages are encoded as JSON strings.
 */
export const jsonCodec: Codec = {
  name: "json",

  encodeClientMessage(message: ClientMessage): string {
    return JSON.stringify(message);
  },

  encodeServerMessage(message: ServerMessage): string {
    return JSON.stringify(message);
  },

  decodeClientFrame(data: string | ArrayBuffer | ArrayBufferView): ClientMessage | null {
    if (typeof data !== "string") {
      return null; // Binary frame not supported in JSON mode
    }
    try {
      const parsed = JSON.parse(data) as unknown;
      const result = parseClientMessage(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  },

  decodeServerFrame(data: string | ArrayBuffer | ArrayBufferView): ServerMessage | null {
    if (typeof data !== "string") {
      return null; // Binary frame not supported in JSON mode
    }
    try {
      const parsed = JSON.parse(data) as unknown;
      const result = parseServerMessage(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  },
};

/**
 * Binary codec implementation.
 * Data-plane messages (input, snapshot) use binary encoding;
 * control-plane messages use JSON.
 */
export const binaryCodec: Codec = {
  name: "binary",

  encodeClientMessage(message: ClientMessage): EncodedMessage {
    if (message.type === "input") {
      return encodeBinary(message);
    }
    return JSON.stringify(message);
  },

  encodeServerMessage(message: ServerMessage): EncodedMessage {
    if (message.type === "snapshot") {
      return encodeBinary(message);
    }
    return JSON.stringify(message);
  },

  decodeClientFrame(data: string | ArrayBuffer | ArrayBufferView): ClientMessage | null {
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data) as unknown;
        const result = parseClientMessage(parsed);
        return result.success ? result.data : null;
      } catch {
        return null;
      }
    }
    // Binary frame - decode as binary input
    try {
      // ArrayBufferView.buffer can be ArrayBuffer | SharedArrayBuffer;
      // SharedArrayBuffer is not used in our codebase, so we narrow to ArrayBuffer.
      const buffer = data instanceof ArrayBuffer
        ? data
        : (data.buffer as ArrayBuffer);
      return decodeBinary(buffer) as ClientMessage;
    } catch (e) {
      if (e instanceof CodecError) return null;
      throw e;
    }
  },

  decodeServerFrame(data: string | ArrayBuffer | ArrayBufferView): ServerMessage | null {
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data) as unknown;
        const result = parseServerMessage(parsed);
        return result.success ? result.data : null;
      } catch {
        return null;
      }
    }
    // Binary frame - decode as binary snapshot
    try {
      // ArrayBufferView.buffer can be ArrayBuffer | SharedArrayBuffer;
      // SharedArrayBuffer is not used in our codebase, so we narrow to ArrayBuffer.
      const buffer = data instanceof ArrayBuffer
        ? data
        : (data.buffer as ArrayBuffer);
      return decodeBinary(buffer) as ServerMessage;
    } catch (e) {
      if (e instanceof CodecError) return null;
      throw e;
    }
  },
};

/**
 * Get a codec by name.
 */
export function getCodec(name: "json" | "binary"): Codec {
  return name === "binary" ? binaryCodec : jsonCodec;
}


