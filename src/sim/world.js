import { circlesOverlap } from "./collision.js";

export class World {
    #entities = new Map();
    #pendingRemoval = new Set();

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
            if (entity.alive) entity.update(dt, inputs, this);
        }

        this.resolveCollisions();
        this.sweep();
    }

    resolveCollisions() {
        const entities = [...this.#entities.values()];

        for (let i = 0; i < entities.length; i++) {
            const a = entities[i];

            if (!a.alive) continue;

            for (let j = i + 1; j < entities.length; j++) {
                const b = entities[j];

                if (!b.alive) continue;
                if (!circlesOverlap(a, b)) continue;

                if (a.kind === "bullet" && b.kind === "asteroid") {
                    b.takeDamage(1);
                    this.despawn(a.id);
                } else if (a.kind === "asteroid" && b.kind === "bullet") {
                    a.takeDamage(1);
                    this.despawn(b.id);
                } else if (a.kind === "ship" && b.kind === "asteroid") {
                    a.takeDamage(1);
                } else if (a.kind === "asteroid" && b.kind === "ship") {
                    b.takeDamage(1);
                }
            }
        }
    }
}
