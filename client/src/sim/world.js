import { resolveCollisions } from "./collision.js";

export class World {
    #entities = new Map();
    #pendingRemoval = new Set();

    score = 0;

    spawn(entity) {
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
        const entities = [...this.#entities.values()];

        for (const entity of entities) {
            if (entity.alive) {
                entity.update(dt, inputs, this);
            }
        }

        resolveCollisions(this);
        this.sweep();
    }
}
