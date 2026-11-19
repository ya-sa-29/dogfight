
const DEFAULT_STEP = 1 / 30;
const DEFAULT_DELAY_MS = 100;
const DEFAULT_MAX_SNAPSHOTS = 30;

function normalizeAngle(angle) {
    const fullTurn = Math.PI * 2;

    return (
        ((angle + Math.PI) % fullTurn + fullTurn) %
            fullTurn -
        Math.PI
    );
}

function interpolateAngle(from, to, alpha) {
    const difference = normalizeAngle(to - from);

    return from + difference * alpha;
}

function interpolatePosition(from, to, alpha, width, height) {
    let dx = to.x - from.x;
    let dy = to.y - from.y;

    if (dx > width / 2) dx -= width;
    if (dx < -width / 2) dx += width;

    if (dy > height / 2) dy -= height;
    if (dy < -height / 2) dy += height;

    return {
        x: ((from.x + dx * alpha) % width + width) % width,
        y: ((from.y + dy * alpha) % height + height) % height,
    };
}

function isValidSnapshot(snapshot) {
    if (
        !snapshot ||
        !Number.isSafeInteger(snapshot.tick) ||
        snapshot.tick < 0 ||
        !Array.isArray(snapshot.entities)
    ) {
        return false;
    }

    return snapshot.entities.every((entity) => (
        entity &&
        (typeof entity.id === "string" ||
            Number.isSafeInteger(entity.id)) &&
        typeof entity.kind === "string" &&
        Number.isFinite(entity.pos?.x) &&
        Number.isFinite(entity.pos?.y) &&
        Number.isFinite(entity.vel?.x) &&
        Number.isFinite(entity.vel?.y) &&
        Number.isFinite(entity.angle)
    ));
}

function interpolateEntity(from, to, alpha, width, height) {
    return {
        ...from,
        pos: interpolatePosition(
            from.pos,
            to.pos,
            alpha,
            width,
            height,
        ),
        vel: {
            x: from.vel.x + (to.vel.x - from.vel.x) * alpha,
            y: from.vel.y + (to.vel.y - from.vel.y) * alpha,
        },
        angle: interpolateAngle(
            from.angle,
            to.angle,
            alpha,
        ),
    };
}

export function createInterpolationBuffer({
    width,
    height,
    step = DEFAULT_STEP,
    delayMs = DEFAULT_DELAY_MS,
    maxSnapshots = DEFAULT_MAX_SNAPSHOTS,
}) {
    if (
        !Number.isFinite(width) ||
        width <= 0 ||
        !Number.isFinite(height) ||
        height <= 0
    ) {
        throw new RangeError("Arena dimensions must be positive");
    }

    if (!Number.isFinite(step) || step <= 0) {
        throw new RangeError("Step must be positive");
    }

    if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new RangeError("Delay must be non-negative");
    }

    if (!Number.isSafeInteger(maxSnapshots) || maxSnapshots < 2) {
        throw new RangeError("maxSnapshots must be at least 2");
    }

    const snapshots = [];
    const stepMs = step * 1000;

    let currentDelayMs = delayMs;
    let lastSampleTime = -Infinity;

    function push(snapshot, receivedAt = performance.now()) {
        if (
            !isValidSnapshot(snapshot) ||
            !Number.isFinite(receivedAt)
        ) {
            return false;
        }

        const latest = snapshots.at(-1);

        if (latest && snapshot.tick <= latest.tick) {
            return false;
        }

        const entitiesById = new Map();

        for (const entity of snapshot.entities) {
            if (entitiesById.has(entity.id)) {
                return false;
            }

            entitiesById.set(entity.id, entity);
        }

        snapshots.push({
            tick: snapshot.tick,
            timeMs: snapshot.tick * stepMs,
            receivedAt,
            entities: entitiesById,
        });

        if (snapshots.length > maxSnapshots) {
            snapshots.shift();
        }

        return true;
    }

    function sample(now = performance.now()) {
        if (snapshots.length === 0 || !Number.isFinite(now)) {
            return null;
        }

        const latest = snapshots.at(-1);

        const calculatedTime =
            latest.timeMs +
            (now - latest.receivedAt) -
            currentDelayMs;

        // Час відображення не може рухатися назад.
        const targetTime = Math.max(
            lastSampleTime,
            calculatedTime,
        );

        lastSampleTime = targetTime;

        if (targetTime <= snapshots[0].timeMs) {
            return Array.from(snapshots[0].entities.values());
        }

        if (targetTime >= latest.timeMs) {
            return Array.from(latest.entities.values());
        }

        let before = null;
        let after = null;

        for (let i = 1; i < snapshots.length; i++) {
            if (snapshots[i].timeMs >= targetTime) {
                before = snapshots[i - 1];
                after = snapshots[i];
                break;
            }
        }

        if (!before || !after) {
            return Array.from(latest.entities.values());
        }

        const alpha =
            (targetTime - before.timeMs) /
            (after.timeMs - before.timeMs);

        const result = [];

        for (const [id, oldEntity] of before.entities) {
            const newEntity = after.entities.get(id);

            if (!newEntity) {
                // Об'єкт зникає, коли час відображення досягає наступного snapshot.
                result.push(oldEntity);
                continue;
            }

            result.push(
                interpolateEntity(
                    oldEntity,
                    newEntity,
                    alpha,
                    width,
                    height,
                ),
            );
        }

        return result;
    }

    function setDelayMs(value) {
        if (!Number.isFinite(value) || value < 0) {
            throw new RangeError("Delay must be non-negative");
        }

        currentDelayMs = value;
    }

    return {
        push,
        sample,
        setDelayMs,

        get delayMs() {
            return currentDelayMs;
        },

        get size() {
            return snapshots.length;
        },
    };
}
