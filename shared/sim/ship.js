import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";
import { Bullet } from "./bullet.js";
import { Missile } from "./missile.js";

export class Ship extends Entity {
    constructor(x = 400, y = 300, id = 0) {
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

    update(dt, input, world) {
        const rotationSpeed = 3;
        const acceleration = 200;
        const drag = 0.98;
        const maxSpeed = 300;

        this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt);

        if (input.turnLeft) {
            this.angle -= rotationSpeed * dt;
        }

        if (input.turnRight) {
            this.angle += rotationSpeed * dt;
        }

        this.thrust = input.thrust;

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

        if (input.switchWeapon) {
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

        const projectiles = [];

        if (input.fire && this.fireCooldown === 0) {
            if (this.weapon === "bullet") {
                const bullet = this.createBullet();
                projectiles.push(bullet);
                this.fireCooldown = 0.25;
            } else if (this.weapon === "missile") {
                const missile = this.createMissile(world);
                if (missile) {
                    projectiles.push(missile);
                    this.missileCount -= 1;
                    this.fireCooldown = 0.5;

                    if (this.missileCount <= 0) {
                        this.weapon = "bullet";
                    }
                }
            }
        }

        return projectiles;
    }

    createBullet() {
        const direction = Vector2.fromAngle(this.angle);
        const nose = this.pos.add(direction.scale(this.radius));
        const bulletVelocity = this.vel.add(direction.scale(450));

        return new Bullet(nose, bulletVelocity, this.angle);
    }

    createMissile(world) {
        const target = world.ofKind("asteroid").next().value;

        if (!target) return null;

        const direction = Vector2.fromAngle(this.angle);
        const nose = this.pos.add(direction.scale(this.radius));
        const missileVelocity = this.vel.add(direction.scale(250));

        return new Missile(nose, missileVelocity, this.angle, target);
    }

    takeDamage(amount) {
        if (this.invulnerabilityTimer > 0) return;

        super.takeDamage(amount);
        this.invulnerabilityTimer = 1;
    }

    toSnapshot() {
        return {
            ...super.toSnapshot(),
            thrust: this.thrust,
            weapon: this.weapon,
            missileCount: this.missileCount,
            fireCooldown: this.fireCooldown,
            invulnerabilityTimer: this.invulnerabilityTimer,
        };
    }

    static fromSnapshot(data) {
        const ship = new Ship(data.x, data.y, data.id);
        ship.angle = data.angle;
        ship.vel = new Vector2(0, 0); // Will be set from snapshot if needed
        ship.thrust = data.thrust || false;
        ship.weapon = data.weapon || "bullet";
        ship.missileCount = data.missileCount || 0;
        ship.fireCooldown = data.fireCooldown || 0;
        ship.invulnerabilityTimer = data.invulnerabilityTimer || 0;
        ship.alive = data.alive;
        ship.hp = data.hp; // Note: hp is private, need to handle
        return ship;
    }
}
