
export class Entity {
    static #nextId = 1;

    #id;
    #hp;

    constructor({
        id,
        pos,
        vel,
        angle = 0,
        radius = 10,
        kind = "entity",
        hp = 1,
    }) {
        this.#id = id ?? Entity.#nextId++;

        if (id !== undefined && id >= Entity.#nextId) {
            Entity.#nextId = id + 1;
        }

        this.pos = pos;
        this.vel = vel;
        this.angle = angle;
        this.radius = radius;
        this.kind = kind;
        this.#hp = hp;
        this.alive = true;

        this.behaviors = [];
    }

    get id() {
        return this.#id;
    }

    get hp() {
        return this.#hp;
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

    update(dt, input, world) {
        this.pos = this.pos.add(this.vel.scale(dt));

        for (const behavior of this.behaviors) {
            behavior.update(this, dt, world);
        }
    }
}
