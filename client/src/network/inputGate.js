export const NO_SNAPSHOT_TICK = -1;

export function canSendInput(snapshotTick) {
    return Number.isInteger(snapshotTick) && snapshotTick >= 0;
}