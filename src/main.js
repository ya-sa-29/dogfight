import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { createShip, integrate } from "./sim/ship.js";
import { wrapShip } from "./sim/arena.js";
import { createCanvas } from "./render/canvas.js";
import { drawGrid, drawShip } from "./render/draw.js";

const canvas = createCanvas();
const input = createInput();

const ship = createShip(canvas.width / 2, canvas.height / 2);

const previousShip = { ...ship };

let loop;

loop = createLoop({
    simulate(dt) {
        Object.assign(previousShip, ship);

        integrate(ship, input, dt);
        wrapShip(ship, canvas.width, canvas.height);

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
            ...ship,
            x: previousShip.x + (ship.x - previousShip.x) * alpha,
            y: previousShip.y + (ship.y - previousShip.y) * alpha,
            angle: previousShip.angle + angleDifference * alpha,
        };

        drawShip(context, renderShip);

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
    },
});

loop.start();
