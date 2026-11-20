export class Entity {
    #hp;

    constructor({
        pos,
        vel,
        angle = 0,
        radius = 10,
        kind = "entity",
        hp = 1,
        id = 0,
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

    get hp() {
        return this.#hp;
    }

    set hp(value) {
        this.#hp = Math.max(0, value);
        if (this.#hp === 0) {
            this.alive = false;
        }
    }

    takeDamage(amount) {
        this.#hp = Math.max(0, this.#hp - amount);

        if (this.#hp === 0) {
            this.alive = false;
        }
    }

    resetHealth() {
        this.#hp = 3;
        this.alive = true;
    }

    update(dt) {
        this.pos = this.pos.add(this.vel.scale(dt));

        for (const behavior of this.behaviors) {
            behavior.update(this, dt);
        }
    }

    toSnapshot() {
        return {
            id: this.id,
            kind: this.kind,
            x: this.pos.x,
            y: this.pos.y,
            angle: this.angle,
            radius: this.radius,
            hp: this.hp,
            alive: this.alive,
        };
    }

    static fromSnapshot(data) {
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
        return entity;
    }
}

import { Vector2 } from "./vector.js";