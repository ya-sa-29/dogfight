
import "./lobby/lobby.css";

import { createAudioSystem } from "./audio/audio.js";
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
import { loadAll, loadJson } from "./assets/loader.js";
import { Lobby } from "./lobby/lobby.js";
import { LobbyView } from "./lobby/lobbyView.js";

const canvas = createCanvas();

function drawLoading(progress = 0, message = "Loading assets...") {
    const context = canvas.context;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#23212c";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.textAlign = "center";
    context.fillStyle = "#F1FEC8";
    context.font = "28px monospace";
    context.fillText("DOGFIGHT", canvas.width / 2, canvas.height / 2 - 60);

    context.font = "16px monospace";
    context.fillText(message, canvas.width / 2, canvas.height / 2 - 15);

    const barWidth = Math.min(400, canvas.width * 0.7);
    const barHeight = 12;
    const barX = (canvas.width - barWidth) / 2;
    const barY = canvas.height / 2 + 15;

    context.fillStyle = "#454354";
    context.fillRect(barX, barY, barWidth, barHeight);

    context.fillStyle = "#64d8ff";
    context.fillRect(barX, barY, barWidth * progress / 100, barHeight);

    context.fillStyle = "#F1FEC8";
    context.font = "14px monospace";
    context.fillText(`${progress}%`, canvas.width / 2, barY + 40);
}

const retryButton = document.createElement("button");
const startButton = document.createElement("button");

startButton.textContent = "Enable Audio & Start";

Object.assign(startButton.style, {
    position: "fixed",
    top: "calc(50% + 75px)",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 28px",
    border: "none",
    borderRadius: "4px",
    background: "#64d8ff",
    color: "#23212c",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
});

document.body.appendChild(startButton);

let audioContext;
let audioSystem;

retryButton.textContent = "Retry";

Object.assign(retryButton.style, {
    display: "none",
    position: "fixed",
    top: "calc(50% + 75px)",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 28px",
    border: "none",
    borderRadius: "4px",
    background: "#64d8ff",
    color: "#23212c",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
});

document.body.appendChild(retryButton);

function startGame(room, playerName) {
    retryButton.style.display = "none";

    const input = createInput();
    const world = new World();

    const roomWidth = Number(room.width) || canvas.width;
    const roomHeight = Number(room.height) || canvas.height;

    const ship = world.spawn(
        new Ship(roomWidth / 2, roomHeight / 2),
    );

    for (let i = 0; i < room.asteroidCount; i++) {
        const pos = new Vector2(
            80 + Math.random() * (roomWidth - 160),
            80 + Math.random() * (roomHeight - 160),
        );

        const vel = new Vector2(
            (Math.random() - 0.5) * 80,
            (Math.random() - 0.5) * 80,
        );

        const asteroid = world.spawn(
            new Asteroid(pos, vel, 18 + Math.random() * 17),
        );

        if (i === 0) {
            asteroid.behaviors.push(createHomingBehavior(ship));
        }
    }

    world.spawn(
        new Pickup(
            new Vector2(roomWidth * 0.7, roomHeight * 0.3),
        ),
    );

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
                    ship.pos = new Vector2(
                        roomWidth / 2,
                        roomHeight / 2,
                    );

                    ship.vel = new Vector2();
                    ship.resetHealth();
                    ship.invulnerabilityTimer = 1;
                    respawnTimer = 0;
                }
            }

            if (ship.alive) {
                wrapShip(ship, roomWidth, roomHeight);
            }

            input.clearJustPressed();
        },

        render(alpha) {
            const context = canvas.context;

            context.clearRect(0, 0, canvas.width, canvas.height);

            const scaleX = canvas.width / roomWidth;
            const scaleY = canvas.height / roomHeight;

            context.save();
            context.scale(scaleX, scaleY);

            drawGrid(context, roomWidth, roomHeight);

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

            context.restore();

            const stats = loop.getStats();

            context.fillStyle = "#F1FEC8";
            context.font = "14px monospace";
            context.textAlign = "left";

            context.fillText(`Player: ${playerName}`, 20, 30);
            context.fillText(`Arena: ${room.name}`, 20, 52);
            context.fillText(`FPS: ${stats.fps}`, 20, 74);
            context.fillText(`Steps/s: ${stats.stepsPerSecond}`, 20, 96);
            context.fillText(
                `Frame time: ${stats.frameTime.toFixed(2)} ms`,
                20,
                118,
            );
            context.fillText(`Ship HP: ${ship.hp}`, 20, 140);
            context.fillText(`Score: ${world.score}`, 20, 162);
            context.fillText(`Missiles: ${ship.missileCount}`, 20, 184);
            context.fillText(
                `Weapon: ${ship.weapon.toUpperCase()} [E]`,
                20,
                206,
            );

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
}

async function bootstrap() {
    const controller = new AbortController();

    retryButton.style.display = "none";
    drawLoading(0, "Loading manifest...");

    try {
        const minimumLoadingTime = new Promise((resolve) => {
            setTimeout(resolve, 800);
        });

        const manifest = await loadJson("/assets/manifest.json", {
            signal: controller.signal,
        });

        const assets = await loadAll(manifest, {
            audioContext,
            signal: controller.signal,
            onProgress: (progress) => {
                drawLoading(progress.percent, "Loading assets...");
            },
        });

        await minimumLoadingTime;

        console.info("Assets loaded:", Object.keys(assets));

        drawLoading(100, "Preparing lobby...");

        if (!audioSystem) {
            audioSystem = createAudioSystem(audioContext, assets);
        }

        const lobby = new Lobby();
        const lobbyView = new LobbyView(lobby);

        lobby.addEventListener("join", (event) => {
            const { room, playerName } = event.detail;

            lobby.leave();
            lobbyView.destroy();

            startGame(room, playerName);
        });

        lobbyView.show();
        await lobby.enter();

    } catch (error) {
        controller.abort(error);

        console.error("Loading failed:", error);

        drawLoading(0, `Loading failed: ${error.message}`);
        retryButton.style.display = "block";
    }
}

startButton.addEventListener("click", async () => {
    startButton.style.display = "none";

    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        audioContext = new AudioContextClass();
        await audioContext.resume();

        await bootstrap();
    } catch (error) {
        console.error("Initialization failed:", error);
        drawLoading(0, `Initialization failed: ${error.message}`);
        startButton.style.display = "block";
    }
});

retryButton.addEventListener("click", bootstrap);

drawLoading(0, "Click Start to enable audio");
