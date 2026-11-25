import { Entity, EntityId, EntitySnapshot, EntityInput } from "./entity";
import { Vector2 } from "./vector";
import { World } from "./world";
import { asEntityId } from "./branded";

/**
 * Bullet entity - fast projectile fired by ships.
 */
export class Bullet extends Entity {
  constructor(pos: Vector2, vel: Vector2, angle: number, ttl = 1.5, id = asEntityId(0)) {
    super({
      pos,
      vel,
      angle,
      radius: 3,
      kind: "bullet",
      hp: 1,
      id,
    });

    this.ttl = ttl;
  }

  override update(dt: number, _input: EntityInput, world: World): void {
    super.update(dt, _input, world);

    this.ttl -= dt;

    if (this.ttl <= 0) {
      world.despawn(this.id);
    }
  }

  /**
   * Create a new Bullet from a snapshot.
   */
  static override fromSnapshot(data: EntitySnapshot): Bullet {
    if (data.kind !== "bullet") {
      throw new Error("Cannot create Bullet from non-bullet snapshot");
    }

    const bullet = new Bullet(
      new Vector2(data.x, data.y),
      new Vector2(0, 0),
      data.angle,
      data.ttl,
      data.id,
    );
    bullet.alive = data.alive;
    return bullet;
  }
}


