import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createInputSender } from "../src/network/inputSender.js";

function createHarness({ tick = 0, playerId = "player-1", accept = true } = {}) {
    const sent = [];

    const connection = {
        send(message) {
            sent.push(message);
            return accept;
        },
    };

    const sender = createInputSender({
        getConnection: () => connection,
        getPlayerId: () => playerId,
        getSnapshotTick: () => tick,
    });

    return { sender, sent };
}

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

describe("inputSender", () => {
    test("successful handoff increments the sequence and tracks pending input", () => {
        const { sender, sent } = createHarness();

        assert.equal(sender.send(input()), true);

        assert.equal(sent.length, 1);
        assert.equal(sent[0].seq, 0);
        assert.equal(sender.getInputSeq(), 1);
        assert.equal(sender.getPendingCount(), 1);
    });

    test("sequence numbers advance monotonically across sends", () => {
        const { sender, sent } = createHarness();

        sender.send(input());
        sender.send(input());
        sender.send(input());

        assert.deepEqual(
            sent.map((message) => message.seq),
            [0, 1, 2],
        );
        assert.equal(sender.getPendingCount(), 3);
    });

    test("snapshot gate blocks transmission and consumes no sequence number", () => {
        const { sender, sent } = createHarness({ tick: -1 });

        assert.equal(sender.send(input()), false);
        assert.equal(sent.length, 0);
        assert.equal(sender.getInputSeq(), 0);
        assert.equal(sender.getPendingCount(), 0);

        // Once a valid snapshot tick exists, the same sequence number is used.
        const ready = createHarness({ tick: 7 });
        assert.equal(ready.sender.send(input()), true);
        assert.equal(ready.sent[0].seq, 0);
        assert.equal(ready.sent[0].tick, 7);
    });

    test("failed handoff does not consume a sequence number", () => {
        const { sender, sent } = createHarness({ accept: false });

        assert.equal(sender.send(input()), false);
        assert.equal(sent.length, 1, "the message was offered to the connection");
        assert.equal(sender.getInputSeq(), 0);
        assert.equal(sender.getPendingCount(), 0);
    });

    test("the sequence number is reused after a failed handoff", () => {
        let accept = false;
        const sent = [];

        const connection = {
            send(message) {
                sent.push(message);
                return accept;
            },
        };

        const sender = createInputSender({
            getConnection: () => connection,
            getPlayerId: () => "player-1",
            getSnapshotTick: () => 0,
        });

        assert.equal(sender.send(input()), false);
        assert.equal(sent[0].seq, 0);

        accept = true;
        assert.equal(sender.send(input()), true);
        assert.equal(sent[1].seq, 0, "failed attempt must not consume seq 0");
        assert.equal(sender.getInputSeq(), 1);
    });

    test("ack removes acknowledged inputs from the pending set", () => {
        const { sender } = createHarness();

        sender.send(input());
        sender.send(input());
        sender.send(input());
        assert.equal(sender.getPendingCount(), 3);

        sender.ack(1);

        assert.equal(sender.getLastAckedSeq(), 1);
        assert.equal(sender.getPendingCount(), 1);
    });

    test("ack is monotonic and ignores stale acknowledgements", () => {
        const { sender } = createHarness();

        sender.send(input());
        sender.send(input());

        sender.ack(1);
        sender.ack(0); // stale

        assert.equal(sender.getLastAckedSeq(), 1);
        assert.equal(sender.getPendingCount(), 0);
    });

    test("reset clears sequence, ack and pending state", () => {
        const { sender } = createHarness();

        sender.send(input());
        sender.send(input());
        sender.ack(0);

        sender.reset();

        assert.equal(sender.getInputSeq(), 0);
        assert.equal(sender.getLastAckedSeq(), -1);
        assert.equal(sender.getPendingCount(), 0);
    });

    test("clearPending drops tracking without rewinding the sequence", () => {
        const { sender } = createHarness();

        sender.send(input());
        sender.send(input());
        assert.equal(sender.getPendingCount(), 2);

        sender.clearPending();

        assert.equal(sender.getPendingCount(), 0);
        assert.equal(sender.getInputSeq(), 2);
    });

    test("no connection or player id blocks transmission", () => {
        const noConnection = createInputSender({
            getConnection: () => null,
            getPlayerId: () => "player-1",
            getSnapshotTick: () => 0,
        });

        assert.equal(noConnection.send(input()), false);
        assert.equal(noConnection.getInputSeq(), 0);

        const noPlayer = createInputSender({
            getConnection: () => ({ send: () => true }),
            getPlayerId: () => null,
            getSnapshotTick: () => 0,
        });

        assert.equal(noPlayer.send(input()), false);
        assert.equal(noPlayer.getInputSeq(), 0);
    });
});