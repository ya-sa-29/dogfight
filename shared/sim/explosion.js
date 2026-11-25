import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Explosion extends Entity {
    constructor(pos, particleCount = 12, rng = Math.random, id = 0, deterministicParticles = false) {
        super({
            pos: new Vector2(pos.x, pos.y),
            vel: new Vector2(),
            radius: 0,
            kind: "explosion",
            hp: 1,
            id,
        });

        this.deterministicParticles = deterministicParticles;

        this.particles = Array.from({ length: particleCount }, () => {
            const angle = rng() * Math.PI * 2;
            const speed = 40 + rng() * 120;

            return {
                pos: new Vector2(),
                vel: Vector2.fromAngle(angle).scale(speed),
                life: 0.3 + rng() * 0.5,
                maxLife: 0.8,
            };
        });
    }

    update(dt, input, world) {
        for (const particle of this.particles) {
            if (particle.life <= 0) continue;

            particle.pos = particle.pos.add(particle.vel.scale(dt));

            particle.life = Math.max(0, particle.life - dt);
        }

        if (this.particles.every((particle) => particle.life <= 0)) {
            world.despawn(this.id);
        }
    }

    toSnapshot() {
        if (this.deterministicParticles) {
            return {
                ...super.toSnapshot(),
                particles: this.particles.map((p) => ({
                    x: p.pos.x,
                    y: p.pos.y,
                    vx: p.vel.x,
                    vy: p.vel.y,
                    life: p.life,
                    maxLife: p.maxLife,
                })),
            };
        }
        return super.toSnapshot();
    }

    static fromSnapshot(data, rng = Math.random) {
        const deterministicParticles = !!data.particles?.length;
        const explosion = new Explosion(
            new Vector2(data.x, data.y),
            data.particles?.length || 12,
            rng,
            data.id,
            deterministicParticles
        );
        explosion.alive = data.alive;
        if (data.particles && deterministicParticles) {
            explosion.particles = data.particles.map((p) => ({
                pos: new Vector2(p.x, p.y),
                vel: new Vector2(p.vx, p.vy),
                life: p.life,
                maxLife: p.maxLife,
            }));
        }
        return explosion;
    }

    static createVisual(pos, particleCount = 12) {
        return new Explosion(pos, particleCount, Math.random, 0, false);
    }
}