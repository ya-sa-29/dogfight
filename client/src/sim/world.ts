import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";
import { Ship } from "./ship.js";
import { resolveCollisions } from "./collision.js";

interface EntityInput {
    thrust: boolean;
    turnLeft: boolean;
    turnRight: boolean;
    fire: boolean;
    switchWeapon: boolean;
}

interface EntitySnapshot {
    id: number;
    kind: string;
    x: number;
    y: number;
    angle?: number;
    radius?: number;
    hp?: number;
    alive?: boolean;
    thrust?: boolean;
    weapon?: "bullet" | "missile";
    missileCount?: number;
    fireCooldown?: number;
    invulnerabilityTimer?: number;
    ttl?: number;
    particles?: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[];
}

interface ShipEntity extends Entity {
    thrust: boolean;
    weapon: "bullet" | "missile";
    missileCount: number;
    fireCooldown: number;
    invulnerabilityTimer: number;
}

interface ProjectileEntity extends Entity {
    ttl: number;
}

interface ExplosionEntity extends Entity {
    particles: { pos: Vector2; vel: Vector2; life: number; maxLife: number }[];
}

export class World {
    #entities = new Map<number, Entity>();
    #pendingRemoval = new Set<number>();

    score = 0;

    spawn(entity: Entity): Entity {
        this.#entities.set(entity.id, entity);
        return entity;
    }

    despawn(id: number): void {
        const entity = this.#entities.get(id);

        if (entity) {
            entity.alive = false;
            this.#pendingRemoval.add(id);
        }
    }

    get(id: number): Entity | undefined {
        return this.#entities.get(id);
    }

    getShip(id: number): Ship | undefined {
        const entity = this.#entities.get(id);
        return entity instanceof Ship ? entity : undefined;
    }

    *ofKind(kind: string): Generator<Entity> {
        for (const entity of this.#entities.values()) {
            if (entity.alive && entity.kind === kind) {
                yield entity;
            }
        }
    }

    [Symbol.iterator](): IterableIterator<Entity> {
        return this.#entities.values();
    }

    sweep(): void {
        for (const id of this.#pendingRemoval) {
            this.#entities.delete(id);
        }

        this.#pendingRemoval.clear();
    }

    step(dt: number, inputs: Map<number, EntityInput>): void {
        const entities = [...this.#entities.values()];

        for (const entity of entities) {
            if (entity.alive) {
                const input = inputs.get(entity.id);
                entity.update(dt, input ?? {}, this);
            }
        }

        resolveCollisions(this);
        this.sweep();
    }

    getEntitiesSnapshot(): EntitySnapshot[] {
        return [...this.#entities.values()].map((entity) => {
            const base = {
                id: entity.id,
                kind: entity.kind,
                x: entity.pos.x,
                y: entity.pos.y,
                angle: entity.angle,
                radius: entity.radius,
                hp: entity.hp,
                alive: entity.alive,
            };

            if (entity.kind === "ship") {
                const ship = entity as ShipEntity;
                return {
                    ...base,
                    thrust: ship.thrust,
                    weapon: ship.weapon,
                    missileCount: ship.missileCount,
                    fireCooldown: ship.fireCooldown,
                    invulnerabilityTimer: ship.invulnerabilityTimer,
                };
            }

            if (entity.kind === "bullet" || entity.kind === "missile") {
                const projectile = entity as ProjectileEntity;
                return {
                    ...base,
                    ttl: projectile.ttl,
                };
            }

            if (entity.kind === "explosion") {
                const explosion = entity as ExplosionEntity;
                return {
                    ...base,
                    particles: explosion.particles.map((p) => ({
                        x: p.pos.x,
                        y: p.pos.y,
                        vx: p.vel.x,
                        vy: p.vel.y,
                        life: p.life,
                        maxLife: p.maxLife,
                    })),
                };
            }

            return base;
        });
    }
}