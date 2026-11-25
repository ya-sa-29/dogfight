/**
 * M4 server-side wire helpers.
 *
 * These functions centralise the per-message transport decision so the live
 * WebSocket handler (ws.js) and the transport integration tests share exactly
 * the same encode/decode logic — the tests exercise the real code path, not a
 * re-implementation.
 *
 * Transport model (see lab-05 section 6):
 *   - Control-plane messages (join, chat, leave, ping/pong, joined, roster,
 *     errors) ALWAYS travel as JSON text frames, in both JSON and Binary modes.
 *   - Data-plane messages use the negotiated per-connection codec:
 *       JSON mode   : input (client->server) and snapshot (server->client) are
 *                     JSON text frames.
 *       Binary mode : input and snapshot are binary frames produced by the
 *                     shared DataView codec (encodeBinary/decodeBinary).
 *
 * Because snapshots are encoded per-recipient socket and inbound frames are
 * auto-detected (binary frame => decodeBinary, text frame => JSON), two clients
 * in the same room may use different codecs without breaking: each connection
 * negotiates its own codec at join, the server echoes it in `joined`, and every
 * snapshot is encoded for the recipient's negotiated codec.
 */

import { ClientMessage, ServerMessage, SnapshotMessage, Codec, getCodec, jsonCodec, binaryCodec } from "@dogfight/shared";

export const TRANSPORT_JSON = "json";
export const TRANSPORT_BINARY = "binary";

/** Coerce an arbitrary codec value to a known transport mode (default JSON). */
export function normalizeCodec(codec: string): Codec {
  return codec === TRANSPORT_BINARY ? TRANSPORT_BINARY : TRANSPORT_JSON;
}

/** Union of JSON and binary client messages (binary is input-only). */
export type WireClientMessage = ClientMessage;

/**
 * Encode an outbound server message for a specific recipient codec.
 * Only `snapshot` is binary-encoded; every other message type stays JSON.
 * @param {object} message
 * @param {"json"|"binary"} codec
 * @returns {string|Buffer} a JSON string (text frame) or Buffer (binary frame)
 */
export function encodeServerMessage(message: ServerMessage, codec: Codec): string | Buffer {
  const c = getCodec(codec);
  const encoded = c.encodeServerMessage(message);

  if (encoded instanceof ArrayBuffer) {
    return Buffer.from(encoded);
  }
  return encoded;
}

/**
 * Decode an inbound client frame.
 * Binary frames are decoded with the shared binary codec (the only binary
 * client->server message is `input`); text frames are parsed as JSON.
 * @param {Buffer|ArrayBuffer|Uint8Array|string} rawData
 * @param {boolean} isBinary whether the frame arrived as a binary frame
 * @returns {object} the parsed message
 */
export function decodeClientFrame(rawData: Buffer | ArrayBuffer | Uint8Array | string, isBinary: boolean): WireClientMessage | null {
  const c = isBinary ? binaryCodec : jsonCodec;
  let data: string | ArrayBuffer | ArrayBufferView = rawData;
  if (!isBinary && typeof rawData !== "string") {
    data = new TextDecoder().decode(rawData as ArrayBuffer | Uint8Array);
  }
  return c.decodeClientFrame(data);
}