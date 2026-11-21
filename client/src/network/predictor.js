import { integrate } from "@dogfight/shared";

/**
 * M2 client-side prediction and reconciliation for the local ship.
 *
 * The client predicts its own ship with the shared `integrate` (identical math
 * to the server's Ship.update) so the local ship feels instant. Every
 * transmitted input is kept in a pending-input buffer keyed by its sequence
 * number. When a snapshot arrives it carries `lastProcessedSeq` for this
 * player: the predicted state is snapped to the server's authoritative state
 * and each still-pending input (seq > lastProcessedSeq) is replayed as its own
 * SERVER_DT = 1/30 step to catch up to the present. The visual position is
 * then smoothed toward the reconciled position over ~100 ms so corrections are
 * not jarring.
 *
 * This module is pure (no DOM/WebSocket) so it can be unit tested directly.
 */

// Local prediction runs at the client's 60 Hz render/sim cadence for smooth
// movement. This is intentionally finer than the server tick rate.
const PREDICT_DT = 1 / 60;
// Reconciliation must use the server's integration timestep so replay matches
// the server's World.step(dt = 1/TICK_RATE = 1/30). Using a different dt here
// would make the reconciled position systematically disagree with the server.
const SERVER_DT = 1 / 30;
const SMOOTH_DURATION_MS = 100;

/**
 * @param {{ getNow?: () => number }} [options]
 */
export function createPredictor({ getNow = () => performance.now() } = {}) {
    // Predicted (authoritative-from-perspective-of-client) ship state.
    let predicted = null;
    // Visual ship state actually rendered; lags `predicted` by a smoothed error.
    let visual = null;
    // Smoothed error offset (predicted - visual) that decays to zero.
    let errorOffset = { x: 0, y: 0, angle: 0 };
    let errorStartTime = 0;
    let errorStartOffset = { x: 0, y: 0, angle: 0 };
    let smoothing = false;

    // Pending inputs: array of { seq, input } in transmission order.
    const pending = [];

    function reset() {
        predicted = null;
        visual = null;
        errorOffset = { x: 0, y: 0, angle: 0 };
        errorStartOffset = { x: 0, y: 0, angle: 0 };
        smoothing = false;
        pending.length = 0;
    }

    function hasState() {
        return predicted !== null;
    }

    /**
     * Advance prediction by one simulation step using the current input.
     * Called every 60 Hz simulation step for smooth local motion.
     */
    function predict(input) {
        if (!predicted) return;
        predicted = integrate(predicted, input, PREDICT_DT);
    }

    /**
     * Record a transmitted input for later replay. Called once per accepted
     * transmission (30 Hz), carrying the sequence number assigned by the
     * input sender.
     */
    function pushPending(seq, input) {
        pending.push({ seq, input: { ...input } });
    }

    /**
     * Drop acknowledged inputs (seq <= lastProcessedSeq) from the buffer.
     */
    function ack(lastProcessedSeq) {
        if (!Number.isInteger(lastProcessedSeq)) return;
        while (pending.length > 0 && pending[0].seq <= lastProcessedSeq) {
            pending.shift();
        }
    }

    /**
     * Reconcile against an authoritative snapshot.
     *
     * Server input-consumption semantics (server/src/match.js getInputsForStep):
     * each server tick combines whatever inputs arrived that tick (continuous
     * controls take the latest value, one-shot controls are OR-ed) and
     * integrates once at the server timestep. Across multiple ticks the server
     * performs one such integration step per tick.
     *
     * The client mirrors this by replaying each still-pending input (seq >
     * lastProcessedSeq) as its own SERVER_DT = 1/30 step, matching the server's
     * per-tick step count when inputs arrived one-per-tick.
     *
     * Limitation: the snapshot carries only `lastProcessedSeq` (the final seq
     * consumed) and `tick`, not the per-tick batch boundaries. When several
     * pending inputs were actually consumed within a single server tick, the
     * server combined them into one step while the client replays them as
     * separate steps. Exact parity in that case is not possible with the
     * current protocol; the per-input replay is the closest defensible
     * approximation and matches the server exactly in the one-input-per-tick
     * case.
     *
     * @param {{x:number,y:number,angle:number}} serverShip server position/angle
     * @param {number} lastProcessedSeq highest input seq the server has consumed
     */
    function reconcile(serverShip, lastProcessedSeq) {
        if (!serverShip) return;

        // Snap predicted state to the server's authoritative state.
        predicted = {
            pos: { x: serverShip.x, y: serverShip.y },
            vel: { x: 0, y: 0 },
            angle: serverShip.angle || 0,
        };

        // Replay each still-pending input (seq > lastProcessedSeq) as its own
        // SERVER_DT step. The snapshot does not expose server tick batch
        // boundaries, so per-input replay is used: it matches the server
        // exactly when inputs arrive one-per-tick and is a defensible
        // approximation otherwise.
        for (const entry of pending) {
            if (entry.seq > lastProcessedSeq) {
                predicted = integrate(predicted, entry.input, SERVER_DT);
            }
        }

        // The correction is the gap between the old predicted position (which
        // the player has been watching) and the new reconciled position.
        const correction = visual
            ? {
                  x: predicted.pos.x - visual.pos.x,
                  y: predicted.pos.y - visual.pos.y,
                  angle: predicted.angle - visual.angle,
              }
            : { x: 0, y: 0, angle: 0 };

        const correctionMagnitude = Math.hypot(correction.x, correction.y);

        // Start a smooth decay of the error offset over SMOOTH_DURATION_MS.
        errorOffset = correction;
        errorStartOffset = { ...correction };
        errorStartTime = getNow();
        smoothing = true;

        return correctionMagnitude;
    }

    /**
     * Compute the current visual ship state (predicted + decaying error) and
     * advance the smoothing. Called once per render frame with the current
     * time; returns the state to draw for the local ship.
     */
    function getRenderState() {
        if (!predicted) return null;

        if (smoothing) {
            const elapsed = getNow() - errorStartTime;
            const t = Math.min(1, elapsed / SMOOTH_DURATION_MS);
            const remaining = 1 - t;
            errorOffset = {
                x: errorStartOffset.x * remaining,
                y: errorStartOffset.y * remaining,
                angle: errorStartOffset.angle * remaining,
            };
            if (t >= 1) {
                smoothing = false;
                errorOffset = { x: 0, y: 0, angle: 0 };
            }
        }

        visual = {
            pos: {
                x: predicted.pos.x - errorOffset.x,
                y: predicted.pos.y - errorOffset.y,
            },
            vel: { ...predicted.vel },
            angle: predicted.angle - errorOffset.angle,
        };
        return visual;
    }

    function getPendingCount() {
        return pending.length;
    }

    function getPredicted() {
        return predicted;
    }

    return {
        reset,
        hasState,
        predict,
        pushPending,
        ack,
        reconcile,
        getRenderState,
        getPendingCount,
        getPredicted,
    };
}
