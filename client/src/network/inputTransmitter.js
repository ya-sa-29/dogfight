/**
 * Gates client input transmission to a fixed fraction of the simulation rate.
 *
 * The simulation runs at 60 Hz; `step()` is called once per simulation step and
 * transmits every `SEND_INTERVAL_STEPS` steps (30 Hz at the default of 2). The
 * cadence is therefore tied to simulation steps, never to rendering FPS.
 *
 * Continuous controls are read from the input passed to `step()`, so they always
 * carry the latest state. One-shot actions (`fire`, `switchWeapon`) are latched
 * on every step and only cleared once the connection has actually accepted the
 * message. A failed handoff therefore preserves them for the next attempt, and
 * short presses between transmission steps are never lost.
 *
 * `send` must return true when the message was accepted for delivery.
 */
export const SEND_INTERVAL_STEPS = 2;

export function createInputTransmitter({
    canSend,
    send,
    sendIntervalSteps = SEND_INTERVAL_STEPS,
}) {
    let simulationStep = 0;
    let fireLatch = false;
    let switchWeaponLatch = false;

    function reset() {
        simulationStep = 0;
        fireLatch = false;
        switchWeaponLatch = false;
    }

    function step(input) {
        // Latch one-shot actions on every simulation step, not only on
        // transmission steps, so short presses are never dropped.
        if (input.fire) {
            fireLatch = true;
        }

        if (input.switchWeapon) {
            switchWeaponLatch = true;
        }

        simulationStep += 1;

        if (simulationStep % sendIntervalSteps !== 0) {
            return false;
        }

        // Snapshot gate: never transmit (and never consume a sequence number)
        // before the first authoritative snapshot.
        if (!canSend()) {
            return false;
        }

        const accepted = send({
            thrust: input.thrust,
            turnLeft: input.turnLeft,
            turnRight: input.turnRight,
            fire: fireLatch,
            switchWeapon: switchWeaponLatch,
        });

        // Clear latches only after a successful handoff. A rejected send keeps
        // them set so the actions are retried on the next transmission step.
        if (accepted) {
            fireLatch = false;
            switchWeaponLatch = false;
        }

        return Boolean(accepted);
    }

    return {
        reset,
        step,
        getSimulationStep: () => simulationStep,
    };
}