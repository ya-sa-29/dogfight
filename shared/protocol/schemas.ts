/**
 * Zod schemas for the Dogfight network protocol.
 *
 * This is the single source of truth for message shapes.
 * TypeScript types are inferred from these schemas using z.infer<>,
 * ensuring runtime validation and static types are always in sync.
 */

import { z } from "zod";

/**
 * Protocol error with WebSocket close code.
 */
export class ProtocolError extends Error {
  public override readonly message: string;
  public readonly closeCode: number;

  constructor(message: string, closeCode = 1008) {
    super(message);
    this.name = "ProtocolError";
    this.message = message;
    this.closeCode = closeCode;
  }
}

/**
 * Message type literals for the network protocol.
 * Using const assertions makes these narrow literal types.
 */
export const MessageType = {
  // Client -> Server
  JOIN: "join",
  CHAT: "chat",
  LEAVE: "leave",
  INPUT: "input",
  PING: "ping",

  // Server -> Client
  JOINED: "joined",
  SNAPSHOT: "snapshot",
  ROSTER: "roster",
  ERROR: "error",
  PONG: "pong",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/**
 * Entity kind literals for snapshots.
 */
export const EntityKind = {
  SHIP: "ship",
  BULLET: "bullet",
  MISSILE: "missile",
  ASTEROID: "asteroid",
  PICKUP: "pickup",
  EXPLOSION: "explosion",
} as const;

export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];

/**
 * Input action literals for input flags.
 */
export const InputAction = {
  THRUST: "thrust",
  TURN_LEFT: "turnLeft",
  TURN_RIGHT: "turnRight",
  FIRE: "fire",
  SWITCH_WEAPON: "switchWeapon",
} as const;

export type InputAction = (typeof InputAction)[keyof typeof InputAction];

/**
 * Codec negotiation values.
 */
export const Codec = {
  JSON: "json",
  BINARY: "binary",
} as const;

export type Codec = (typeof Codec)[keyof typeof Codec];

/**
 * Base schema for all messages - requires a string type field.
 */
const BaseMessage = z.object({
  type: z.string(),
});

/**
 * Client -> Server message schemas.
 */

export const JoinMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.JOIN),
  roomId: z.string().min(1).max(64),
  playerName: z.string().min(1).max(32),
  codec: z.enum([Codec.JSON, Codec.BINARY]).optional().default(Codec.JSON),
});

export type JoinMessage = z.infer<typeof JoinMessageSchema>;

export const ChatMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.CHAT),
  message: z.string().min(1).max(1000),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const LeaveMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.LEAVE),
});

export type LeaveMessage = z.infer<typeof LeaveMessageSchema>;

export const PingMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.PING),
  timestamp: z.number().finite().min(0),
  seq: z.number().int().nonnegative(),
});

export type PingMessage = z.infer<typeof PingMessageSchema>;

export const InputMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.INPUT),
  seq: z.number().int().nonnegative(),
  tick: z.number().int().nonnegative(),
  thrust: z.boolean(),
  turnLeft: z.boolean(),
  turnRight: z.boolean(),
  fire: z.boolean(),
  switchWeapon: z.boolean(),
  clientBulletId: z.number().int().nonnegative().optional(),
}).transform((obj) => {
  if (obj.clientBulletId === undefined) {
    const { clientBulletId, ...rest } = obj;
    return rest;
  }
  return obj;
});

export type InputMessage = z.infer<typeof InputMessageSchema>;

/**
 * Union of all client -> server messages.
 * The discriminant is the `type` field.
 */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinMessageSchema,
  ChatMessageSchema,
  LeaveMessageSchema,
  PingMessageSchema,
  InputMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/**
 * Server -> Client message schemas.
 */

export const JoinedMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.JOINED),
  playerId: z.string().min(1),
  shipId: z.number().int().nonnegative(),
  seed: z.number().int().nonnegative(),
  roomConfig: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    asteroidCount: z.number().int().nonnegative(),
  }),
  codec: z.enum([Codec.JSON, Codec.BINARY]).default(Codec.JSON),
});

export type JoinedMessage = z.infer<typeof JoinedMessageSchema>;

