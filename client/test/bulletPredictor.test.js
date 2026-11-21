import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createBulletPredictor } from "../src/network/bulletPredictor.js";

describe("bulletPredictor", () => {
    test("starts with no bullets", () => {
        const bp = createBulletPredictor();
        assert.equal(bp.getCount(), 0);
        assert.equal(bp.getRenderBullets().length, 0);
    });

    test("spawnBullet adds a predicted bullet with a synthetic id", () => {
        const bp = createBulletPredictor();
        const id = bp.spawnBullet({ x: 10, y: 20, vx: 100, vy: 0, angle: 0 });
        assert.ok(id < 0, "synthetic ids are negative");
        assert.equal(bp.getCount(), 1);
    });

    test("update advances bullets by velocity * dt", () => {
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 100, vy: 50, angle: 0 });
        bp.update(0.1);
        const [b] = bp.getRenderBullets();
        assert.ok(Math.abs(b.x - 10) < 1e-9);
        assert.ok(Math.abs(b.y - 5) < 1e-9);
    });

    test("bullets expire after their ttl", () => {
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 100, vy: 0, angle: 0 });
        // ttl is 1.5 s; advance past it.
        bp.update(2.0);
        assert.equal(bp.getCount(), 0);
    });

    test("reconcile removes bullets confirmed by a nearby authoritative bullet", () => {
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 100, vy: 0, angle: 0 });
        bp.spawnBullet({ x: 500, y: 500, vx: 100, vy: 0, angle: 0 });
        assert.equal(bp.getCount(), 2);

        // An authoritative bullet near the first predicted bullet confirms it.
        bp.reconcile([{ id: 10, x: 5, y: 5 }]);
        assert.equal(bp.getCount(), 1, "confirmed bullet is removed");

        // The remaining predicted bullet is the far one (near 500,500).
        const [b] = bp.getRenderBullets();
        assert.ok(b.x > 400 && b.y > 400);
    });

    test("reconcile keeps bullets with no matching authoritative bullet", () => {
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 100, vy: 0, angle: 0 });
        // Authoritative bullet far away -> no confirmation.
        bp.reconcile([{ id: 10, x: 900, y: 900 }]);
        assert.equal(bp.getCount(), 1);
    });

    test("reconcile with empty authoritative list is a no-op", () => {
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 100, vy: 0, angle: 0 });
        bp.reconcile([]);
        assert.equal(bp.getCount(), 1);
        bp.reconcile(undefined);
        assert.equal(bp.getCount(), 1);
    });

    test("one authoritative bullet confirms at most one predicted bullet", () => {
        // Two predicted bullets both near a single authoritative bullet. Only
        // one (the nearest) may be confirmed; the other must remain predicted.
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 }); // dist 0 from auth
        bp.spawnBullet({ x: 20, y: 0, vx: 0, vy: 0, angle: 0 }); // dist 20 from auth
        assert.equal(bp.getCount(), 2);

        bp.reconcile([{ id: 7, x: 0, y: 0 }]);

        assert.equal(
            bp.getCount(),
            1,
            "a single authoritative bullet confirms only one prediction",
        );
        const [remaining] = bp.getRenderBullets();
        assert.ok(
            Math.abs(remaining.x - 20) < 1e-9,
            "the farther predicted bullet must remain (nearest was confirmed)",
        );
    });

    test("an already-matched authoritative bullet cannot confirm a later prediction", () => {
        // First prediction is confirmed by authoritative bullet id 7. That id
        // is now consumed. A new predicted bullet spawns near id 7, but the
        // snapshot still contains id 7 (now "old"/already matched), so it must
        // NOT confirm the new prediction.
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
        bp.reconcile([{ id: 7, x: 0, y: 0 }]);
        assert.equal(bp.getCount(), 0, "first prediction confirmed");

        // New prediction near the same (already-matched) authoritative bullet.
        bp.spawnBullet({ x: 5, y: 0, vx: 0, vy: 0, angle: 0 });
        bp.reconcile([{ id: 7, x: 5, y: 0 }]);
        assert.equal(
            bp.getCount(),
            1,
            "an already-matched authoritative bullet must not confirm again",
        );
    });

    test("an unrelated far authoritative bullet cannot confirm a prediction", () => {
        // A different player's bullet (far away) must not confirm my prediction.
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
        bp.reconcile([{ id: 42, x: 500, y: 500 }]);
        assert.equal(bp.getCount(), 1, "far bullet must not confirm prediction");
    });

    test("matched id is pruned once the authoritative bullet leaves the snapshot", () => {
        // After id 7 leaves the snapshot, a future authoritative bullet reusing
        // a fresh id near a prediction can confirm normally (no stale block).
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
        bp.reconcile([{ id: 7, x: 0, y: 0 }]); // id 7 matched
        assert.equal(bp.getCount(), 0);

        // id 7 gone; a brand-new prediction is confirmed by a new id.
        bp.spawnBullet({ x: 100, y: 0, vx: 0, vy: 0, angle: 0 });
        bp.reconcile([{ id: 9, x: 100, y: 0 }]);
        assert.equal(bp.getCount(), 0, "new authoritative id confirms normally");
    });

    test("reset clears matched-id tracking", () => {
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
        bp.reconcile([{ id: 7, x: 0, y: 0 }]);
        bp.reset();
        // After reset, id 7 is no longer considered matched; a prediction near
        // it can be confirmed again.
        bp.spawnBullet({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
        bp.reconcile([{ id: 7, x: 0, y: 0 }]);
        assert.equal(bp.getCount(), 0);
    });

    test("synthetic ids are unique across spawns", () => {
        const bp = createBulletPredictor();
        const ids = new Set();
        for (let i = 0; i < 5; i += 1) {
            ids.add(bp.spawnBullet({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 }));
        }
        assert.equal(ids.size, 5, "all synthetic ids must be unique");
    });

    test("reset clears all predicted bullets", () => {
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
        bp.reset();
        assert.equal(bp.getCount(), 0);
    });

    test("render bullets expose x/y/angle/radius compatible with drawBullet", () => {
        const bp = createBulletPredictor();
        bp.spawnBullet({ x: 12, y: 34, vx: 0, vy: 0, angle: 1.5 });
        const [b] = bp.getRenderBullets();
        assert.equal(b.x, 12);
        assert.equal(b.y, 34);
        assert.equal(b.angle, 1.5);
        assert.ok(b.radius > 0);
    });
});