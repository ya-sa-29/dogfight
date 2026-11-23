/**
 * M4 binary codec (ArrayBuffer + DataView).
 *
 * A compact, deterministic, versioned binary encoding for the two high-rate
 * messages exchanged during a match: INPUT (client -> server) and SNAPSHOT
 * (server -> client). Everything is LITTLE-ENDIAN. The format is documented
 * field-by-field below so it can be reimplemented and versioned.
 *
 * Design goals (lab-05 section 6):
 *   - small on the wire (no number-to-string conversion),
 *   - zero-copy parsing with DataView,
 *   - deterministic layout (stable field order, no Maps in the output),
 *   - angles quantized to Int16 in 1/1000 radians (2 bytes instead of 4),
 *   - safe against malformed / truncated / unsupported input (throws CodecError).
 *
 * This module is pure (no DOM / Node built-ins, only language features) so it
 * runs identically in the browser and in Node, and can be unit tested in Node.
 *
 * ---------------------------------------------------------------------------
 * Wire format (version 1)
 * ---------------------------------------------------------------------------
 * Byte 0 of every message is the message-type code so decode() can dispatch:
 *   1 = INPUT
 *   2 = SNAPSHOT
 * Byte 1 is the format version (currently 1).
 *
 * INPUT (client -> server), 15 bytes:
 *   0   Uint8   messageType = 1
 *   1   Uint8   version     = 1
 *   2   Uint32  seq
 *   6   Uint32  tick
 *   10  Uint8   flags  (bit0 thrust, bit1 turnLeft, bit2 turnRight,
 *                      bit3 fire, bit4 switchWeapon)
 *   11  Int32   clientBulletId  (-1 when the field is absent)
 *
 * SNAPSHOT (server -> client):
 *   0   Uint8   messageType = 2
 *   1   Uint8   version     = 1
 *   2   Uint32  tick
 *   6   Float64 serverTime
 *   14  Uint32  seed
 *   18  Int32   score
 *   22  Uint16  entityCount
 *   24  Uint16  playerAckCount
 *   26  <entity>[entityCount]
 *   ..  <playerAck>[playerAckCount]
 *
 * <entity>:
 *   Uint32  id
 *   Uint8   kindCode  (1 ship, 2 bullet, 3 missile, 4 asteroid, 5 pickup,
 *                      6 explosion)
 *   Uint8   flags     (bit0 alive)
 *   Float32 x
 *   Float32 y
 *   Int16   angleQ    (angle in 1/1000 rad, wrapped to [-PI, PI])
 *   Float32 radius
 *   Uint8   hp
 *   -- kind specific --
 *   ship:     Uint8 thrustFlag, Uint8 weaponCode (0 bullet, 1 missile),
 *             Uint8 missileCount, Float32 fireCooldown,
 *             Float32 invulnerabilityTimer
 *   bullet:   Float32 ttl
 *   missile:  Float32 ttl
 *   asteroid: (none)
 *   pickup:   (none)
 *   explosion:Uint16 particleCount, then per particle:
 *             Float32 x, Float32 y, Float32 vx, Float32 vy,
 *             Float32 life, Float32 maxLife
 *
 * <playerAck>:
 *   Uint16  playerIdLen
 *   Uint8[playerIdLen] playerId  (UTF-8)
 *   Int32   seq
 */

// Message type codes (wire values). These are intentionally distinct from the
// string MessageType values used by the JSON protocol.
const WIRE_INPUT = 1;
const WIRE_SNAPSHOT = 2;

// Entity kind codes.
const KIND_SHIP = 1;
const KIND_BULLET = 2;
const KIND_MISSILE = 3;
const KIND_ASTEROID = 4;
const KIND_PICKUP = 5;
const KIND_EXPLOSION = 6;

const KIND_TO_CODE: Record<string, number> = {
  ship: KIND_SHIP,
  bullet: KIND_BULLET,
  missile: KIND_MISSILE,
  asteroid: KIND_ASTEROID,
  pickup: KIND_PICKUP,
  explosion: KIND_EXPLOSION,
};

const CODE_TO_KIND: Record<number, string> = {
  [KIND_SHIP]: "ship",
  [KIND_BULLET]: "bullet",
  [KIND_MISSILE]: "missile",
  [KIND_ASTEROID]: "asteroid",
  [KIND_PICKUP]: "pickup",
  [KIND_EXPLOSION]: "explosion",
};

