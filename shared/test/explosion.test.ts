import { describe, expect, test } from "vitest";
import { Explosion } from "../../shared/sim/explosion.ts";
import { Vector2 } from "../../shared/sim/vector.ts";
import { createRNG } from "../../shared/rng/mulberry32.ts";

describe("Explosion", () => {
    test("constructor creates specified number of particles", () => {
        const explosion = new Explosion(new Vector2(100, 100), 8, () => 0.5);
        expect(explosion.particles.length).toBe(8);
    });

    test("deterministic explosion with seeded RNG produces same particles", () => {
        const rng1 = createRNG(42);
        const rng2 = createRNG(42);
        const e1 = new Explosion(
            new Vector2(100, 100),
            6,
            rng1.random.bind(rng1),
            1,
            true,
        );
        const e2 = new Explosion(
            new Vector2(100, 100),
            6,
            rng2.random.bind(rng2),
            2,
            true,
        );

        expect(e1.particles.length).toBe(e2.particles.length);
        for (let i = 0; i < e1.particles.length; i++) {
            expect(e1.particles[i]!.pos.x).toBe(e2.particles[i]!.pos.x);
            expect(e1.particles[i]!.pos.y).toBe(e2.particles[i]!.pos.y);
            expect(e1.particles[i]!.vel.x).toBe(e2.particles[i]!.vel.x);
            expect(e1.particles[i]!.vel.y).toBe(e2.particles[i]!.vel.y);
            expect(e1.particles[i]!.life).toBe(e2.particles[i]!.life);
        }
    });

    test("update moves particles and reduces life", () => {
        const explosion = new Explosion(new Vector2(100, 100), 3, () => 0.5);
        const beforePos = { ...explosion.particles[0]!.pos };
        const beforeLife = explosion.particles[0]!.life;

        const world = new WorldLike();
        explosion.update(
            0.1,
            {
                thrust: false,
                turnLeft: false,
                turnRight: false,
                fire: false,
                switchWeapon: false,
            },
            world,
        );

        expect(explosion.particles[0]!.pos.x).not.toBe(beforePos.x);
        expect(explosion.particles[0]!.life).toBeLessThan(beforeLife);
    });

    test("update despawns when all particles dead", () => {
        const explosion = new Explosion(new Vector2(100, 100), 1, () => 0.001);
        explosion.particles[0]!.life = 0.001;

        const world = new WorldLike();
        explosion.update(
            1,
            {
                thrust: false,
                turnLeft: false,
                turnRight: false,
                fire: false,
                switchWeapon: false,
            },
            world,
        );

        // Particle should be despawned
        expect(world.despawned).toContain(explosion.id);
    });

    test("toSnapshot includes particles when deterministic", () => {
        const explosion = new Explosion(
            new Vector2(100, 100),
            3,
            () => 0.5,
            1,
            true,
        );
        const snapshot = explosion.toSnapshot();

        expect(snapshot.kind).toBe("explosion");
        expect(Array.isArray(snapshot.particles)).toBe(true);
        expect(snapshot.particles!.length).toBe(3);
    });

    test("toSnapshot omits particles when non-deterministic", () => {
        const explosion = new Explosion(
            new Vector2(100, 100),
            3,
            Math.random,
            1,
            false,
        );
        const snapshot = explosion.toSnapshot();

        expect(snapshot.particles).toBeUndefined();
    });

    test("createVisual creates non-deterministic explosion", () => {
        const explosion = Explosion.createVisual(new Vector2(200, 300));
        expect(explosion.deterministicParticles).toBe(false);
        expect(explosion.particles.length).toBe(12);
    });

    test("fromSnapshot restores explosion with particles", () => {
        const explosion = new Explosion(
            new Vector2(100, 100),
            2,
            () => 0.5,
            7,
            true,
        );
        const snapshot = explosion.toSnapshot();

        const restored = Explosion.fromSnapshot(snapshot);
        expect(restored.deterministicParticles).toBe(true);
        expect(restored.particles.length).toBe(2);
    });
});

class WorldLike {
    despawned: number[] = [];
    despawn(id: number): void {
        this.despawned.push(id);
    }
}
