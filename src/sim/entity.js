export class Entity {
    static #nextId = 1;

    #id;
    #hp;

    constructor({ pos, vel, angle = 0, radius = 10, kind = "entity", hp = 1 }) {
        this.#id = Entity.#nextId++;
        this.pos = pos;
        this.vel = vel;
        this.angle = angle;
        this.radius = radius;
        this.kind = kind;
        this.#hp = hp;
        this.alive = true;
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

    update(dt) {
        this.pos = this.pos.add(this.vel.scale(dt));
    }
}
