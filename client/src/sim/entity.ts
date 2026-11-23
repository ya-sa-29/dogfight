/**
 * Base entity class for game simulation.
 * Entities have position, velocity, angle, radius, kind, and health.
 */
import { Vector2 } from "./vector.js";

export class Entity {
    static #nextId = 1;

    #id: number;
    #hp: number;

    pos: Vector2;
    vel: Vector2;
    angle: number;
    radius: number;
    kind: string;
    alive: boolean;
    behaviors: Array<{ update(entity: Entity, dt: number): void }>;

    /**
     * Create a new entity.
     * @param pos - Position vector
     * @param vel - Velocity vector
     * @param angle - Rotation angle in radians (default 0)
     * @param radius - Collision radius (default 10)
     * @param kind - Entity kind identifier (default "entity")
     * @param hp - Health points (default 1)
     * @param id - Optional explicit ID (used for deserialization)
     */
    constructor({
        pos,
        vel,
        angle = 0,
        radius = 10,
        kind = "entity",
        hp = 1,
        id,
    }: {
        pos: Vector2;
        vel: Vector2;
        angle?: number;
        radius?: number;
        kind?: string;
        hp?: number;
        id?: number;
    }) {
        this.#id = id ?? Entity.#nextId++;
        this.pos = pos;
        this.vel = vel;
        this.angle = angle;
        this.radius = radius;
        this.kind = kind;
        this.#hp = hp;
        this.alive = true;

        this.behaviors = [];
    }

    get id(): number {
        return this.#id;
    }

    get hp(): number {
        return this.#hp;
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

    setHp(value: number): void {
        this.#hp = Math.max(0, value);
        if (this.#hp === 0) {
            this.alive = false;
        }
    }

    update(dt: number, _input?: unknown, _world?: World): void {
        this.pos = this.pos.add(this.vel.scale(dt));

        for (const behavior of this.behaviors) {
            behavior.update(this, dt);
        }
    }
}

// Forward reference for World used in update signature
interface World {
    despawn(id: number): void;
    spawn(entity: Entity): Entity;
}