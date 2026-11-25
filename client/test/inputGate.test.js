import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    NO_SNAPSHOT_TICK,
    canSendInput,
} from '../src/network/inputGate.js';

describe('inputGate', () => {
    test('NO_SNAPSHOT_TICK is -1', () => {
        assert.equal(NO_SNAPSHOT_TICK, -1);
    });

    test('input is blocked before the first snapshot', () => {
        assert.equal(canSendInput(NO_SNAPSHOT_TICK), false);
        assert.equal(canSendInput(-1), false);
    });

    test('input is allowed for non-negative integer snapshot ticks', () => {
        assert.equal(canSendInput(0), true);
        assert.equal(canSendInput(1), true);
        assert.equal(canSendInput(12345), true);
    });

    test('invalid tick values are rejected defensively', () => {
        assert.equal(canSendInput(1.5), false);
        assert.equal(canSendInput(Number.NaN), false);
        assert.equal(canSendInput('0'), false);
        assert.equal(canSendInput(undefined), false);
        assert.equal(canSendInput(null), false);
    });

    test('client waits for the first snapshot, then accepts input', () => {
        let lastSnapshotTick = NO_SNAPSHOT_TICK;

        // Before the first snapshot: no input.
        assert.equal(canSendInput(lastSnapshotTick), false);

        // applySnapshot() receives the first authoritative snapshot.
        lastSnapshotTick = 0;
        assert.equal(canSendInput(lastSnapshotTick), true);

        // Later snapshots update the tick.
        lastSnapshotTick = 42;
        assert.equal(canSendInput(lastSnapshotTick), true);
    });

    test('rejoining resets the sentinel to -1 and blocks input again', () => {
        let lastSnapshotTick = NO_SNAPSHOT_TICK;

        lastSnapshotTick = 7;
        assert.equal(canSendInput(lastSnapshotTick), true);

        // New joined event.
        lastSnapshotTick = NO_SNAPSHOT_TICK;
        assert.equal(canSendInput(lastSnapshotTick), false);

        // First snapshot of the new match.
        lastSnapshotTick = 0;
        assert.equal(canSendInput(lastSnapshotTick), true);
    });
});