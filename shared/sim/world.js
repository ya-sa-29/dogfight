import { resolveCollisions } from "./collision.js";

const NEUTRAL_INPUT = Object.freeze({
    thrust: false,
    turnLeft: false,
    turnRight: false,
    fire: false,
    switchWeapon: false,
});

export class World {
    #entities = new Map();
    #pendingRemoval = new Set();
    #nextEntityId = 1;

    score = 0;

    spawn(entity) {
        // Entities created without an explicit id (for example projectiles)
        // default to 0, which would collide with the pickup and with each
        // other. Assign a fresh unique id whenever the requested one is
        // missing or already taken. The scan is deterministic, so two worlds
        // stepped identically assign identical ids.
        if (
            entity.id === undefined ||
            entity.id === null ||
            this.#entities.has(entity.id)
        ) {
            do {
                entity.id = this.#nextEntityId;
                this.#nextEntityId += 1;
            } while (this.#entities.has(entity.id));
        }

        this.#entities.set(entity.id, entity);
        return entity;
    }

    despawn(id) {
        const entity = this.#entities.get(id);

        if (entity) {
            entity.alive = false;
            this.#pendingRemoval.add(id);
        }
    }

    get(id) {
        return this.#entities.get(id);
    }

    *ofKind(kind) {
        for (const entity of this.#entities.values()) {
            if (entity.alive && entity.kind === kind) {
                yield entity;
            }
        }
    }

    [Symbol.iterator]() {
        return this.#entities.values();
    }

    sweep() {
        for (const id of this.#pendingRemoval) {
            this.#entities.delete(id);
        }

        this.#pendingRemoval.clear();
    }

    step(dt, inputs) {
        // Snapshot the entity list so entities spawned during this step (for
        // example projectiles created by a ship) are not visited by the same
        // update pass. They join the world immediately and are simulated from
        // the next step onward.
        const entities = [...this.#entities.values()];

        // inputs can be either:
        // - a single input object (legacy, applied to all entities)
        // - a Map<entityId, Input> for per-entity inputs
        const isPerEntityInputs = inputs instanceof Map;

        for (const entity of entities) {
            if (entity.alive) {
                // Entities without a mapped input (for example when a caller
                // passes a partial Map) receive a neutral input so that
                // Ship.update never dereferences undefined.
                const entityInput =
                    (isPerEntityInputs ? inputs.get(entity.id) : inputs) ??
                    NEUTRAL_INPUT;

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

    getEntitiesSnapshot() {
        const snapshots = [];
        for (const entity of this.#entities.values()) {
            if (entity.alive) {
                snapshots.push(entity.toSnapshot());
            }
        }
        return snapshots;
    }
}
