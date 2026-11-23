import { canSendInput, NO_SNAPSHOT_TICK } from "./inputGate.js";

export interface InputSenderConfig {
  readonly getConnection: () => ConnectionLike | null;
  readonly getPlayerId: () => string | null;
  readonly getSnapshotTick: () => number;
}

export interface InputMessage {
  readonly thrust: boolean;
  readonly turnLeft: boolean;
  readonly turnRight: boolean;
  readonly fire: boolean;
  readonly switchWeapon: boolean;
}

interface ConnectionLike {
  send(message: unknown): boolean;
}

interface InputSenderAPI {
  readonly send: (input: InputMessage) => boolean;
  readonly reset: () => void;
  readonly ack: (ackedSeq: number) => void;
  readonly clearPending: () => void;
  readonly getInputSeq: () => number;
  readonly getLastAckedSeq: () => number;
  readonly getPendingCount: () => number;
}

/**
 * Owns the client-side input sequence state and the outbound handoff.
 *
 * Sequence numbers and pending-input tracking are advanced only after the
 * connection has actually accepted a message, so a rejected handoff never
 * creates a gap in the server's expected sequence.
 *
 * @param config - Callbacks to access connection, player ID, and snapshot tick
 * @returns InputSender API
 */
export function createInputSender(config: InputSenderConfig): InputSenderAPI {
  const { getConnection, getPlayerId, getSnapshotTick } = config;

  let inputSeq = 0;
  let lastAckedSeq = -1;
  const pendingInputs = new Set<number>();

  function reset(): void {
    inputSeq = 0;
    lastAckedSeq = -1;
    pendingInputs.clear();
  }

  function send(input: InputMessage): boolean {
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

  function ack(ackedSeq: number): void {
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
    clearPending(): void {
      pendingInputs.clear();
    },
    getInputSeq: () => inputSeq,
    getLastAckedSeq: () => lastAckedSeq,
    getPendingCount: () => pendingInputs.size,
  };
}