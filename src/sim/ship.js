import { Entity } from "./entity.js";
import { Vector2 } from "./Vector.js";
import { Bullet } from "./bullet.js";

export class Ship extends Entity {
    constructor(x = 400, y = 300) {
        super({
            pos: new Vector2(x, y),
            vel: new Vector2(),
            angle: 0,
            radius: 15,
            kind: "ship",
            hp: 3,
        });

        this.thrust = false;
        this.fireCooldown = 0;
        this.invulnerabilityTimer = 0;
    }

    update(dt, input, world) {
        const rotationSpeed = 3;
        const acceleration = 200;
        const drag = 0.98;
        const maxSpeed = 300;

        this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt);

        if (input.isDown("ArrowLeft") || input.isDown("KeyA")) {
            this.angle -= rotationSpeed * dt;
        }

        if (input.isDown("ArrowRight") || input.isDown("KeyD")) {
            this.angle += rotationSpeed * dt;
        }

        this.thrust = input.isDown("ArrowUp") || input.isDown("KeyW");

        if (this.thrust) {
            const direction = Vector2.fromAngle(this.angle);
            this.vel = this.vel.add(direction.scale(acceleration * dt));
        }

        this.vel = this.vel.scale(drag);

        const speed = this.vel.length;

        if (speed > maxSpeed) {
            this.vel = this.vel.normalize().scale(maxSpeed);
        }

        super.update(dt);

        this.fireCooldown = Math.max(0, this.fireCooldown - dt);

        if (input.isDown("Space") && this.fireCooldown === 0) {
            this.fire(world);
            this.fireCooldown = 0.25;
        }
    }

    takeDamage(amount) {
        if (this.invulnerabilityTimer > 0) return;

        super.takeDamage(amount);
        this.invulnerabilityTimer = 1;
    }

    fire(world) {
        const direction = Vector2.fromAngle(this.angle);
        const nose = this.pos.add(direction.scale(this.radius));
        const bulletVelocity = this.vel.add(direction.scale(450));

        world.spawn(new Bullet(nose, bulletVelocity, this.angle));
    }
}
