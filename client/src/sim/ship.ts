import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";
import { Bullet } from "./bullet.js";
import { Missile } from "./missile.js";
import { World } from "./world.js";
import { bus } from "../events/gameEvents.js";

export class Ship extends Entity {
    thrust: boolean;
    fireCooldown: number;
    invulnerabilityTimer: number;
    weapon: "bullet" | "missile";
    missileCount: number;

    constructor(x = 400, y = 300, id?: number) {
        super({
            pos: new Vector2(x, y),
            vel: new Vector2(),
            angle: 0,
            radius: 15,
            kind: "ship",
            hp: 3,
            id,
        });

        this.thrust = false;
        this.fireCooldown = 0;
        this.invulnerabilityTimer = 0;

        this.weapon = "bullet";
        this.missileCount = 0;
    }

    override update(dt: number, input: { isDown(key: string): boolean; justPressed(key: string): boolean }, world: World): void {
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

        if (input.justPressed("KeyE")) {
            if (this.weapon === "bullet" && this.missileCount > 0) {
                this.weapon = "missile";
            } else {
                this.weapon = "bullet";
            }
        }

        if (this.missileCount <= 0) {
            this.weapon = "bullet";
        }

        this.fireCooldown = Math.max(0, this.fireCooldown - dt);

        if (input.isDown("Space") && this.fireCooldown === 0) {
            if (this.weapon === "bullet") {
                this.fire(world);
                this.fireCooldown = 0.25;
            } else if (this.weapon === "missile") {
                const launched = this.fireMissile(world);

                if (launched) {
                    this.missileCount -= 1;
                    this.fireCooldown = 0.5;

                    if (this.missileCount <= 0) {
                        this.weapon = "bullet";
                    }
                }
            }
        }
    }

    override takeDamage(amount: number): void {
        if (this.invulnerabilityTimer > 0) return;

        super.takeDamage(amount);
        this.invulnerabilityTimer = 1;
    }

    fire(world: World): void {
        const direction = Vector2.fromAngle(this.angle);
        const nose = this.pos.add(direction.scale(this.radius));
        const bulletVelocity = this.vel.add(direction.scale(450));

        world.spawn(new Bullet(nose, bulletVelocity, this.angle));
        bus.emit("fired", { weapon: "bullet" });
    }

    fireMissile(world: World): boolean {
        const target = world.ofKind("asteroid").next().value;

        if (!target) return false;

        const direction = Vector2.fromAngle(this.angle);
        const nose = this.pos.add(direction.scale(this.radius));
        const missileVelocity = this.vel.add(direction.scale(250));

        world.spawn(new Missile(nose, missileVelocity, this.angle, target));
        bus.emit("fired", { weapon: "missile" });

        return true;
    }
}