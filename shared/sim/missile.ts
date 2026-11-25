import { Entity, EntityId, EntitySnapshot, EntityInput } from "./entity";
import { Vector2 } from "./vector";
import { World } from "./world";
import { createHomingBehavior } from "./homing";
import { asEntityId } from "./branded";

/**
 * Missile entity - homing projectile that tracks asteroids.
 */
export class Missile extends Entity {
  constructor(pos: Vector2, vel: Vector2, angle: number, target: Entity | null, ttl = 4, id = asEntityId(0)) {
    super({
      pos,
      vel,
      angle,
      radius: 6,
      kind: "missile",
      hp: 1,
      id,
    });

    this.ttl = ttl;

    if (target) {
      this.behaviors.push(createHomingBehavior(target));
    }
  }

  override update(dt: number, _input: EntityInput, world: World): void {
    super.update(dt, _input, world);

    this.ttl -= dt;

    if (this.ttl <= 0) {
      world.despawn(this.id);
    }
  }

  /**
   * Create a new Missile from a snapshot.
   * Note: The homing target is not restored from snapshot (it's transient).
   */
  static override fromSnapshot(data: EntitySnapshot): Missile {
    if (data.kind !== "missile") {
      throw new Error("Cannot create Missile from non-missile snapshot");
    }

    const missile = new Missile(
      new Vector2(data.x, data.y),
      new Vector2(0, 0),
      data.angle,
      null,
      data.ttl,
      data.id,
    );
    missile.alive = data.alive;
    return missile;
  }
}