export const SnapshotMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.SNAPSHOT),
  tick: z.number().int().nonnegative(),
  serverTime: z.number().finite().min(0),
  seed: z.number().int().nonnegative(),
  score: z.number().int(),
  entities: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      kind: z.enum([
        EntityKind.SHIP,
        EntityKind.BULLET,
        EntityKind.MISSILE,
        EntityKind.ASTEROID,
        EntityKind.PICKUP,
        EntityKind.EXPLOSION,
      ]),
      x: z.number().finite(),
      y: z.number().finite(),
      angle: z.number().finite(),
      radius: z.number().finite().nonnegative(),
      hp: z.number().int().nonnegative(),
      alive: z.boolean(),
      // Ship-specific
      thrust: z.boolean().optional(),
      weapon: z.enum(["bullet", "missile"]).optional(),
      missileCount: z.number().int().nonnegative().optional(),
      fireCooldown: z.number().finite().nonnegative().optional(),
      invulnerabilityTimer: z.number().finite().nonnegative().optional(),
      // Projectile-specific
      ttl: z.number().finite().nonnegative().optional(),
      // Explosion-specific
      particles: z
        .array(
          z.object({
            x: z.number().finite(),
            y: z.number().finite(),
            vx: z.number().finite(),
            vy: z.number().finite(),
            life: z.number().finite().nonnegative(),
            maxLife: z.number().finite().positive(),
          })
        )
        .optional(),
    })
  ),
  playerAcks: z.record(z.string(), z.number().int()),
});

export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;

export const RosterMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.ROSTER),
  players: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(32),
      shipId: z.number().int().nonnegative().optional(),
    })
  ),
});

export type RosterMessage = z.infer<typeof RosterMessageSchema>;

export const ErrorMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.ERROR),
  message: z.string().min(1),
  closeCode: z.number().int().min(1000).max(4999).optional(),
});

export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

export const PongMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.PONG),
  timestamp: z.number().finite().min(0),
  seq: z.number().int().nonnegative(),
});

export type PongMessage = z.infer<typeof PongMessageSchema>;

/**
 * Chat message from server to client (broadcast).
 */
export const ServerChatMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.CHAT),
  playerName: z.string().min(1).max(32),
  message: z.string().min(1).max(1000),
});

export type ServerChatMessage = z.infer<typeof ServerChatMessageSchema>;

/**
 * Union of all server -> client messages.
 * The discriminant is the `type` field.
 */
export const ServerMessageSchema = z.discriminatedUnion("type", [
  JoinedMessageSchema,
  SnapshotMessageSchema,
  RosterMessageSchema,
  ErrorMessageSchema,
  PongMessageSchema,
  ServerChatMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/**
 * All protocol messages (both directions).
 */
export const AllMessageSchema = z.discriminatedUnion("type", [
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
]);

export type AllMessage = z.infer<typeof AllMessageSchema>;

/**
 * Result type for parsing - avoids throwing on invalid input.
 */
export interface ParseResult<T> {
  readonly success: true;
  readonly data: T;
}

export interface ParseError {
  readonly success: false;
  readonly error: z.ZodError;
}

export type Result<T> = ParseResult<T> | ParseError;

/**
 * Parse a client message from unknown input.
 * Returns a Result - never throws.
 * Use this at the network boundary.
 */
export function parseClientMessage(message: unknown): Result<ClientMessage> {
  const result = ClientMessageSchema.safeParse(message);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Parse a server message from unknown input.
 * Returns a Result - never throws.
 */
export function parseServerMessage(message: unknown): Result<ServerMessage> {
  const result = ServerMessageSchema.safeParse(message);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Parse any protocol message (client or server).
 * Returns a Result - never throws.
 */
export function parseMessage(message: unknown): Result<AllMessage> {
  const result = AllMessageSchema.safeParse(message);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Type guard to check if a message is a client message.
 */
export function isClientMessage(message: AllMessage): message is ClientMessage {
  return (
    message.type === MessageType.JOIN ||
    message.type === MessageType.CHAT ||
    message.type === MessageType.LEAVE ||
    message.type === MessageType.PING ||
    message.type === MessageType.INPUT
  );
}

/**
 * Type guard to check if a message is a server message.
 */
export function isServerMessage(message: AllMessage): message is ServerMessage {
  return (
    message.type === MessageType.JOINED ||
    message.type === MessageType.SNAPSHOT ||
    message.type === MessageType.ROSTER ||
    message.type === MessageType.ERROR ||
    message.type === MessageType.PONG ||
    (message.type === MessageType.CHAT && "playerName" in message)
  );
}

/**
 * Exhaustive type assertion helper.
 * Use in switch default cases to ensure all cases are handled.
 * @example
 * function handle(msg: ClientMessage) {
 *   switch (msg.type) {
 *     case "join": return handleJoin(msg);
 *     case "input": return handleInput(msg);
 *     default: assertNever(msg);
 *   }
 * }
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled message type: ${JSON.stringify(value)}`);
}

/**
 * Backwards-compatible validator that throws on invalid input.
 * This wraps the Zod-based parseClientMessage and throws a ProtocolError
 * with the appropriate close code, matching the old validateInputMessage behavior.
 * @deprecated Use parseClientMessage for new code - it returns a Result instead of throwing.
 */
export function validateInputMessage(message: unknown): InputMessage {
  const result = parseClientMessage(message);
  if (!result.success) {
    throw new ProtocolError(`Invalid input: ${result.error.issues.map(i => i.message).join(", ")}`);
  }
  if (result.data.type !== "input") {
    throw new ProtocolError("Expected input message");
  }
  return result.data;
}