import { Vector2 } from "./vector.js";
import { EntityId, Tick, Seq, Radians, asEntityId } from "./branded.js";
import { World } from "./world.js";

/**
 * Base entity properties shared by all entity kinds.
 */
export interface EntityBase {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly radius: number;
  readonly hp: number;
  readonly alive: boolean;
}

/**
 * Ship-specific snapshot properties.
 */
export interface ShipSnapshot extends EntityBase {
  readonly kind: "ship";
  readonly thrust: boolean;
  readonly weapon: "bullet" | "missile";
  readonly missileCount: number;
  readonly fireCooldown: number;
  readonly invulnerabilityTimer: number;
}

/**
 * Bullet-specific snapshot properties.
 */
export interface BulletSnapshot extends EntityBase {
  readonly kind: "bullet";
  readonly ttl: number;
}

/**
 * Missile-specific snapshot properties.
 */
export interface MissileSnapshot extends EntityBase {
  readonly kind: "missile";
  readonly ttl: number;
}

/**
 * Asteroid-specific snapshot properties.
 */
export interface AsteroidSnapshot extends EntityBase {
  readonly kind: "asteroid";
}

/**
 * Pickup-specific snapshot properties.
 */
export interface PickupSnapshot extends EntityBase {
  readonly kind: "pickup";
}

/**
 * Explosion particle data.
 */
export interface ExplosionParticle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
  readonly maxLife: number;
}

/**
 * Explosion-specific snapshot properties.
 */
export interface ExplosionSnapshot extends EntityBase {
  readonly kind: "explosion";
  readonly particles: readonly ExplosionParticle[];
}

/**
 * Discriminated union of all entity snapshot kinds.
 * The `kind` field is the discriminant that TypeScript uses to narrow the type.
 */
export type EntitySnapshot =
  | ShipSnapshot
  | BulletSnapshot
  | MissileSnapshot
  | AsteroidSnapshot
  | PickupSnapshot
  | ExplosionSnapshot;

/**
 * Entity kinds as a const array for exhaustiveness checking.
 */
export const ENTITY_KINDS = [
  "ship",
  "bullet",
  "missile",
  "asteroid",
  "pickup",
  "explosion",
] as const;

/**
 * Entity kind literal type.
 */
export type EntityKind = (typeof ENTITY_KINDS)[number];

/**
 * Entity input type for the update method.
 */
export interface EntityInput {
  thrust: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fire: boolean;
  switchWeapon: boolean;
}

/**
 * Base entity class with mutable state for simulation.
 * Snapshots are readonly data structures; this class handles the mutable simulation state.
 */
export class Entity {
  #hp: number;

  public id: EntityId;
  public pos: Vector2;
  public vel: Vector2;
  public angle: number;
  public radius: number;
  public readonly kind: EntityKind;
  public alive: boolean;
  public readonly behaviors: Array<{ update(entity: Entity, dt: number): void }>;

  // Ship-specific properties (populated by Ship subclass)
  thrust = false;
  weapon: "bullet" | "missile" = "bullet";
  missileCount = 0;
  fireCooldown = 0;
  invulnerabilityTimer = 0;

  // Projectile-specific properties (populated by Bullet/Missile subclasses)
  ttl = 0;

  // Explosion-specific properties (populated by Explosion subclass)
  particles?: readonly {
    pos: Vector2;
    vel: Vector2;
    life: number;
    maxLife: number;
  }[];

  constructor({
    pos,
    vel,
    angle = 0,
    radius = 10,
    kind = "entity" as EntityKind,
    hp = 1,
    id = asEntityId(0),
  }: {
    pos: Vector2;
    vel: Vector2;
    angle?: number;
    radius?: number;
    kind?: EntityKind;
    hp?: number;
    id?: EntityId;
  }) {
    this.id = id;
    this.pos = pos;
    this.vel = vel;
    this.angle = angle;
    this.radius = radius;
    this.kind = kind;
    this.#hp = hp;
    this.alive = true;
    this.behaviors = [];
  }

  get hp(): number {
    return this.#hp;
  }

