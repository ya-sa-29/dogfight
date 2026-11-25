import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";
import { World } from "./world.js";

interface Particle {
    pos: Vector2;
    vel: Vector2;
    life: number;
    maxLife: number;
}

interface ExplosionSnapshotData {
    id: number;
    x: number;
    y: number;
    particles?: readonly {
        readonly x: number;
        readonly y: number;
        readonly vx: number;
        readonly vy: number;
        readonly life: number;
        readonly maxLife: number;
    }[];
}

export class Explosion extends Entity {
    particles: Particle[];

    constructor(pos: Vector2, particleCount = 12, id?: number) {
        super({
            pos: new Vector2(pos.x, pos.y),
            vel: new Vector2(),
            radius: 0,
            kind: "explosion",
            id,
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

    override update(dt: number, _input: unknown, world: World): void {
        for (const particle of this.particles) {
            if (particle.life <= 0) continue;

            particle.pos = particle.pos.add(particle.vel.scale(dt));

            particle.life = Math.max(0, particle.life - dt);
        }

        if (this.particles.every((particle) => particle.life <= 0)) {
            world.despawn(this.id);
        }
    }

    static fromSnapshot(data: ExplosionSnapshotData): Explosion {
        const pos = new Vector2(data.x, data.y);
        const explosion = new Explosion(pos, data.particles?.length ?? 12, data.id);
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