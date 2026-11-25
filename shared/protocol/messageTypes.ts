/**
 * Message type literals for the network protocol.
 * Using `as const` makes these narrow literal types for discriminated unions.
 */
export const MessageType = {
  JOIN: "join",
  CHAT: "chat",
  LEAVE: "leave",
  INPUT: "input",
  SNAPSHOT: "snapshot",
  JOINED: "joined",
  ROSTER: "roster",
  ERROR: "error",
} as const;

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

/**
 * TypeScript types derived from the const objects.
 */
export type MessageType = (typeof MessageType)[keyof typeof MessageType];
export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];
export type InputAction = (typeof InputAction)[keyof typeof InputAction];