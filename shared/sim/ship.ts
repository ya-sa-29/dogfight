import { Entity, EntityId, EntitySnapshot, EntityInput } from "./entity.js";
import { Vector2 } from "./vector.js";
import { Bullet } from "./bullet.js";
import { Missile } from "./missile.js";
import { World } from "./world.js";
import { asEntityId } from "./branded.js";

/**
 * Ship entity - player-controlled spacecraft.
 * Extends Entity with ship-specific state and behavior.
 */
export class Ship extends Entity {
  constructor(x = 400, y = 300, id = asEntityId(0)) {
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

  /**
   * Ship input interface - matches the input message structure.
   */
  static readonly InputShape = {
    thrust: false,
    turnLeft: false,
    turnRight: false,
    fire: false,
    switchWeapon: false,
  } as const;

  /**
   * Update the ship for one simulation step.
   * @param dt - Time step in seconds
   * @param input - Player input for this step
   * @param world - World reference for spawning projectiles and finding targets
   * @returns Array of newly spawned projectiles (bullets or missiles)
   */
  override update(dt: number, input: ShipInput, world: World): Array<Bullet | Missile> {
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

    super.update(dt, input, world);

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

    const projectiles: Array<Bullet | Missile> = [];

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

  createBullet(): Bullet {
    const direction = Vector2.fromAngle(this.angle);
    const nose = this.pos.add(direction.scale(this.radius));
    const bulletVelocity = this.vel.add(direction.scale(450));

    return new Bullet(nose, bulletVelocity, this.angle);
  }

  createMissile(world: World): Missile | null {
    const target = world.ofKind("asteroid").next().value;

    if (!target) return null;

    const direction = Vector2.fromAngle(this.angle);
    const nose = this.pos.add(direction.scale(this.radius));
    const missileVelocity = this.vel.add(direction.scale(250));

    return new Missile(nose, missileVelocity, this.angle, target);
  }

  override takeDamage(amount: number): void {
    if (this.invulnerabilityTimer > 0) return;

    super.takeDamage(amount);
    this.invulnerabilityTimer = 1;
  }

  /**
   * Create a new Ship from a snapshot.
   */
  static override fromSnapshot(data: EntitySnapshot): Ship {
    if (data.kind !== "ship") {
      throw new Error("Cannot create Ship from non-ship snapshot");
    }

    const ship = new Ship(data.x, data.y, data.id);
    ship.angle = data.angle;
    ship.vel = new Vector2(0, 0); // Will be set from snapshot if needed
    ship.thrust = data.thrust ?? false;
    ship.weapon = data.weapon ?? "bullet";
    ship.missileCount = data.missileCount ?? 0;
    ship.fireCooldown = data.fireCooldown ?? 0;
    ship.invulnerabilityTimer = data.invulnerabilityTimer ?? 0;
    ship.alive = data.alive;
    ship.hp = data.hp; // Note: hp is private in Entity, setter handles it
    return ship;
  }
}

export type ShipInput = typeof Ship.InputShape;


