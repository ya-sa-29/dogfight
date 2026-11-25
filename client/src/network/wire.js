/**
 * M4 client-side wire helpers.
 *
 * Mirror of the server's wire module (server/src/wire.js) for the browser.
 * Kept pure (no DOM/WebSocket) so the transport selection can be unit tested in
 * Node and reused by the live Connection.
 *
 * Transport model:
 *   - Control-plane messages (join, chat, leave, ping) ALWAYS travel as JSON
 *     text frames, in both JSON and Binary modes.
 *   - Data-plane `input` uses the negotiated codec: JSON text in JSON mode,
 *     binary (encodeBinary) in Binary mode.
 *   - Inbound frames are auto-detected: an ArrayBuffer/TypedArray frame is a
 *     binary snapshot (decodeBinary); anything else is JSON text (control-plane
 *     messages and, in JSON mode, snapshots).
 */

import { encodeBinary, decodeBinary } from "@dogfight/shared";

export const CLIENT_CODEC_JSON = "json";
export const CLIENT_CODEC_BINARY = "binary";

/** Coerce an arbitrary codec value to a known client mode (default JSON). */
export function normalizeClientCodec(codec) {
    return codec === CLIENT_CODEC_BINARY ? CLIENT_CODEC_BINARY : CLIENT_CODEC_JSON;
}

/**
 * Encode an outbound client message for the given codec.
 * Only `input` is binary-encoded; every other message type stays JSON.
 * @param {object} message
 * @param {"json"|"binary"} codec
 * @returns {string|ArrayBuffer} a JSON string or an ArrayBuffer
 */
export function encodeClientMessage(message, codec) {
    if (codec === CLIENT_CODEC_BINARY && message && message.type === "input") {
        return encodeBinary(message);
    }
    return JSON.stringify(message);
}

/**
 * Decode an inbound server frame.
 * Binary frames (ArrayBuffer/TypedArray) are decoded with the shared binary
 * codec; text frames are parsed as JSON. Throws on malformed input.
 * @param {string|ArrayBuffer|Uint8Array} data
 * @returns {object} the parsed message
 */
export function decodeServerFrame(data) {
    if (data instanceof ArrayBuffer) {
        return decodeBinary(data);
    }
    if (ArrayBuffer.isView(data)) {
        const buffer = data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
        );
        return decodeBinary(buffer);
    }
    return JSON.parse(data);
}