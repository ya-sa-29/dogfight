import { resolveCollisions, CollisionEvent } from "./collision";
import { Entity, EntityId, EntitySnapshot, EntityInput } from "./entity";
import { asEntityId } from "./branded";
import { Ship } from "./ship";

/**
 * Neutral input used when no input is available for an entity.
 */
export const NEUTRAL_INPUT: EntityInput = Object.freeze({
  thrust: false,
  turnLeft: false,
  turnRight: false,
  fire: false,
  switchWeapon: false,
});

/**
 * Input can be either a single input object (legacy, applied to all entities)
 * or a Map<entityId, Input> for per-entity inputs.
 */
export type InputMap = Map<EntityId, EntityInput>;

/**
 * Authoritative game world simulation.
 * Runs deterministically given the same inputs and seed.
 */
export class World {
  #entities = new Map<EntityId, Entity>();
  #pendingRemoval = new Set<EntityId>();
  #nextEntityId: EntityId = asEntityId(1);

  score = 0;

  /**
   * Spawn an entity in the world.
   * If entity has no ID or ID collides, assign a fresh unique ID.
   * The ID assignment is deterministic for identical simulation runs.
   */
  spawn(entity: Entity): Entity {
    if (
      entity.id === undefined ||
      entity.id === null ||
      this.#entities.has(entity.id)
    ) {
      do {
        entity.id = this.#nextEntityId;
        this.#nextEntityId = asEntityId(this.#nextEntityId + 1);
      } while (this.#entities.has(entity.id));
    }

    this.#entities.set(entity.id, entity);
    return entity;
  }

  /**
   * Mark an entity for removal at the end of the current step.
   */
  despawn(id: EntityId): void {
    const entity = this.#entities.get(id);

    if (entity) {
      entity.alive = false;
      this.#pendingRemoval.add(id);
    }
  }

  /**
   * Get an entity by ID.
   */
  get(id: EntityId): Entity | undefined {
    return this.#entities.get(id);
  }

  /**
   * Get a ship by ID.
   */
  getShip(id: EntityId): Ship | undefined {
    const entity = this.#entities.get(id);
    return entity instanceof Ship ? entity : undefined;
  }

  /**
   * Iterate over alive entities of a specific kind.
   */
  *ofKind(kind: Entity["kind"]): Generator<Entity, void, unknown> {
    for (const entity of this.#entities.values()) {
      if (entity.alive && entity.kind === kind) {
        yield entity;
      }
    }
  }

  /**
   * Iterate over all entities (alive and dead).
   */
  [Symbol.iterator](): IterableIterator<Entity> {
    return this.#entities.values();
  }

  /**
   * Remove all entities marked for despawn.
   */
  sweep(): void {
    for (const id of this.#pendingRemoval) {
      this.#entities.delete(id);
    }
    this.#pendingRemoval.clear();
  }

  /**
   * Step the simulation forward by dt seconds.
   * @param dt - Time step in seconds
   * @param inputs - Either a single input object or Map<entityId, Input>
   * @returns Array of collision events that occurred during this step
   */
  step(dt: number, inputs: EntityInput | InputMap): CollisionEvent[] {
    // Snapshot the entity list so entities spawned during this step
    // (e.g., projectiles created by a ship) are not visited by the same
    // update pass. They join the world immediately and are simulated from
    // the next step onward.
    const entities = [...this.#entities.values()];

    const isPerEntityInputs = inputs instanceof Map;

    for (const entity of entities) {
      if (entity.alive) {
        // Entities without a mapped input (e.g., when a caller passes a
        // partial Map) receive a neutral input so that Ship.update never
        // dereferences undefined.
        const entityInput =
          (isPerEntityInputs ? inputs.get(entity.id) : inputs) ?? NEUTRAL_INPUT;

        const spawned = entity.update(dt, entityInput, this);

        // Ship.update() returns the projectiles it created this step.
        // Spawn them so they exist in the world, appear in snapshots
        // and are simulated from the next step onward.
        if (Array.isArray(spawned)) {
          for (const projectile of spawned) {
            this.spawn(projectile);
          }
        }
      }
    }

    const collisionEvents = resolveCollisions(this);
    this.sweep();

    return collisionEvents;
  }

  /**
   * Get a snapshot of all alive entities for network transmission.
   * @returns Array of readonly entity snapshots
   */
  getEntitiesSnapshot(): EntitySnapshot[] {
    const snapshots: EntitySnapshot[] = [];
    for (const entity of this.#entities.values()) {
      if (entity.alive) {
        snapshots.push(entity.toSnapshot());
      }
    }
    return snapshots;
  }
}


