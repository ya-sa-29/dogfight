
import test from "node:test";
import assert from "node:assert/strict";
import { createPrediction } from "../src/network/prediction.js";

function createSnapshot({
    tick = 1,
    seq = 0,
    x = 400,
    y = 300,
    vx = 0,
    vy = 0,
    angle = 0,
} = {}) {
    return {
        tick,
        lastProcessedSeq: seq,
        entities: [
            {
                id: 1,
                kind: "ship",
                playerId: "player-1",
                pos: { x, y },
                vel: { x: vx, y: vy },
                angle,
                thrust: false,
            },
        ],
    };
}

function createPredictionInstance() {
    return createPrediction({
        width: 1600,
        height: 900,
    });
}

function createInput(seq) {
    return {
        seq,
        thrust: true,
        turn: 0,
        fire: false,
    };
}

test("prediction initializes from server snapshot", () => {
    const prediction = createPredictionInstance();

    assert.equal(
        prediction.reconcile(createSnapshot(), "player-1", 1000),
        true,
    );

    assert.equal(prediction.initialized, true);

    const state = prediction.getRenderState(1000);

    assert.equal(state.pos.x, 400);
    assert.equal(state.pos.y, 300);
});

test("prediction applies local input immediately", () => {
    const prediction = createPredictionInstance();

    prediction.reconcile(createSnapshot(), "player-1", 1000);

    prediction.predict(createInput(1));

    const state = prediction.getRenderState(1000);

    assert.ok(state.pos.x > 400);
    assert.equal(state.pos.y, 300);
    assert.equal(prediction.pendingCount, 1);
});

test("reconciliation removes acknowledged inputs and replays pending inputs", () => {
    const prediction = createPredictionInstance();

    prediction.reconcile(createSnapshot(), "player-1", 1000);

    prediction.predict(createInput(1));
    prediction.predict(createInput(2));

    assert.equal(prediction.pendingCount, 2);

    const beforeCorrection = prediction.getRenderState(1000);

    prediction.reconcile(
        createSnapshot({
            tick: 2,
            seq: 1,
            x: 401,
            vx: 30,
        }),
        "player-1",
        1010,
    );

    assert.equal(prediction.pendingCount, 1);

    const immediatelyAfter = prediction.getRenderState(1010);

    assert.ok(
        Math.abs(
            immediatelyAfter.pos.x - beforeCorrection.pos.x,
        ) < 0.001,
    );

    const afterSmoothing = prediction.getRenderState(1110);

    assert.ok(afterSmoothing.pos.x > 401.8);
});

test("reconciliation rejects snapshots without the local ship", () => {
    const prediction = createPredictionInstance();

    const snapshot = createSnapshot();
    snapshot.entities = [];

    assert.equal(
        prediction.reconcile(snapshot, "player-1"),
        false,
    );

    assert.equal(prediction.initialized, false);
});

test("position correction fades out over 100 milliseconds", () => {
    const prediction = createPrediction({
        width: 1600,
        height: 900,
        smoothingMs: 100,
    });

    prediction.reconcile(createSnapshot(), "player-1", 1000);
    prediction.predict(createInput(1));

    const before = prediction.getRenderState(1000);

    prediction.reconcile(
        createSnapshot({
            tick: 2,
            seq: 1,
            x: 400,
            y: 300,
        }),
        "player-1",
        1010,
    );

    const immediatelyAfter = prediction.getRenderState(1010);
    const afterHalfTime = prediction.getRenderState(1060);
    const afterFullTime = prediction.getRenderState(1110);

    assert.ok(
        Math.abs(immediatelyAfter.pos.x - before.pos.x) < 0.001,
    );

    assert.ok(
        afterHalfTime.correctionMagnitude <
            immediatelyAfter.correctionMagnitude,
    );

    assert.equal(afterFullTime.correctionMagnitude, 0);
});

test("reconciliation rejects stale snapshots", () => {
    const prediction = createPredictionInstance();

    prediction.reconcile(
        createSnapshot({ tick: 5, x: 500 }),
        "player-1",
        1000,
    );

    const result = prediction.reconcile(
        createSnapshot({ tick: 4, x: 400 }),
        "player-1",
        1010,
    );

    assert.equal(result, false);
    assert.equal(prediction.getRenderState(1010).pos.x, 500);
});

test("reconciliation rejects decreasing acknowledgements", () => {
    const prediction = createPredictionInstance();

    prediction.predict(createInput(1));
    prediction.predict(createInput(2));

    prediction.reconcile(
        createSnapshot({ tick: 1, seq: 1 }),
        "player-1",
        1000,
    );

    const result = prediction.reconcile(
        createSnapshot({ tick: 2, seq: 0, x: 300 }),
        "player-1",
        1010,
    );

    assert.equal(result, false);
    assert.equal(prediction.pendingCount, 1);
});

test("reconciliation rejects acknowledgements beyond sent inputs", () => {
    const prediction = createPredictionInstance();

    prediction.reconcile(
        createSnapshot({ tick: 1 }),
        "player-1",
        1000,
    );

    const result = prediction.reconcile(
        createSnapshot({ tick: 2, seq: 1 }),
        "player-1",
        1010,
    );

    assert.equal(result, false);
    assert.equal(prediction.pendingCount, 0);
});


test("prediction rejects duplicate input sequences", () => {
    const prediction = createPredictionInstance();

    assert.equal(prediction.predict(createInput(1)), true);
    assert.equal(prediction.predict(createInput(1)), false);

    assert.equal(prediction.pendingCount, 1);
});

test("prediction rejects outdated input sequences", () => {
    const prediction = createPredictionInstance();

    assert.equal(prediction.predict(createInput(2)), true);
    assert.equal(prediction.predict(createInput(1)), false);

    assert.equal(prediction.pendingCount, 1);
});
