import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createPredictor } from "../src/network/predictor.js";

const DT = 1 / 60;

function input(overrides = {}) {
    return {
        thrust: false,
        turnLeft: false,
        turnRight: false,
        fire: false,
        switchWeapon: false,
        ...overrides,
    };
}

describe("predictor", () => {
    test("has no state until first reconciliation", () => {
        const p = createPredictor();
        assert.equal(p.hasState(), false);
        assert.equal(p.getRenderState(), null);
    });

    test("first reconciliation seeds predicted state with zero correction", () => {
        const p = createPredictor();
        const mag = p.reconcile({ x: 100, y: 200, angle: 0 }, -1);

        assert.equal(p.hasState(), true);
        assert.equal(mag, 0);

        const render = p.getRenderState();
        assert.equal(render.pos.x, 100);
        assert.equal(render.pos.y, 200);
    });

    test("predict advances the local ship forward with thrust", () => {
        const p = createPredictor();
        p.reconcile({ x: 0, y: 0, angle: 0 }, -1);

        // Thrust along angle 0 (+x) for one step.
        p.predict(input({ thrust: true }));

        const render = p.getRenderState();
        assert.ok(render.pos.x > 0, "ship should move forward (+x)");
        assert.equal(render.pos.y, 0);
    });

    test("reconciliation snaps back to server state and replays pending inputs", () => {
        const p = createPredictor();
        p.reconcile({ x: 0, y: 0, angle: 0 }, -1);
        // Establish visual state (as a render frame would).
        p.getRenderState();

        // Two pending inputs, neither yet acknowledged.
        p.pushPending(0, input({ thrust: true }));
        p.pushPending(1, input({ thrust: true }));

        // Simulate the client having predicted forward.
        p.predict(input({ thrust: true }));
        p.predict(input({ thrust: true }));
        // Commit the predicted state to visual (as a render frame would).
        p.getRenderState();

        // Server says: still at origin, and has processed up to seq 0.
        // Replay only seq 1 (thrust once).
        const mag = p.reconcile({ x: 0, y: 0, angle: 0 }, 0);

        // Correction magnitude is the distance from where the client was
        // (predicted forward twice) back to the replayed position (forward once).
        assert.ok(
            mag > 0,
            "correction should be non-zero when client was ahead",
        );

        // After replay, predicted is one step of thrust from origin.
        const render = p.getRenderState();
        assert.ok(
            render.pos.x > 0,
            "one pending input should still move the ship",
        );
    });

    test("ack drops acknowledged pending inputs", () => {
        const p = createPredictor();
        p.reconcile({ x: 0, y: 0, angle: 0 }, -1);

        p.pushPending(0, input());
        p.pushPending(1, input());
        p.pushPending(2, input());
        assert.equal(p.getPendingCount(), 3);

        p.ack(1);
        assert.equal(p.getPendingCount(), 1, "seq 0 and 1 should be dropped");
    });

    test("correction decays to zero over ~100 ms", () => {
        let now = 1000;
        const p = createPredictor({ getNow: () => now });
        p.reconcile({ x: 0, y: 0, angle: 0 }, -1);
        // Establish visual state at the origin (as a render frame would).
        p.getRenderState();

        // Reconcile to a distant server position: creates a visible error.
        p.reconcile({ x: 50, y: 0, angle: 0 }, -1);
        const startRender = p.getRenderState();
        // Immediately after reconcile, the render state still lags (error applied).
        const initialError = startRender.pos.x;

        // Advance past the smoothing window.
        now += 100;
        const endRender = p.getRenderState();
        // After 100 ms the error is fully decayed: render == predicted == 50.
        assert.ok(
            Math.abs(endRender.pos.x - 50) < 1e-9,
            "error should fully decay to 0",
        );
        // Sanity: the initial render was NOT already at 50 (it lagged).
        assert.ok(
            Math.abs(initialError - 50) > 1e-9,
            "error should be visible right after reconcile",
        );
    });

    test("reset clears all state", () => {
        const p = createPredictor();
        p.reconcile({ x: 10, y: 10, angle: 0 }, -1);
        p.pushPending(0, input());
        p.reset();

        assert.equal(p.hasState(), false);
        assert.equal(p.getPendingCount(), 0);
        assert.equal(p.getRenderState(), null);
    });

    test("prediction uses the same integration constants as the server", () => {
        // Two thrust steps from rest at angle 0 should match a hand-computed
        // integrate() result, proving client/server agreement.
        const p = createPredictor();
        p.reconcile({ x: 0, y: 0, angle: 0 }, -1);

        p.predict(input({ thrust: true }));
        p.predict(input({ thrust: true }));

        // Mirror integrate(): drag 0.98, accel 200, maxSpeed 300.
        let vx = 0;
        vx = vx + 200 * DT;
        vx = vx * 0.98;
        const x1 = vx * DT;
        vx = vx + 200 * DT;
        vx = vx * 0.98;
        const x2 = x1 + vx * DT;

        const render = p.getRenderState();
        assert.ok(
            Math.abs(render.pos.x - x2) < 1e-6,
            "prediction must match integrate()",
        );
    });

    // --- M2 reconciliation correctness: per-input SERVER_DT replay ---
    //
    // Reconciliation replays each still-pending input (seq > lastProcessedSeq)
    // as its own SERVER_DT = 1/30 step. This matches the server exactly when
    // inputs arrive one-per-tick. Exact parity when multiple inputs were
    // consumed in one server tick is not possible with the current protocol
    // (snapshot lacks per-tick batch boundaries); per-input replay is the
    // defensible approximation.

    // Mirror integrate() (shared/sim/integrate.js) for a single thrust=true
    // step from rest (angle 0). Returns the new velocity after the step; the
    // position advance of a step is (previousVelX + newVelX) is NOT how
    // integrate works — it uses the NEW velocity for the position:
    //   pos.x = prevPos.x + vel.x * dt   (vel is post-drag velocity)
    // So we track (vx, x) and advance x by vx_after * dt.
    function thrustStep(state, dt) {
        // vel = vel + accel*dt ; vel *= drag ; clamp ; pos += vel*dt
        let vx = state.vx + 200 * dt;
        vx = vx * 0.98;
        const x = state.x + vx * dt;
        return { vx, x };
    }

    function simulateThrustSteps(count) {
        let state = { vx: 0, x: 0 };
        const dt = 1 / 30;
        for (let i = 0; i < count; i += 1) {
            state = thrustStep(state, dt);
        }
        return state.x;
    }

    test("six pending inputs produce six SERVER_DT integration steps", () => {
        // Six pending inputs, all thrust. Reconciliation must advance through
        // six SERVER_DT = 1/30 steps (one per pending input), not one step.
        const p = createPredictor();
        p.reconcile({ x: 0, y: 0, angle: 0 }, -1);
        for (let i = 0; i < 6; i += 1) {
            p.pushPending(i, input({ thrust: true }));
        }
        p.reconcile({ x: 0, y: 0, angle: 0 }, -1);

        const expectedX = simulateThrustSteps(6);

        const render = p.getRenderState();
        assert.ok(
            Math.abs(render.pos.x - expectedX) < 1e-6,
            `expected six 1/30 steps (x≈${expectedX}), got ${render.pos.x}`,
        );
    });

    test("replaying N pending inputs advances through N steps", () => {
        // A single pending input advances exactly one 1/30 step; three pending
        // inputs advance exactly three 1/30 steps. The result must scale with
        // N (each input is its own step).
        function replayX(count) {
            const p = createPredictor();
            p.reconcile({ x: 0, y: 0, angle: 0 }, -1);
            for (let i = 0; i < count; i += 1) {
                p.pushPending(i, input({ thrust: true }));
            }
            p.reconcile({ x: 0, y: 0, angle: 0 }, -1);
            return p.getRenderState().pos.x;
        }

        const one = simulateThrustSteps(1);
        const three = simulateThrustSteps(3);

        assert.ok(
            Math.abs(replayX(1) - one) < 1e-6,
            "one pending input must advance one 1/30 step",
        );
        assert.ok(
            Math.abs(replayX(3) - three) < 1e-6,
            "three pending inputs must advance three 1/30 steps",
        );
        assert.ok(
            Math.abs(replayX(1) - replayX(3)) > 1e-6,
            "result must scale with pending-input count (per-input replay)",
        );
    });

    test("sequence ACK filtering still skips acknowledged inputs", () => {
        // seq 0,1,2 pending; lastProcessedSeq=1 means seq 0 and 1 are acked.
        // Only seq 2 (thrust=true) is replayed; seq 0,1 (thrust=false) must not
        // contribute extra steps.
        const p = createPredictor();
        p.reconcile({ x: 0, y: 0, angle: 0 }, -1);
        p.pushPending(0, input({ thrust: true }));
        p.pushPending(1, input({ thrust: true }));
        p.pushPending(2, input({ thrust: false }));

        p.reconcile({ x: 0, y: 0, angle: 0 }, 1);

        // Only seq 2 replayed, and it is thrust=false -> no movement.
        const render = p.getRenderState();
        assert.ok(
            Math.abs(render.pos.x) < 1e-9,
            "acked thrust inputs must be skipped; seq 2 has no thrust",
        );
    });

    test("local 60 Hz prediction is unchanged by reconciliation fix", () => {
        // predict() still uses PREDICT_DT = 1/60 (two steps match hand-computed
        // 1/60 integrate()). Reconciliation changes must not affect prediction.
        const p = createPredictor();
        p.reconcile({ x: 0, y: 0, angle: 0 }, -1);

        p.predict(input({ thrust: true }));
        p.predict(input({ thrust: true }));

        const dt = 1 / 60;
        let vx = 0;
        vx = vx + 200 * dt;
        vx = vx * 0.98;
        const x1 = vx * dt;
        vx = vx + 200 * dt;
        vx = vx * 0.98;
        const x2 = x1 + vx * dt;

        const render = p.getRenderState();
        assert.ok(
            Math.abs(render.pos.x - x2) < 1e-6,
            "60 Hz prediction must be unchanged (two 1/60 steps)",
        );
    });

    test("existing smoothing behavior remains intact after reconciliation", () => {
        // A reconciliation that produces a correction must still decay the
        // error over ~100 ms via getRenderState().
        let now = 1000;
        const p = createPredictor({ getNow: () => now });
        p.reconcile({ x: 0, y: 0, angle: 0 }, -1);
        p.getRenderState();

        // Reconcile to a distant server position with no pending inputs.
        p.reconcile({ x: 50, y: 0, angle: 0 }, -1);
        const start = p.getRenderState();
        assert.ok(
            Math.abs(start.pos.x - 50) > 1e-9,
            "render must lag right after reconcile (error applied)",
        );

        now += 100;
        const end = p.getRenderState();
        assert.ok(
            Math.abs(end.pos.x - 50) < 1e-9,
            "error must fully decay to 0 after 100 ms",
        );
    });
});
