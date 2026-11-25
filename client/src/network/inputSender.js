import { canSendInput } from "./inputGate.js";

/**
 * Owns the client-side input sequence state and the outbound handoff.
 *
 * Sequence numbers and pending-input tracking are advanced only after the
 * connection has actually accepted a message, so a rejected handoff never
 * creates a gap in the server's expected sequence.
 */
export function createInputSender({ getConnection, getPlayerId, getSnapshotTick }) {
    let inputSeq = 0;
    let lastAckedSeq = -1;
    const pendingInputs = new Set();

    function reset() {
        inputSeq = 0;
        lastAckedSeq = -1;
        pendingInputs.clear();
    }

    function send(input) {
        const connection = getConnection();

        if (!connection || !getPlayerId()) {
            return false;
        }

        const tick = getSnapshotTick();

        // The server rejects negative ticks, so nothing is transmitted until
        // the first authoritative snapshot has established a valid tick.
        if (!canSendInput(tick)) {
            return false;
        }

        const seq = inputSeq;

        const accepted = connection.send({
            type: "input",
            seq,
            tick,
            thrust: input.thrust,
            turnLeft: input.turnLeft,
            turnRight: input.turnRight,
            fire: input.fire,
            switchWeapon: input.switchWeapon,
        });

        if (!accepted) {
            return false;
        }

        inputSeq += 1;
        pendingInputs.add(seq);

        return true;
    }

    function ack(ackedSeq) {
        if (!Number.isInteger(ackedSeq) || ackedSeq <= lastAckedSeq) {
            return;
        }

        for (let seq = lastAckedSeq + 1; seq <= ackedSeq; seq += 1) {
            pendingInputs.delete(seq);
        }

        lastAckedSeq = ackedSeq;
    }

    return {
        send,
        reset,
        ack,
        clearPending() {
            pendingInputs.clear();
        },
        getInputSeq: () => inputSeq,
        getLastAckedSeq: () => lastAckedSeq,
        getPendingCount: () => pendingInputs.size,
    };
}