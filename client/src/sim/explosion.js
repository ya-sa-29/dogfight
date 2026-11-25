import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Explosion extends Entity {
    constructor(pos, particleCount = 12) {
        super({
            pos: new Vector2(pos.x, pos.y),
            vel: new Vector2(),
            radius: 0,
            kind: "explosion",
        });

        this.particles = Array.from({ length: particleCount }, () => {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 120;

            return {
                pos: new Vector2(),
                vel: Vector2.fromAngle(angle).scale(speed),
                life: 0.3 + Math.random() * 0.5,
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

    static fromSnapshot(data) {
        const pos = new Vector2(data.x, data.y);
        const explosion = new Explosion(pos, data.particles?.length ?? 12);
        if (data.particles) {
            explosion.particles = data.particles.map((p) => ({
                pos: new Vector2(p.x, p.y),
                vel: new Vector2(p.vx, p.vy),
                life: p.life,
                maxLife: p.maxLife,
            }));
        }
        return explosion;
    }
}
