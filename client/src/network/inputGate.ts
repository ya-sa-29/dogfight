/**
 * Snapshot gate utilities.
 *
 * Client input transmission is gated until the first authoritative snapshot
 * is received. The server ignores input with a negative tick, so there is no
 * point in transmitting before then.
 */

export const NO_SNAPSHOT_TICK = -1;

/**
 * Check if the given snapshot tick allows input transmission.
 * @param snapshotTick - The last received snapshot tick
 * @returns true if input can be sent, false otherwise
 */
export function canSendInput(snapshotTick: number): boolean {
  return Number.isInteger(snapshotTick) && snapshotTick >= 0;
}