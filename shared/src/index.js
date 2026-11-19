export { Vector2 } from "./sim/vector.js";
export { Entity } from "./sim/entity.js";
export { World } from "./sim/world.js";

export { Ship } from "./sim/ship.js";
export { Asteroid } from "./sim/asteroid.js";
export { Bullet } from "./sim/bullet.js";
export { Missile } from "./sim/missile.js";
export { Pickup } from "./sim/pickup.js";

export { wrapShip } from "./sim/arena.js";
export { createHomingBehavior } from "./sim/homing.js";

export {
    circlesOverlap,
    resolveCollisions,
} from "./sim/collision.js";

export {
    CLIENT_MESSAGE_TYPES,
    SERVER_MESSAGE_TYPES,
} from "./protocol/messages.js";

export {
    ProtocolValidationError,
    validateClientMessage,
} from "./protocol/validation.js";

export {
    encodeJsonMessage,
    decodeJsonMessage,
} from "./codec/json.js";