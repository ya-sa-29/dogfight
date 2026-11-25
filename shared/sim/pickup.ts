import { Entity, EntityId, EntitySnapshot } from "./entity";
import { Vector2 } from "./vector";
import { asEntityId } from "./branded";

/**
 * Pickup entity - grants missiles when collected by a ship.
 */
export class Pickup extends Entity {
  constructor(pos: Vector2, id = asEntityId(0)) {
    super({
      pos,
      vel: new Vector2(),
      radius: 12,
      kind: "pickup",
      hp: 1,
      id,
    });
  }

  /**
   * Create a new Pickup from a snapshot.
   */
  static override fromSnapshot(data: EntitySnapshot): Pickup {
    if (data.kind !== "pickup") {
      throw new Error("Cannot create Pickup from non-pickup snapshot");
    }

    const pickup = new Pickup(new Vector2(data.x, data.y), data.id);
    pickup.alive = data.alive;
    return pickup;
  }
}


