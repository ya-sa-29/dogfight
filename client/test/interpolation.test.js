
import test from "node:test";
import assert from "node:assert/strict";
import { createInterpolationBuffer } from "../src/network/interpolation.js";

function createEntity({
    id = 1,
    kind = "ship",
    x = 100,
    y = 100,
    vx = 0,
    vy = 0,
    angle = 0,
} = {}) {
    return {
        id,
        kind,
        pos: { x, y },
        vel: { x: vx, y: vy },
        angle,
    };
}

function createSnapshot(tick, entities = [createEntity()]) {
    return {
        tick,
        entities,
    };
}

function createBuffer(options = {}) {
    return createInterpolationBuffer({
        width: 1600,
        height: 900,
        step: 1 / 30,
        delayMs: 100,
        ...options,
    });
}

test("interpolation buffer accepts valid snapshots", () => {
    const buffer = createBuffer();

    assert.equal(buffer.push(createSnapshot(1), 1000), true);
    assert.equal(buffer.push(createSnapshot(2), 1033), true);

    assert.equal(buffer.size, 2);
});

test("interpolation buffer rejects stale snapshots", () => {
    const buffer = createBuffer();

    buffer.push(createSnapshot(2), 1000);

    assert.equal(buffer.push(createSnapshot(1), 1010), false);
    assert.equal(buffer.push(createSnapshot(2), 1020), false);

    assert.equal(buffer.size, 1);
});

test("interpolation buffer rejects invalid snapshots", () => {
    const buffer = createBuffer();

    assert.equal(buffer.push(null, 1000), false);
    assert.equal(buffer.push({ tick: -1, entities: [] }, 1000), false);
    assert.equal(buffer.push({ tick: 1, entities: null }, 1000), false);

    assert.equal(buffer.size, 0);
});

test("interpolation buffer rejects duplicate entity IDs", () => {
    const buffer = createBuffer();

    const snapshot = createSnapshot(1, [
        createEntity({ id: 1 }),
        createEntity({ id: 1, x: 200 }),
    ]);

    assert.equal(buffer.push(snapshot, 1000), false);
    assert.equal(buffer.size, 0);
});

test("interpolation calculates positions between snapshots", () => {
    const buffer = createBuffer({
        delayMs: 16.6666665,
    });

    buffer.push(
        createSnapshot(1, [createEntity({ x: 100 })]),
        1000,
    );

    buffer.push(
        createSnapshot(2, [createEntity({ x: 200 })]),
        1033.333333,
    );

    const entities = buffer.sample(1033.333333);

    assert.equal(entities.length, 1);
    assert.ok(Math.abs(entities[0].pos.x - 150) < 0.001);
});

test("interpolation respects configured delay", () => {
    const buffer = createBuffer({
        delayMs: 16.6666665,
    });

    buffer.push(
        createSnapshot(1, [createEntity({ x: 100 })]),
        1000,
    );

    buffer.push(
        createSnapshot(2, [createEntity({ x: 200 })]),
        1033.333333,
    );

    const entities = buffer.sample(1033.333333);

    assert.ok(Math.abs(entities[0].pos.x - 150) < 0.001);
});

test("interpolation handles arena wrapping", () => {
    const buffer = createBuffer({
        delayMs: 16.6666665,
    });

    buffer.push(
        createSnapshot(1, [
            createEntity({ x: 1590 }),
        ]),
        1000,
    );

    buffer.push(
        createSnapshot(2, [
            createEntity({ x: 10 }),
        ]),
        1033.333333,
    );

    const entities = buffer.sample(1033.333333);

    assert.ok(
        Math.abs(entities[0].pos.x - 1600) < 0.001 ||
        Math.abs(entities[0].pos.x) < 0.001,
    );
});

test("interpolation uses the shortest angular path", () => {
    const buffer = createBuffer({
        delayMs: 16.6666665,
    });

    buffer.push(
        createSnapshot(1, [
            createEntity({ angle: Math.PI - 0.1 }),
        ]),
        1000,
    );

    buffer.push(
        createSnapshot(2, [
            createEntity({ angle: -Math.PI + 0.1 }),
        ]),
        1033.333333,
    );

    const entities = buffer.sample(1033.333333);

    assert.ok(
        Math.abs(Math.abs(entities[0].angle) - Math.PI) < 0.001,
    );
});

test("new entities appear when their snapshot becomes current", () => {
    const buffer = createBuffer({
        delayMs: 50,
    });

    buffer.push(
        createSnapshot(1, [
            createEntity({ id: 1 }),
        ]),
        1000,
    );

    buffer.push(
        createSnapshot(2, [
            createEntity({ id: 1 }),
            createEntity({ id: 2, kind: "bullet" }),
        ]),
        1033.333333,
    );

    const beforeAppearance = buffer.sample(1033.333333);

    assert.equal(beforeAppearance.length, 1);

    const afterAppearance = buffer.sample(1083.333333);

    assert.equal(afterAppearance.length, 2);
    assert.ok(afterAppearance.some((entity) => entity.id === 2));
});

test("removed entities remain visible until their removal time", () => {
    const buffer = createBuffer({
        delayMs: 50,
    });

    buffer.push(
        createSnapshot(1, [
            createEntity({ id: 1 }),
            createEntity({ id: 2, kind: "bullet" }),
        ]),
        1000,
    );

    buffer.push(
        createSnapshot(2, [
            createEntity({ id: 1 }),
        ]),
        1033.333333,
    );

    const beforeRemoval = buffer.sample(1033.333333);

    assert.equal(beforeRemoval.length, 2);

    const afterRemoval = buffer.sample(1083.333333);

    assert.equal(afterRemoval.length, 1);
    assert.ok(afterRemoval.every((entity) => entity.id !== 2));
});

test("interpolation buffer limits its snapshot history", () => {
    const buffer = createBuffer({
        maxSnapshots: 3,
    });

    for (let tick = 1; tick <= 5; tick++) {
        buffer.push(createSnapshot(tick), tick * 33.333);
    }

    assert.equal(buffer.size, 3);
});

test("interpolation delay can be adjusted", () => {
    const buffer = createBuffer();

    assert.equal(buffer.delayMs, 100);

    buffer.setDelayMs(150);

    assert.equal(buffer.delayMs, 150);
});

test("interpolation rejects invalid delay values", () => {
    const buffer = createBuffer();

    assert.throws(() => buffer.setDelayMs(-1), RangeError);
    assert.throws(() => buffer.setDelayMs(NaN), RangeError);
});

test("interpolation rejects invalid arena dimensions", () => {
    assert.throws(
        () => createInterpolationBuffer({
            width: 0,
            height: 900,
        }),
        RangeError,
    );
});

test("interpolation never moves backwards when snapshots arrive late", () => {
    const buffer = createBuffer({
        delayMs: 100,
    });

    buffer.push(
        createSnapshot(1, [createEntity({ x: 100 })]),
        1000,
    );

    buffer.push(
        createSnapshot(2, [createEntity({ x: 200 })]),
        1033.333333,
    );

    const beforeLateSnapshot = buffer.sample(1200);

    assert.equal(beforeLateSnapshot[0].pos.x, 200);

    buffer.push(
        createSnapshot(3, [createEntity({ x: 300 })]),
        1200,
    );

    const afterLateSnapshot = buffer.sample(1200);

    assert.ok(
        afterLateSnapshot[0].pos.x >= beforeLateSnapshot[0].pos.x,
    );
});
