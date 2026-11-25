import { Entity, EntityBase, EntityId, EntitySnapshot, EntityInput, ExplosionSnapshot } from "./entity.js";
import { Vector2 } from "./vector.js";
import { SeededRNG } from "../rng/mulberry32.js";
import { World } from "./world.js";
import { asEntityId } from "./branded.js";

/**
 * Explosion particle data structure.
 */
export interface ExplosionParticleData {
  pos: Vector2;
  vel: Vector2;
  life: number;
  maxLife: number;
}

/**
 * Explosion entity - visual effect with particles.
 * Can be deterministic (for snapshots) or visual-only (non-deterministic).
 */
export class Explosion extends Entity {
  deterministicParticles: boolean;
  override particles: ExplosionParticleData[];

  constructor(
    pos: Vector2,
    particleCount = 12,
    rng: SeededRNG | (() => number) = Math.random,
    id = asEntityId(0),
    deterministicParticles = false,
  ) {
    super({
      pos: new Vector2(pos.x, pos.y),
      vel: new Vector2(),
      radius: 0,
      kind: "explosion",
      hp: 1,
      id,
    });

    this.deterministicParticles = deterministicParticles;
    this.particles = [];

    // Handle both SeededRNG and plain function
    const randomFn = rng instanceof SeededRNG ? rng.random.bind(rng) : rng;

    for (let i = 0; i < particleCount; i++) {
      const angle = randomFn() * Math.PI * 2;
      const speed = 40 + randomFn() * 120;

      this.particles.push({
        pos: new Vector2(),
        vel: Vector2.fromAngle(angle).scale(speed),
        life: 0.3 + randomFn() * 0.5,
        maxLife: 0.8,
      });
    }
  }

  override update(dt: number, _input: EntityInput, world: World): void {
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;

      particle.pos = particle.pos.add(particle.vel.scale(dt));
      particle.life = Math.max(0, particle.life - dt);
    }

    if (this.particles.every((particle) => particle.life <= 0)) {
      world.despawn(this.id);
    }
  }

  override toSnapshot(): EntitySnapshot {
    const base: EntityBase = {
      id: this.id,
      kind: this.kind as "explosion",
      x: this.pos.x,
      y: this.pos.y,
      angle: this.angle,
      radius: this.radius,
      hp: this.hp,
      alive: this.alive,
    };
    if (this.deterministicParticles) {
      return {
        ...base,
        kind: "explosion" as const,
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
    return base as EntitySnapshot;
  }

  /**
   * Create a new Explosion from a snapshot.
   */
  static override fromSnapshot(data: EntitySnapshot, rng: SeededRNG | (() => number) = Math.random): Explosion {
    if (data.kind !== "explosion") {
      throw new Error("Cannot create Explosion from non-explosion snapshot");
    }

    const deterministicParticles = !!data.particles?.length;
    const explosion = new Explosion(
      new Vector2(data.x, data.y),
      data.particles?.length ?? 12,
      rng,
      data.id,
      deterministicParticles,
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

  /**
   * Create a non-deterministic visual explosion (not for snapshots).
   */
  static createVisual(pos: Vector2, particleCount = 12): Explosion {
    return new Explosion(pos, particleCount, Math.random, asEntityId(0), false);
  }
}


