export { Vector2 } from "./sim/vector.js";
export { Entity, ENTITY_KINDS } from "./sim/entity.js";
export type { EntitySnapshot, EntityInput, EntityId, Tick, Seq, Radians } from "./sim/entity.js";
export { Ship } from "./sim/ship.js";
export { Bullet } from "./sim/bullet.js";
export { Missile } from "./sim/missile.js";
export { Asteroid } from "./sim/asteroid.js";
export { Pickup } from "./sim/pickup.js";
export { Explosion } from "./sim/explosion.js";
export type { ExplosionParticleData } from "./sim/explosion.js";
export { World, NEUTRAL_INPUT } from "./sim/world.js";
export type { InputMap } from "./sim/world.js";
export { resolveCollisions, circlesOverlap } from "./sim/collision.js";
export type { CollisionEvent } from "./sim/collision.js";
export { createHomingBehavior } from "./sim/homing.js";
export { wrapShip } from "./sim/arena.js";
export { integrate } from "./sim/integrate.js";
export type { ShipInput, IntegratedState } from "./sim/integrate.js";
export { createWorldFromSeed, initializeWorld } from "./sim/worldInit.js";
export type { WorldInitData } from "./sim/worldInit.js";
export { asEntityId, asTick, asSeq, asRadians, isEntityId, isTick, isSeq } from "./sim/branded.js";

export {
  MessageType,
  EntityKind,
  InputAction,
  Codec,
  ProtocolError,
  type MessageType as MessageTypeT,
  type EntityKind as EntityKindT,
  type InputAction as InputActionT,
  type Codec as CodecT,
  ClientMessageSchema,
  ServerMessageSchema,
  AllMessageSchema,
  JoinMessageSchema,
  ChatMessageSchema,
  LeaveMessageSchema,
  PingMessageSchema,
  InputMessageSchema,
  JoinedMessageSchema,
  SnapshotMessageSchema,
  RosterMessageSchema,
  ErrorMessageSchema,
  PongMessageSchema,
  ServerChatMessageSchema,
  type ClientMessage,
  type ServerMessage,
  type AllMessage,
  type JoinMessage,
  type ChatMessage,
  type LeaveMessage,
  type PingMessage,
  type InputMessage,
  type JoinedMessage,
  type SnapshotMessage,
  type RosterMessage,
  type ErrorMessage,
  type PongMessage,
  type ServerChatMessage,
  type Result,
  type ParseResult,
  type ParseError,
  parseClientMessage,
  parseServerMessage,
  parseMessage,
  isClientMessage,
  isServerMessage,
  assertNever,
  validateInputMessage,
} from "./protocol/schemas.js";

export {
  encodeBinary,
  decodeBinary,
  CodecError,
  BINARY_FORMAT_VERSION,
  type BinaryInputMessage,
  type BinarySnapshotMessage,
  type BinaryEntity,
} from "./codec/binaryCodec.js";

export {
  jsonCodec,
  binaryCodec,
  getCodec,
  type Codec as ProtocolCodec,
  type EncodedMessage,
} from "./codec/index.js";

export { encode as encodeJson, decode as decodeJson } from "./codec/jsonCodec.js";

export { mulberry32, SeededRNG, createRNG } from "./rng/mulberry32.js";


