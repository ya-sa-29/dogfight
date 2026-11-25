import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
    createInputTransmitter,
    SEND_INTERVAL_STEPS,
} from "../src/network/inputTransmitter.js";

function createHarness({ canSend = () => true, send } = {}) {
    const sent = [];

    const transmitter = createInputTransmitter({
        canSend,
        send: (input) => {
            sent.push(input);
            return send ? send(input) : true;
        },
    });

    return { transmitter, sent };
}

function idleInput(overrides = {}) {
    return {
        thrust: false,
        turnLeft: false,
        turnRight: false,
        fire: false,
        switchWeapon: false,
        ...overrides,
    };
}

describe("inputTransmitter", () => {
    test("SEND_INTERVAL_STEPS is 2 (60 Hz sim -> 30 Hz transmission)", () => {
        assert.equal(SEND_INTERVAL_STEPS, 2);
    });

    test("60 simulation steps produce exactly 30 transmissions", () => {
        const { transmitter, sent } = createHarness();

        for (let step = 0; step < 60; step += 1) {
            transmitter.step(idleInput());
        }

        assert.equal(sent.length, 30);
    });

    test("transmission count depends on simulation steps, not render frames", () => {
        // Simulate rendering at 144 FPS while the simulation advances at 60 Hz.
        // Rendering does not call step(), so the cadence must be unaffected.
        const { transmitter, sent } = createHarness();

        for (let frame = 0; frame < 144; frame += 1) {
            // ~0.4167 simulation steps per 144 Hz frame; accumulate 60 steps
            // over 144 frames worth of rendered frames.
            if (frame % 12 < 5) {
                transmitter.step(idleInput());
            }
        }

        // 144/12 = 12 groups, 5 steps each = 60 steps -> 30 transmissions.
        assert.equal(sent.length, 30);
    });

    test("latest continuous input state is transmitted", () => {
        const { transmitter, sent } = createHarness();

        transmitter.step(idleInput({ thrust: false }));
        transmitter.step(idleInput({ thrust: true, turnLeft: true }));

        assert.equal(sent.length, 1);
        assert.deepEqual(sent[0], idleInput({ thrust: true, turnLeft: true }));
    });

    test("fire survives a transmission gap", () => {
        const { transmitter, sent } = createHarness();

        // Step 1 latches fire but does not transmit.
        transmitter.step(idleInput({ fire: true }));
        assert.equal(sent.length, 0);

        // Step 2 transmits the latched fire even though fire was released.
        transmitter.step(idleInput({ fire: false }));

        assert.equal(sent.length, 1);
        assert.equal(sent[0].fire, true);
    });

    test("switchWeapon survives a transmission gap", () => {
        const { transmitter, sent } = createHarness();

        transmitter.step(idleInput({ switchWeapon: true }));
        assert.equal(sent.length, 0);

        transmitter.step(idleInput({ switchWeapon: false }));

        assert.equal(sent.length, 1);
        assert.equal(sent[0].switchWeapon, true);
    });

    test("multiple one-shot events before transmission are coalesced", () => {
        const { transmitter, sent } = createHarness();

        // Two presses on consecutive non-transmitting steps collapse into a
        // single boolean on the wire, matching the protocol semantics.
        transmitter.step(idleInput({ switchWeapon: true }));
        transmitter.step(idleInput({ switchWeapon: true }));

        assert.equal(sent.length, 1);
        assert.equal(sent[0].switchWeapon, true);
    });

    test("failed send preserves latches for the next attempt", () => {
        const { transmitter, sent } = createHarness({ send: () => false });

        transmitter.step(idleInput({ fire: true, switchWeapon: true }));
        transmitter.step(idleInput()); // transmission step, but send fails

        assert.equal(sent.length, 1);
        assert.equal(sent[0].fire, true);
        assert.equal(sent[0].switchWeapon, true);

        // Next transmission step retries and now succeeds.
        const retry = createHarness();
        retry.transmitter.step(idleInput({ fire: true }));
        retry.transmitter.step(idleInput());
        assert.equal(retry.sent[0].fire, true);
    });

    test("successful send clears only accepted actions", () => {
        const { transmitter, sent } = createHarness();

        // Step 1 latches fire; step 2 transmits it successfully.
        transmitter.step(idleInput({ fire: true }));
        transmitter.step(idleInput());

        assert.equal(sent.length, 1);
        assert.equal(sent[0].fire, true);

        // Steps 3-4 transmit again with no new press: the cleared latch must
        // not re-send the previous fire.
        transmitter.step(idleInput());
        transmitter.step(idleInput());

        assert.equal(sent.length, 2);
        assert.equal(sent[1].fire, false);
    });

    test("a failed send keeps the latch so the retry re-sends it", () => {
        let accept = false;
        const { transmitter, sent } = createHarness({ send: () => accept });

        transmitter.step(idleInput({ switchWeapon: true }));
        transmitter.step(idleInput()); // send fails

        assert.equal(sent.length, 1);
        assert.equal(sent[0].switchWeapon, true);

        accept = true;
        transmitter.step(idleInput()); // step 3, no transmit
        transmitter.step(idleInput()); // step 4, retry succeeds

        assert.equal(sent.length, 2);
        assert.equal(sent[1].switchWeapon, true, "retry re-sends the latched action");
    });

    test("snapshot gate consumes no sequence number and does not transmit", () => {
        const { transmitter, sent } = createHarness({ canSend: () => false });

        for (let step = 0; step < 10; step += 1) {
            transmitter.step(idleInput({ fire: true }));
        }

        assert.equal(sent.length, 0);
    });

    test("snapshot gate preserves latches until the gate opens", () => {
        let open = false;
        const { transmitter, sent } = createHarness({ canSend: () => open });

        transmitter.step(idleInput({ fire: true }));
        transmitter.step(idleInput()); // gated, no transmit

        assert.equal(sent.length, 0);

        open = true;
        transmitter.step(idleInput()); // step 3, no transmit
        transmitter.step(idleInput()); // step 4, transmits latched fire

        assert.equal(sent.length, 1);
        assert.equal(sent[0].fire, true);
    });

    test("reset clears cadence and latches from a previous session", () => {
        const { transmitter, sent } = createHarness();

        transmitter.step(idleInput({ fire: true }));
        transmitter.step(idleInput()); // transmitted fire

        assert.equal(sent.length, 1);
        assert.equal(sent[0].fire, true);

        transmitter.reset();

        // After reset the cadence restarts: step 1 must not transmit and must
        // not carry the previous session's latched fire.
        transmitter.step(idleInput());

        assert.equal(sent.length, 1);
    });

    test("reset clears a pending latch so it is not sent in the new session", () => {
        const { transmitter, sent } = createHarness();

        transmitter.step(idleInput({ fire: true })); // latched, not transmitted
        transmitter.reset();
        transmitter.step(idleInput());
        transmitter.step(idleInput()); // first transmission after reset

        assert.equal(sent.length, 1);
        assert.equal(sent[0].fire, false);
    });
});