// Weapon code: 0 = bullet, 1 = missile.
const WEAPON_TO_CODE: Record<"bullet" | "missile", number> = { bullet: 0, missile: 1 };
const CODE_TO_WEAPON: { readonly 0: "bullet"; readonly 1: "missile" } = { 0: "bullet", 1: "missile" };

const FORMAT_VERSION = 1;
const ANGLE_SCALE = 1000;
const TWO_PI = Math.PI * 2;
const NO_CLIENT_BULLET_ID = -1;

/**
 * Error thrown by the binary codec for malformed or unsupported data.
 */
export class CodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodecError";
  }
}

function wrapAngle(angle: number): number {
  // Wrap to [-PI, PI] so quantization fits Int16 and remains periodic-safe.
  let a = angle % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

/**
 * Growable byte buffer for encoding.
 */
class ByteWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number;

  constructor() {
    this.buffer = new ArrayBuffer(64);
    this.view = new DataView(this.buffer);
    this.offset = 0;
  }

  private _ensure(extra: number): void {
    const required = this.offset + extra;
    if (required <= this.buffer.byteLength) return;
    let newSize = this.buffer.byteLength * 2;
    while (newSize < required) newSize *= 2;
    const next = new ArrayBuffer(newSize);
    new Uint8Array(next).set(new Uint8Array(this.buffer, 0, this.offset));
    this.buffer = next;
    this.view = new DataView(next);
  }

  u8(value: number): void {
    this._ensure(1);
    this.view.setUint8(this.offset, value & 0xff);
    this.offset += 1;
  }

  u16(value: number): void {
    this._ensure(2);
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  u32(value: number): void {
    this._ensure(4);
    this.view.setUint32(this.offset, value >>> 0, true);
    this.offset += 4;
  }

  i16(value: number): void {
    this._ensure(2);
    this.view.setInt16(this.offset, value, true);
    this.offset += 2;
  }

  i32(value: number): void {
    this._ensure(4);
    this.view.setInt32(this.offset, value, true);
    this.offset += 4;
  }

  f32(value: number): void {
    this._ensure(4);
    this.view.setFloat32(this.offset, value, true);
    this.offset += 4;
  }

  f64(value: number): void {
    this._ensure(8);
    this.view.setFloat64(this.offset, value, true);
    this.offset += 8;
  }

  bytes(bytes: Uint8Array): void {
    this._ensure(bytes.length);
    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
  }

  finish(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }
}

/**
 * Read-only byte buffer for decoding.
 */
class ByteReader {
  private view: DataView;
  private offset: number;
  private length: number;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.offset = 0;
    this.length = buffer.byteLength;
  }

  private _need(n: number): void {
    if (this.offset + n > this.length) {
      throw new CodecError("Truncated binary message");
    }
  }

  u8(): number {
    this._need(1);
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  u16(): number {
    this._need(2);
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  u32(): number {
    this._need(4);
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  i16(): number {
    this._need(2);
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  i32(): number {
    this._need(4);
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  f32(): number {
    this._need(4);
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  f64(): number {
    this._need(8);
    const v = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }

  bytes(n: number): Uint8Array {
    this._need(n);
    const out = new Uint8Array(n);
    out.set(new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, n));
    this.offset += n;
    return out;
  }

  remaining(): number {
    return this.length - this.offset;
  }
}

// TextEncoder/TextDecoder are available in both browser and Node (global)
// Declare them for TypeScript
declare const TextEncoder: { new(): { encode(input: string): Uint8Array } };
declare const TextDecoder: { new(): { decode(input: Uint8Array | ArrayBuffer, options?: { stream?: boolean }): string } };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Input message structure for binary encoding.
 */
export interface BinaryInputMessage {
  readonly type: "input";
  readonly seq: number;
  readonly tick: number;
  readonly thrust: boolean;
  readonly turnLeft: boolean;
  readonly turnRight: boolean;
  readonly fire: boolean;
  readonly switchWeapon: boolean;
  clientBulletId?: number;
}

/**
 * Entity structure for binary encoding (matches EntitySnapshot).
 * Properties are not readonly so they can be populated during decoding.
 */
export interface BinaryEntity {
  id: number;
  kind: string;
  alive: boolean;
  x: number;
  y: number;
  angle: number;
  radius: number;
  hp: number;
  // Kind-specific fields (optional)
  thrust?: boolean;
  weapon?: "bullet" | "missile";
  missileCount?: number;
  fireCooldown?: number;
  invulnerabilityTimer?: number;
  ttl?: number;
  particles?: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
  }[];
}

/**
 * Snapshot message structure for binary encoding.
 */
export interface BinarySnapshotMessage {
  readonly type: "snapshot";
  readonly tick: number;
  readonly serverTime: number;
  readonly seed: number;
  readonly score: number;
  readonly entities: readonly BinaryEntity[];
  readonly playerAcks: Record<string, number>;
}

function writeInput(writer: ByteWriter, message: BinaryInputMessage): void {
  writer.u8(WIRE_INPUT);
  writer.u8(FORMAT_VERSION);
  writer.u32(message.seq);
  writer.u32(message.tick);
  let flags = 0;
  if (message.thrust) flags |= 1 << 0;
  if (message.turnLeft) flags |= 1 << 1;
  if (message.turnRight) flags |= 1 << 2;
  if (message.fire) flags |= 1 << 3;
  if (message.switchWeapon) flags |= 1 << 4;
  writer.u8(flags);
  const bulletId =
    typeof message.clientBulletId === "number"
      ? message.clientBulletId
      : NO_CLIENT_BULLET_ID;
  writer.i32(bulletId);
}

function readInput(reader: ByteReader): BinaryInputMessage {
  const version = reader.u8();
  if (version !== FORMAT_VERSION) {
    throw new CodecError(`Unsupported input version ${version}`);
  }
  const seq = reader.u32();
  const tick = reader.u32();
  const flags = reader.u8();
  const clientBulletId = reader.i32();
  const message: BinaryInputMessage = {
    type: "input",
    seq,
    tick,
    thrust: (flags & (1 << 0)) !== 0,
    turnLeft: (flags & (1 << 1)) !== 0,
    turnRight: (flags & (1 << 2)) !== 0,
    fire: (flags & (1 << 3)) !== 0,
    switchWeapon: (flags & (1 << 4)) !== 0,
  };
  if (clientBulletId !== NO_CLIENT_BULLET_ID) {
    message.clientBulletId = clientBulletId;
  }
  return message;
}

function writeEntity(writer: ByteWriter, entity: BinaryEntity): void {
  writer.u32(entity.id);
  writer.u8(KIND_TO_CODE[entity.kind] || 0);
  writer.u8(entity.alive ? 1 : 0);
  writer.f32(entity.x);
  writer.f32(entity.y);
  writer.i16(Math.round(wrapAngle(entity.angle || 0) * ANGLE_SCALE));
  writer.f32(entity.radius || 0);
  writer.u8(entity.hp || 0);

  switch (entity.kind) {
    case "ship":
      writer.u8(entity.thrust ? 1 : 0);
      writer.u8(WEAPON_TO_CODE[entity.weapon ?? "bullet"] ?? 0);
      writer.u8(entity.missileCount || 0);
      writer.f32(entity.fireCooldown || 0);
      writer.f32(entity.invulnerabilityTimer || 0);
      break;
    case "bullet":
    case "missile":
      writer.f32(entity.ttl || 0);
      break;
    case "explosion": {
      const particles = entity.particles ?? [];
      writer.u16(particles.length);
      for (const p of particles) {
        writer.f32(p.x);
        writer.f32(p.y);
        writer.f32(p.vx);
        writer.f32(p.vy);
        writer.f32(p.life);
        writer.f32(p.maxLife);
      }
      break;
    }
    default:
      // asteroid, pickup: no kind-specific fields.
      break;
  }
}

function readEntity(reader: ByteReader): BinaryEntity {
  const id = reader.u32();
  const kindCode = reader.u8();
  const kind = CODE_TO_KIND[kindCode];
  if (!kind) {
    throw new CodecError(`Unknown entity kind code ${kindCode}`);
  }
  const alive = reader.u8() !== 0;
  const x = reader.f32();
  const y = reader.f32();
  const angle = reader.i16() / ANGLE_SCALE;
  const radius = reader.f32();
  const hp = reader.u8();

  const entity: BinaryEntity = { id, kind, alive, x, y, angle, radius, hp };

  switch (kind) {
    case "ship":
      entity.thrust = reader.u8() !== 0;
      const weaponCode = reader.u8();
      // CODE_TO_WEAPON is a const object with exact keys 0|1; weaponCode validated by wire format.
      entity.weapon = CODE_TO_WEAPON[weaponCode as 0 | 1] ?? "bullet";
      entity.missileCount = reader.u8();
      entity.fireCooldown = reader.f32();
      entity.invulnerabilityTimer = reader.f32();
      break;
    case "bullet":
    case "missile":
      entity.ttl = reader.f32();
      break;
    case "explosion": {
      const count = reader.u16();
      const particles = [];
      for (let i = 0; i < count; i += 1) {
        particles.push({
          x: reader.f32(),
          y: reader.f32(),
          vx: reader.f32(),
          vy: reader.f32(),
          life: reader.f32(),
          maxLife: reader.f32(),
        });
      }
      if (count > 0) {
        entity.particles = particles;
      }
      break;
    }
    default:
      break;
  }

  return entity;
}

function writeSnapshot(writer: ByteWriter, message: BinarySnapshotMessage): void {
  writer.u8(WIRE_SNAPSHOT);
  writer.u8(FORMAT_VERSION);
  writer.u32(message.tick);
  writer.f64(message.serverTime || 0);
  writer.u32(message.seed || 0);
  writer.i32(message.score || 0);

  const entities = Array.isArray(message.entities) ? message.entities : [];
  writer.u16(entities.length);

  const playerAcks = message.playerAcks || {};
  const ackKeys = Object.keys(playerAcks);
  writer.u16(ackKeys.length);

  for (const entity of entities) {
    writeEntity(writer, entity);
  }
  for (const key of ackKeys) {
    const idBytes = textEncoder.encode(key);
    writer.u16(idBytes.length);
    writer.bytes(idBytes);
    writer.i32(playerAcks[key] ?? 0);
  }
}

function readSnapshot(reader: ByteReader): BinarySnapshotMessage {
  const version = reader.u8();
  if (version !== FORMAT_VERSION) {
    throw new CodecError(`Unsupported snapshot version ${version}`);
  }
  const tick = reader.u32();
  const serverTime = reader.f64();
  const seed = reader.u32();
  const score = reader.i32();
  const entityCount = reader.u16();
  const playerAckCount = reader.u16();

  const entities: BinaryEntity[] = [];
  for (let i = 0; i < entityCount; i += 1) {
    entities.push(readEntity(reader));
  }

  const playerAcks: Record<string, number> = {};
  for (let i = 0; i < playerAckCount; i += 1) {
    const len = reader.u16();
    const idBytes = reader.bytes(len);
    const key = textDecoder.decode(idBytes);
    playerAcks[key] = reader.i32();
  }

  return {
    type: "snapshot",
    tick,
    serverTime,
    seed,
    score,
    entities,
    playerAcks,
  };
}

/**
 * Encode a protocol message to an ArrayBuffer.
 * Supports INPUT and SNAPSHOT. Throws CodecError for unsupported types.
 * @param message - The message to encode
 * @returns ArrayBuffer containing the encoded message
 */
export function encodeBinary(message: unknown): ArrayBuffer {
  if (!message || typeof message !== "object") {
    throw new CodecError("Cannot encode non-object message");
  }

  const writer = new ByteWriter();
  const msg = message as { type?: unknown; seq?: unknown; tick?: unknown; entities?: unknown };

  if (msg["type"] === "input" && typeof msg["seq"] === "number" && typeof msg["tick"] === "number") {
    writeInput(writer, msg as BinaryInputMessage);
  } else if (msg["type"] === "snapshot" && typeof msg["tick"] === "number" && Array.isArray(msg["entities"])) {
    writeSnapshot(writer, msg as BinarySnapshotMessage);
  } else {
    throw new CodecError(`Unsupported message type: ${msg["type"] as string}`);
  }
  return writer.finish();
}

/**
 * Decode an ArrayBuffer / Uint8Array / Buffer produced by encodeBinary().
 * Throws CodecError on malformed, truncated, versioned or unsupported data.
 * @param data - The binary data to decode
 * @returns The decoded message object
 */
export function decodeBinary(data: ArrayBuffer | Uint8Array): BinaryInputMessage | BinarySnapshotMessage {
  let buffer: ArrayBuffer;
  if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (ArrayBuffer.isView(data)) {
    // data.buffer can be ArrayBuffer | SharedArrayBuffer; SharedArrayBuffer is not used here.
    buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
  } else {
    throw new CodecError("decodeBinary expects ArrayBuffer or TypedArray");
  }

  if (buffer.byteLength < 2) {
    throw new CodecError("Message too short");
  }

  const reader = new ByteReader(buffer);
  const messageType = reader.u8();

  if (messageType === WIRE_INPUT) {
    return readInput(reader);
  }
  if (messageType === WIRE_SNAPSHOT) {
    return readSnapshot(reader);
  }
  throw new CodecError(`Unsupported message type code: ${messageType}`);
}

export const BINARY_FORMAT_VERSION = FORMAT_VERSION;