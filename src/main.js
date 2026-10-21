import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { Ship } from "./sim/ship.js";
import { World } from "./sim/world.js";
import { wrapShip } from "./sim/arena.js";
import { Vector2 } from "./sim/Vector.js";
import { Asteroid } from "./sim/asteroid.js";
import { createCanvas } from "./render/canvas.js";
import {
    drawAsteroid,
    drawBullet,
    drawExplosion,
    drawGrid,
    drawMissile,
    drawPickup,
    drawShip,
} from "./render/draw.js";
import { createHomingBehavior } from "./sim/homing.js";
import { Pickup } from "./sim/pickup.js";

const canvas = createCanvas();
const input = createInput();
const world = new World();

const ship = world.spawn(new Ship(canvas.width / 2, canvas.height / 2));

const asteroid = world.spawn(
    new Asteroid(new Vector2(100, 100), new Vector2(35, 20), 25),
);

asteroid.behaviors.push(createHomingBehavior(ship));

// Тимчасовий pickup для перевірки підбору ракет.
world.spawn(new Pickup(new Vector2(canvas.width * 0.7, canvas.height * 0.3)));

let respawnTimer = 0;

const previousShip = {
    x: ship.pos.x,
    y: ship.pos.y,
    angle: ship.angle,
};

let loop;

loop = createLoop({
    simulate(dt) {
        previousShip.x = ship.pos.x;
        previousShip.y = ship.pos.y;
        previousShip.angle = ship.angle;

        world.step(dt, input);

        if (!ship.alive && respawnTimer === 0) {
            respawnTimer = 2;
        }

        if (respawnTimer > 0) {
            respawnTimer -= dt;

            if (respawnTimer <= 0) {
                ship.pos = new Vector2(canvas.width / 2, canvas.height / 2);
                ship.vel = new Vector2();
                ship.resetHealth();
                ship.invulnerabilityTimer = 1;
                respawnTimer = 0;
            }
        }

        if (ship.alive) {
            wrapShip(ship, canvas.width, canvas.height);
        }

        input.clearJustPressed();
    },

    render(alpha) {
        const context = canvas.context;

        context.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid(context, canvas.width, canvas.height);

        let angleDifference = ship.angle - previousShip.angle;

        if (angleDifference > Math.PI) {
            angleDifference -= Math.PI * 2;
        }

        if (angleDifference < -Math.PI) {
            angleDifference += Math.PI * 2;
        }

        const renderShip = {
            x: previousShip.x + (ship.pos.x - previousShip.x) * alpha,
            y: previousShip.y + (ship.pos.y - previousShip.y) * alpha,
            angle: previousShip.angle + angleDifference * alpha,
            thrust: ship.thrust,
        };

        if (ship.alive) {
            drawShip(context, renderShip);
        }

        for (const bullet of world.ofKind("bullet")) {
            drawBullet(context, bullet);
        }

        for (const missile of world.ofKind("missile")) {
            drawMissile(context, missile);
        }

        for (const pickup of world.ofKind("pickup")) {
            drawPickup(context, pickup);
        }

        for (const asteroid of world.ofKind("asteroid")) {
            drawAsteroid(context, asteroid);
        }

        for (const explosion of world.ofKind("explosion")) {
            drawExplosion(context, explosion);
        }

        const stats = loop.getStats();

        context.fillStyle = "#F1FEC8";
        context.font = "14px monospace";
        context.textAlign = "left";

        context.fillText(`FPS: ${stats.fps}`, 20, 30);
        context.fillText(`Steps/s: ${stats.stepsPerSecond}`, 20, 52);
        context.fillText(
            `Frame time: ${stats.frameTime.toFixed(2)} ms`,
            20,
            74,
        );
        context.fillText(`Ship HP: ${ship.hp}`, 20, 96);
        context.fillText(`Score: ${world.score}`, 20, 118);
        context.fillText(`Missiles: ${ship.missileCount}`, 20, 140);
        context.fillText(`Weapon: ${ship.weapon.toUpperCase()} [E]`, 20, 162);

        if (respawnTimer > 0) {
            context.fillStyle = "#FFD166";
            context.textAlign = "center";
            context.font = "24px monospace";

            context.fillText(
                `RESPAWN IN: ${respawnTimer.toFixed(1)}`,
                canvas.width / 2,
                canvas.height / 2,
            );
        }
    },
});

loop.start();