  set hp(value: number) {
    this.#hp = Math.max(0, value);
    if (this.#hp === 0) {
      this.alive = false;
    }
  }

  takeDamage(amount: number): void {
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp === 0) {
      this.alive = false;
    }
  }

  resetHealth(): void {
    this.#hp = 3;
    this.alive = true;
  }

  /**
   * Update the entity for one simulation step.
   * Base implementation just integrates position and runs behaviors.
   * Subclasses should override this to add input handling and world interaction.
   */
  update(dt: number, _input: EntityInput, _world: World): void {
    this.pos = this.pos.add(this.vel.scale(dt));

    for (const behavior of this.behaviors) {
      behavior.update(this, dt);
    }
  }

  /**
   * Convert this entity to a readonly snapshot for network transmission.
   * The returned object is a plain data structure with no methods.
   */
  toSnapshot(): EntitySnapshot {
    const base: EntityBase = {
      id: this.id,
      kind: this.kind,
      x: this.pos.x,
      y: this.pos.y,
      angle: this.angle,
      radius: this.radius,
      hp: this.hp,
      alive: this.alive,
    };

    // Dispatch on kind to add kind-specific fields
    switch (this.kind) {
      case "ship":
        return {
          ...base,
          kind: "ship" as const,
          thrust: this.thrust,
          weapon: this.weapon,
          missileCount: this.missileCount,
          fireCooldown: this.fireCooldown,
          invulnerabilityTimer: this.invulnerabilityTimer,
        };
      case "bullet":
      case "missile":
        return {
          ...base,
          kind: this.kind,
          ttl: this.ttl,
        };
      case "explosion":
        return {
          ...base,
          kind: "explosion" as const,
          particles: this.particles?.map((p) => ({
            x: p.pos.x,
            y: p.pos.y,
            vx: p.vel.x,
            vy: p.vel.y,
            life: p.life,
            maxLife: p.maxLife,
          })) ?? [],
        };
      case "asteroid":
      case "pickup":
        // Asteroid/pickup have no extra snapshot properties; base is the full snapshot.
        return { ...base } as EntitySnapshot;
      default: {
        // Exhaustiveness check - will error if a new kind is added without handling
        const _exhaustive: never = this.kind;
        return _exhaustive;
      }
    }
  }

  /**
   * Reconstruct an entity from a snapshot.
   * Note: This creates a new entity with default velocity; callers should
   * restore velocity if needed (e.g., for projectiles).
   */
  static fromSnapshot(data: EntitySnapshot): Entity {
    const entity = new Entity({
      pos: new Vector2(data.x, data.y),
      vel: new Vector2(0, 0),
      angle: data.angle || 0,
      radius: data.radius,
      kind: data.kind,
      hp: data.hp,
      id: data.id,
    });
    entity.alive = data.alive;
    // Ensure hp is properly restored via setter
    entity.hp = data.hp;

    // Restore kind-specific properties
    switch (data.kind) {
      case "ship":
        entity.thrust = data.thrust ?? false;
        entity.weapon = data.weapon ?? "bullet";
        entity.missileCount = data.missileCount ?? 0;
        entity.fireCooldown = data.fireCooldown ?? 0;
        entity.invulnerabilityTimer = data.invulnerabilityTimer ?? 0;
        break;
      case "bullet":
      case "missile":
        entity.ttl = data.ttl ?? 0;
        break;
      case "explosion":
        entity.particles = data.particles?.map((p) => ({
          pos: new Vector2(p.x, p.y),
          vel: new Vector2(p.vx, p.vy),
          life: p.life,
          maxLife: p.maxLife,
        })) ?? [];
        break;
case "asteroid":
      case "pickup":
        // No additional properties
        break;
      default:
        // Exhaustiveness check - will error if a new kind is added without handling
        throw new Error(`Unknown entity kind: ${(data as { kind: string }).kind}`);
    }

    return entity;
  }
}

// Re-export branded types for convenience
export type { EntityId, Tick, Seq, Radians } from "./branded.js";

export { asEntityId, asTick, asSeq, asRadians, isEntityId, isTick, isSeq } from "./branded.js";

