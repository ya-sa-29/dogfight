
import {
    Bullet,
    Vector2,
} from "@dogfight/shared";

export function createPredictedBullets() {
    const bullets = new Map();

    function spawn({ ship, playerId, clientShotId }) {
        if (
            !ship ||
            !Number.isFinite(ship.pos?.x) ||
            !Number.isFinite(ship.pos?.y) ||
            !Number.isFinite(ship.vel?.x) ||
            !Number.isFinite(ship.vel?.y) ||
            !Number.isFinite(ship.angle) ||
            typeof clientShotId !== "string" ||
            clientShotId.length === 0
        ) {
            return false;
        }

        if (bullets.has(clientShotId)) {
            return false;
        }

        const direction = Vector2.fromAngle(ship.angle);

        const shipPosition = new Vector2(
            ship.pos.x,
            ship.pos.y,
        );

        const shipVelocity = new Vector2(
            ship.vel.x,
            ship.vel.y,
        );

        const position = shipPosition.add(
            direction.scale(ship.radius ?? 15),
        );

        const velocity = shipVelocity.add(
            direction.scale(450),
        );

        const bullet = new Bullet(
            position,
            velocity,
            ship.angle,
            1.5,
            {
                playerId,
                clientShotId,
            },
        );

        bullets.set(clientShotId, bullet);

        return true;
    }

    function update(dt) {
        if (!Number.isFinite(dt) || dt < 0) {
            return;
        }

        for (const [clientShotId, bullet] of bullets) {
            bullet.update(dt, {}, {
                despawn() {
                    bullet.alive = false;
                },
            });

            if (!bullet.alive) {
                bullets.delete(clientShotId);
            }
        }
    }

    function reconcile(serverEntities) {
        if (!Array.isArray(serverEntities)) {
            return;
        }

        const authoritativeShotIds = new Set(
            serverEntities
                .filter((entity) => (
                    entity.kind === "bullet" &&
                    typeof entity.clientShotId === "string"
                ))
                .map((entity) => entity.clientShotId),
        );

        for (const clientShotId of authoritativeShotIds) {
            bullets.delete(clientShotId);
        }
    }

    function remove(clientShotId) {
        return bullets.delete(clientShotId);
    }

    function getAll() {
        return Array.from(bullets.values());
    }

    return {
        spawn,
        update,
        reconcile,
        remove,
        getAll,

        get size() {
            return bullets.size;
        },
    };
}
