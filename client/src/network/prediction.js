
import {
    Ship,
    Vector2,
    wrapShip,
} from "@dogfight/shared";

export function createPrediction({
    width,
    height,
    step = 1 / 30,
    smoothingMs = 100,
}) {
    const ship = new Ship();

    let initialized = false;
    let pendingInputs = [];

    let lastServerTick = -1;
    let lastAcknowledgedSeq = 0;
    let lastPredictedSeq = 0;

    let correction = {
        x: 0,
        y: 0,
    };

    let correctionStartedAt = 0;

    function wrapPosition(position) {
        return {
            x: ((position.x % width) + width) % width,
            y: ((position.y % height) + height) % height,
        };
    }

    function getCorrection(now) {
        if (!initialized || smoothingMs <= 0) {
            return { x: 0, y: 0 };
        }

        const elapsed = now - correctionStartedAt;
        const progress = Math.min(
            1,
            Math.max(0, elapsed / smoothingMs),
        );
        const remaining = 1 - progress;

        return {
            x: correction.x * remaining,
            y: correction.y * remaining,
        };
    }

    function applyInput(input) {
        ship.simulateMovement(step, input);
        wrapShip(ship, width, height);
    }

    function predict(input) {
        if (
            !input ||
            !Number.isSafeInteger(input.seq) ||
            input.seq <= lastPredictedSeq
        ) {
            return false;
        }

        const normalizedInput = {
            seq: input.seq,
            thrust: Boolean(input.thrust),
            turn: input.turn,
            fire: Boolean(input.fire),
        };

        lastPredictedSeq = input.seq;
        pendingInputs.push(normalizedInput);

        if (initialized) {
            applyInput(normalizedInput);
        }

        return true;
    }

    function reconcile(snapshot, playerId, now = performance.now()) {
        if (
            !snapshot ||
            !Number.isSafeInteger(snapshot.tick) ||
            snapshot.tick < 0 ||
            snapshot.tick <= lastServerTick ||
            !Array.isArray(snapshot.entities) ||
            !Number.isSafeInteger(snapshot.lastProcessedSeq) ||
            snapshot.lastProcessedSeq < lastAcknowledgedSeq ||
            snapshot.lastProcessedSeq > lastPredictedSeq
        ) {
            return false;
        }

        const serverShip = snapshot.entities.find(
            (entity) =>
                entity.kind === "ship" &&
                entity.playerId === playerId,
        );

        if (
            !serverShip ||
            !Number.isFinite(serverShip.pos?.x) ||
            !Number.isFinite(serverShip.pos?.y) ||
            !Number.isFinite(serverShip.vel?.x) ||
            !Number.isFinite(serverShip.vel?.y) ||
            !Number.isFinite(serverShip.angle)
        ) {
            return false;
        }

        const previousCorrection = getCorrection(now);

        const previousVisible = initialized
            ? wrapPosition({
                  x: ship.pos.x + previousCorrection.x,
                  y: ship.pos.y + previousCorrection.y,
              })
            : null;

        ship.pos = new Vector2(
            serverShip.pos.x,
            serverShip.pos.y,
        );

        ship.vel = new Vector2(
            serverShip.vel.x,
            serverShip.vel.y,
        );

        ship.angle = serverShip.angle;
        ship.thrust = Boolean(serverShip.thrust);

        pendingInputs = pendingInputs.filter(
            (input) => input.seq > snapshot.lastProcessedSeq,
        );

        for (const input of pendingInputs) {
            applyInput(input);
        }

        initialized = true;
        lastServerTick = snapshot.tick;
        lastAcknowledgedSeq = snapshot.lastProcessedSeq;

        if (previousVisible) {
            let dx = previousVisible.x - ship.pos.x;
            let dy = previousVisible.y - ship.pos.y;

            if (dx > width / 2) dx -= width;
            if (dx < -width / 2) dx += width;

            if (dy > height / 2) dy -= height;
            if (dy < -height / 2) dy += height;

            correction = { x: dx, y: dy };
            correctionStartedAt = now;
        } else {
            correction = { x: 0, y: 0 };
            correctionStartedAt = now;
        }

        return true;
    }

    function getRenderState(now = performance.now()) {
        if (!initialized) {
            return null;
        }

        const currentCorrection = getCorrection(now);

        const position = wrapPosition({
            x: ship.pos.x + currentCorrection.x,
            y: ship.pos.y + currentCorrection.y,
        });

        return {
            pos: position,
            vel: {
                x: ship.vel.x,
                y: ship.vel.y,
            },
            radius: ship.radius,
            angle: ship.angle,
            thrust: ship.thrust,
            correctionMagnitude: Math.hypot(
                currentCorrection.x,
                currentCorrection.y,
            ),
        };
    }

    return {
        predict,
        reconcile,
        getRenderState,

        get pendingCount() {
            return pendingInputs.length;
        },

        get initialized() {
            return initialized;
        },
    };
}
