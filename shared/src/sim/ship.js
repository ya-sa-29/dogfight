
import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";
import { Bullet } from "./bullet.js";
import { Missile } from "./missile.js";

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

        this.weapon = "bullet";
        this.missileCount = 0;
    }

    simulateMovement(dt, input = {}) {
        const rotationSpeed = 3;
        const acceleration = 200;
        const drag = 0.98;
        const maxSpeed = 300;

        const turn = Math.max(-1, Math.min(1, input.turn ?? 0));
        const thrust = Boolean(input.thrust);

        this.invulnerabilityTimer = Math.max(
            0,
            this.invulnerabilityTimer - dt,
        );

        this.angle += turn * rotationSpeed * dt;
        this.thrust = thrust;

        if (this.thrust) {
            const direction = Vector2.fromAngle(this.angle);

            this.vel = this.vel.add(
                direction.scale(acceleration * dt),
            );
        }

        this.vel = this.vel.scale(drag);

        const speed = this.vel.length;

        if (speed > maxSpeed) {
            this.vel = this.vel.normalize().scale(maxSpeed);
        }

        this.pos = this.pos.add(this.vel.scale(dt));
    }

    update(dt, input = {}, world) {
        this.simulateMovement(dt, input);

        for (const behavior of this.behaviors) {
            behavior.update(this, dt, world);
        }

        this.fireCooldown = Math.max(
            0,
            this.fireCooldown - dt,
        );

        // A fire command is a one-shot event.
        // Never queue it while the weapon is on cooldown.
        if (
            !input.fire ||
            !input.clientShotId ||
            this.fireCooldown > 0
        ) {
            return;
        }

        const shot = {
            playerId: input.playerId ?? null,
            clientShotId: input.clientShotId,
        };

        if (this.weapon === "bullet") {
            this.fire(world, shot);
            this.fireCooldown = 0.25;
        } else if (this.weapon === "missile") {
            const launched = this.fireMissile(world, shot);

            if (launched) {
                this.missileCount -= 1;
                this.fireCooldown = 0.5;

                if (this.missileCount <= 0) {
                    this.weapon = "bullet";
                }
            }
        }
    }

    takeDamage(amount) {
        if (this.invulnerabilityTimer > 0) return;

        super.takeDamage(amount);
        this.invulnerabilityTimer = 1;
    }

    fire(world, shot) {
        const direction = Vector2.fromAngle(this.angle);
        const nose = this.pos.add(direction.scale(this.radius));
        const bulletVelocity = this.vel.add(direction.scale(450));

        world.spawn(
            new Bullet(
                nose,
                bulletVelocity,
                this.angle,
                1.5,
                shot,
            ),
        );

        world.events.push({
            type: "fired",
            weapon: "bullet",
            position: { x: nose.x, y: nose.y },
            playerId: shot.playerId,
            clientShotId: shot.clientShotId,
        });
    }

    fireMissile(world, shot) {
        const target = world.ofKind("asteroid").next().value;

        if (!target) return false;

        const direction = Vector2.fromAngle(this.angle);
        const nose = this.pos.add(direction.scale(this.radius));
        const missileVelocity = this.vel.add(direction.scale(250));

        world.spawn(
            new Missile(
                nose,
                missileVelocity,
                this.angle,
                target.id,
                4,
                shot,
            ),
        );

        world.events.push({
            type: "fired",
            weapon: "missile",
            position: { x: nose.x, y: nose.y },
            playerId: shot.playerId,
            clientShotId: shot.clientShotId,
        });

        return true;
    }
}
