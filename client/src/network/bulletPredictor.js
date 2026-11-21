/**
 * M3 local bullet prediction.
 *
 * When the local player fires, the bullet is spawned immediately on the
 * client so it feels instant, rather than waiting a full round-trip for the
 * authoritative snapshot.
 *
 * Reconciliation is one-to-one and id-tracked: each authoritative bullet can
 * confirm at most one predicted bullet, and an authoritative bullet id that has
 * already confirmed a prediction is remembered and can never confirm a
 * different prediction on a later snapshot. Predicted bullets confirmed this
 * way are removed (the authoritative bullet is drawn instead); unconfirmed
 * predicted bullets keep being simulated and drawn so the local player sees
 * their shots immediately.
 *
 * Limitation — not pure id equality: the authoritative bullet's id is assigned
 * by the server from a world-global spawn counter (shared/sim/world.js) that
 * the client cannot predict, and bullet snapshots carry no owner or originating
 * input seq. The client therefore matches an eligible (not-yet-matched)
 * authoritative bullet to a predicted bullet by nearest position within
 * CONFIRM_RADIUS. The id tracking prevents one authoritative bullet from
 * confirming multiple predictions and prevents an already-matched bullet from
 * confirming unrelated later predictions, but exact id matching is impossible
 * without a protocol change.
 *
 * This module is pure (no DOM/WebSocket) so it can be unit tested directly.
 */

const BULLET_TTL = 1.5;
const BULLET_RADIUS = 3;
// Confirmation radius: a predicted bullet within this distance of an
// authoritative bullet is treated as the same bullet.
const CONFIRM_RADIUS = 24;

let nextSyntheticId = -1;

function allocateSyntheticId() {
    const id = nextSyntheticId;
    nextSyntheticId -= 1;
    return id;
}

export function createBulletPredictor() {
    // Predicted bullets: [{ id, x, y, angle, vx, vy, ttl, alive }]
    let predicted = [];
    // Authoritative bullet ids already consumed by a confirmation. An
    // authoritative bullet can confirm at most one predicted bullet, and an
    // already-matched authoritative bullet must never confirm a different
    // prediction on a later snapshot. Ids are pruned once the bullet leaves
    // the snapshot, so this set stays bounded by the live authoritative set.
    const matchedAuthIds = new Set();

    function reset() {
        predicted = [];
        matchedAuthIds.clear();
    }

    /**
     * Spawn a locally predicted bullet. Called when the local ship fires.
     * `x, y` is the bullet nose position; `vx, vy` the bullet velocity;
     * `angle` the bullet angle.
     */
    function spawnBullet({ x, y, vx, vy, angle }) {
        const id = allocateSyntheticId();
        predicted.push({
            id,
            x,
            y,
            vx,
            vy,
            angle: angle || 0,
            ttl: BULLET_TTL,
            radius: BULLET_RADIUS,
            alive: true,
        });
        return id;
    }

    /**
     * Advance all predicted bullets by one step. Bullets that expire are
     * removed.
     */
    function update(dt) {
        for (const b of predicted) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.ttl -= dt;
        }
        predicted = predicted.filter((b) => b.ttl > 0 && b.alive);
    }

    /**
     * Reconcile predicted bullets against an authoritative snapshot's bullets.
     *
     * `authoritativeBullets` is a list of `{ id, x, y }` from the snapshot.
     * Reconciliation is ONE-TO-ONE and ID-TRACKED:
     *   - each authoritative bullet confirms at most one predicted bullet;
     *   - an authoritative bullet id that has already confirmed a prediction is
     *     remembered and can never confirm a different prediction later;
     *   - matching among eligible (not-yet-matched) authoritative bullets is by
     *     nearest position within CONFIRM_RADIUS.
     *
     * This prevents two predicted bullets from both being confirmed by a single
     * authoritative bullet, and prevents an already-matched authoritative
     * bullet from confirming an unrelated later prediction.
     *
     * NOTE: the authoritative bullet's position is still used to pick which
     * eligible bullet matches; this is NOT pure id equality, because the
     * protocol does not let the client know an authoritative bullet's id in
     * advance (see the module header for why exact id matching is impossible
     * without a protocol change).
     */
    function reconcile(authoritativeBullets) {
        if (!authoritativeBullets || authoritativeBullets.length === 0) {
            return;
        }

        const currentIds = new Set(authoritativeBullets.map((ab) => ab.id));

        // Prune matched ids whose authoritative bullet has left the snapshot,
        // keeping the set bounded by the live authoritative bullets.
        for (const id of matchedAuthIds) {
            if (!currentIds.has(id)) {
                matchedAuthIds.delete(id);
            }
        }

        // Only authoritative bullets that have not already confirmed a
        // prediction are eligible. This is what stops an unrelated, already
        // matched nearby bullet from confirming a new prediction.
        const eligible = authoritativeBullets.filter(
            (ab) => !matchedAuthIds.has(ab.id),
        );
        if (eligible.length === 0 || predicted.length === 0) {
            return;
        }

        // Build all candidate (predicted, authoritative) pairs within radius.
        const pairs = [];
        for (let pi = 0; pi < predicted.length; pi += 1) {
            const pb = predicted[pi];
            for (const ab of eligible) {
                const d = Math.hypot(ab.x - pb.x, ab.y - pb.y);
                if (d <= CONFIRM_RADIUS) {
                    pairs.push({ pi, ab, d });
                }
            }
        }

        // Greedy one-to-one assignment, nearest pairs first.
        pairs.sort((a, b) => a.d - b.d);

        const confirmedPredicted = new Set();
        for (const pair of pairs) {
            if (confirmedPredicted.has(pair.pi)) continue;
            if (matchedAuthIds.has(pair.ab.id)) continue;
            confirmedPredicted.add(pair.pi);
            matchedAuthIds.add(pair.ab.id);
        }

        if (confirmedPredicted.size > 0) {
            predicted = predicted.filter(
                (_, i) => !confirmedPredicted.has(i),
            );
        }
    }

    /**
     * Return the predicted bullets to render, in draw order. Each entry is a
     * plain `{ x, y, angle, radius }` compatible with drawBullet().
     */
    function getRenderBullets() {
        return predicted.map((b) => ({
            x: b.x,
            y: b.y,
            angle: b.angle,
            radius: b.radius,
        }));
    }

    function getCount() {
        return predicted.length;
    }

    return {
        spawnBullet,
        update,
        reconcile,
        getRenderBullets,
        getCount,
        reset,
    };
}