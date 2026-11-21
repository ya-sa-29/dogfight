/**
 * M3 entity interpolation.
 *
 * Remote entities arrive as discrete 30 Hz server snapshots, but the client
 * renders at 60–144 Hz. Drawing them at the latest snapshot position produces
 * visible 30 Hz stutter. This module buffers snapshots and interpolates each
 * remote entity's position/angle between the two snapshots that bracket
 * `renderTime = now − interpolationDelay`.
 *
 * The module is pure (no DOM/WebSocket) so it can be unit tested directly.
 * It operates on plain entity-data objects (`{ id, x, y, angle, thrust }`)
 * captured from snapshots, independent of the live World entity classes.
 */

const DEFAULT_DELAY_MS = 100;
const MIN_DELAY_MS = 0;
const MAX_DELAY_MS = 500;
// Keep a bounded history; at 30 Hz this covers ~1.7 s of snapshots.
const MAX_BUFFERED = 60;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function createInterpolator() {
    // Each frame: { serverTime, entities: [{ id, kind, x, y, angle, thrust, ... }] }
    const buffer = [];
    // Live-adjustable interpolation delay in milliseconds.
    let delayMs = DEFAULT_DELAY_MS;

    function reset() {
        buffer.length = 0;
        delayMs = DEFAULT_DELAY_MS;
    }

    /**
     * Push a snapshot frame. `entities` is the plain-data list from the
     * snapshot (already normalized to `{ id, kind, x, y, angle, thrust }`).
     * `serverTime` is the server timestamp (ms) of that snapshot.
     */
    function pushFrame(serverTime, entities) {
        buffer.push({ serverTime, entities });
        if (buffer.length > MAX_BUFFERED) {
            buffer.shift();
        }
    }

    function getDelayMs() {
        return delayMs;
    }

    function setDelayMs(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        delayMs = clamp(n, MIN_DELAY_MS, MAX_DELAY_MS);
    }

    function adjustDelay(deltaMs) {
        setDelayMs(delayMs + deltaMs);
    }

    /**
     * Interpolate the interpolated view of all entities.
     *
     * The render target time is expressed relative to the newest buffered
     * snapshot's server time minus `interpolationDelay`. This is the standard
     * "render in the past" formulation: the delay is applied relative to the
     * newest snapshot, so the result is stable without needing a per-frame
     * client receipt timestamp.
     *
     * Returns a Map<id, { x, y, angle, kind, ...meta }> of interpolated
     * positions for entities present in both bracketing frames, plus the most
     * recent known state for entities that appear/disappear between frames.
     */
    function interpolate() {
        if (buffer.length === 0) return new Map();

        const newest = buffer[buffer.length - 1];

        // Render in the past: the target time is the newest snapshot's server
        // time minus the interpolation delay. The delay is applied relative to
        // the newest snapshot, so no per-frame client receipt timestamp is
        // needed and the result is stable frame to frame.
        const renderTime = newest.serverTime - delayMs;

        // Find the two frames that bracket renderTime.
        let older = null;
        let newer = null;
        for (let i = buffer.length - 1; i >= 0; i -= 1) {
            if (buffer[i].serverTime <= renderTime) {
                older = buffer[i];
                newer = buffer[i + 1] || null;
                break;
            }
        }

        // If renderTime is older than every buffered frame, use the two oldest.
        if (!older) {
            older = buffer[0];
            newer = buffer[1] || null;
        }

        // If renderTime is newer than the newest frame (delay smaller than a
        // full snapshot gap), clamp to the newest frame.
        if (!newer) {
            newer = newest;
            if (older === newer) {
                older = buffer[buffer.length - 2] || newer;
            }
        }

        const span =
            newer && older && newer.serverTime !== older.serverTime
                ? newer.serverTime - older.serverTime
                : 0;
        const t =
            span > 0
                ? clamp((renderTime - older.serverTime) / span, 0, 1)
                : 0;

        const result = new Map();

        // Index the bracketing frames by id for O(1) lookup.
        const olderById = indexById(older.entities);
        const newerById = indexById(newer.entities);

        // Interpolate entities present in both frames (position + angle).
        for (const [id, a] of olderById) {
            const b = newerById.get(id);
            if (!b) {
                // Entity disappeared in the newer frame: keep the older
                // position so it lingers until it leaves the render window.
                result.set(id, { ...a });
                continue;
            }
            result.set(id, lerpEntity(a, b, t));
        }

        // Entities that only appear in the newer frame: render at the newer
        // position (they just spawned; no history to interpolate from).
        for (const [id, b] of newerById) {
            if (!olderById.has(id)) {
                result.set(id, { ...b });
            }
        }

        return result;
    }

    return {
        pushFrame,
        interpolate,
        getDelayMs,
        setDelayMs,
        adjustDelay,
        reset,
        getBufferLength: () => buffer.length,
    };
}

function indexById(entities) {
    const map = new Map();
    for (const e of entities) {
        map.set(e.id, e);
    }
    return map;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
    // Shortest-arc angle interpolation.
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}

function lerpEntity(a, b, t) {
    return {
        id: a.id,
        kind: a.kind,
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        angle: lerpAngle(a.angle || 0, b.angle || 0, t),
        thrust: b.thrust, // latest known thrust state
        radius: b.radius ?? a.radius,
        hp: b.hp ?? a.hp,
        alive: b.alive ?? a.alive,
    };
}