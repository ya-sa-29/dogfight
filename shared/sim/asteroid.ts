import { Entity, EntityId, EntitySnapshot } from "./entity";
import { Vector2 } from "./vector";
import { asEntityId } from "./branded";

/**
 * Asteroid entity - destructible obstacle that can be shot for points.
 */
export class Asteroid extends Entity {
  constructor(pos: Vector2, vel: Vector2, radius = 25, id = asEntityId(0)) {
    super({
      pos,
      vel,
      radius,
      kind: "asteroid",
      hp: 2,
      id,
    });
  }

  /**
   * Create a new Asteroid from a snapshot.
   */
  static override fromSnapshot(data: EntitySnapshot): Asteroid {
    if (data.kind !== "asteroid") {
      throw new Error("Cannot create Asteroid from non-asteroid snapshot");
    }

    const asteroid = new Asteroid(
      new Vector2(data.x, data.y),
      new Vector2(0, 0),
      data.radius,
      data.id,
    );
    asteroid.alive = data.alive;
    asteroid.hp = data.hp;
    return asteroid;
  }
}


