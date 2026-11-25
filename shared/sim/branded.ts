/**
 * Branded types for type-safe entity identifiers, ticks, and sequences.
 * These provide zero-runtime-cost compile-time distinction between different
 * numeric domains that would otherwise be interchangeable as plain `number`.
 */

// Opaque brand symbol used to distinguish branded types
declare const __brand: unique symbol;

/**
 * Base branded type. A value of type `Branded<T, B>` is assignable to `T`
 * but not to other branded types with different brands.
 */
export type Branded<T, B extends string> = T & { readonly [__brand]: B };

/**
 * Unique identifier for an entity in the world.
 * Distinguishes entity IDs from other numeric values like ticks or sequence numbers.
 */
export type EntityId = Branded<number, "EntityId">;

/**
 * Server tick number. Monotonically increasing integer.
 */
export type Tick = Branded<number, "Tick">;

/**
 * Input sequence number. Monotonically increasing per-client integer.
 */
export type Seq = Branded<number, "Seq">;

/**
 * Angle in radians, distinct from raw numbers.
 */
export type Radians = Branded<number, "Radians">;

/**
 * Safely create an EntityId from a number.
 * Use this when you have a known-valid entity ID (e.g., from the world spawn counter).
 */
export function asEntityId(n: number): EntityId {
  return n as EntityId;
}

/**
 * Safely create a Tick from a number.
 */
export function asTick(n: number): Tick {
  return n as Tick;
}

/**
 * Safely create a Seq from a number.
 */
export function asSeq(n: number): Seq {
  return n as Seq;
}

/**
 * Safely create Radians from a number.
 */
export function asRadians(n: number): Radians {
  return n as Radians;
}

/**
 * Type guard to check if a value is a valid EntityId (non-negative integer).
 */
export function isEntityId(value: unknown): value is EntityId {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Type guard to check if a value is a valid Tick (non-negative integer).
 */
export function isTick(value: unknown): value is Tick {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Type guard to check if a value is a valid Seq (non-negative integer).
 */
export function isSeq(value: unknown): value is Seq {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}