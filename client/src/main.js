import "./lobby/lobby.css";

import { createAudioSystem } from "./audio/audio.js";
import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { World, Vector2, Explosion, Ship, Bullet, Missile, Asteroid, Pickup } from "@dogfight/shared";
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
import { loadAll, loadJson } from "./assets/loader.js";
import { Lobby } from "./lobby/lobby.js";
import { LobbyView } from "./lobby/lobbyView.js";
import { Connection } from "./network/connection.js";

const canvas = createCanvas();

let gameConnection = null;
let authoritativeWorld = null;
let myPlayerId = null;
let myShipId = null;
let roomWidth = 0;
let roomHeight = 0;
let inputSeq = 0;
let lastSnapshotTick = -1;

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

function applySnapshot(snapshot) {
    const newWorld = new World();
    newWorld.score = snapshot.score || 0;

    for (const entityData of snapshot.entities) {
        let entity;
        switch (entityData.kind) {
            case "ship":
                entity = new Ship(entityData.x, entityData.y, entityData.id);
                entity.angle = entityData.angle || 0;
                entity.thrust = entityData.thrust || false;
                entity.weapon = entityData.weapon || "bullet";
                entity.missileCount = entityData.missileCount || 0;
                entity.fireCooldown = entityData.fireCooldown || 0;
                entity.invulnerabilityTimer = entityData.invulnerabilityTimer || 0;
                entity.hp = entityData.hp;
                entity.alive = entityData.alive;
                break;
            case "bullet":
                entity = new Bullet(
                    new Vector2(entityData.x, entityData.y),
                    new Vector2(0, 0),
                    entityData.angle || 0,
                    entityData.ttl || 1.5,
                    entityData.id
                );
                entity.alive = entityData.alive;
                break;
            case "missile":
                entity = new Missile(
                    new Vector2(entityData.x, entityData.y),
                    new Vector2(0, 0),
                    entityData.angle || 0,
                    null,
                    entityData.ttl || 4,
                    entityData.id
                );
                entity.alive = entityData.alive;
                break;
            case "asteroid":
                entity = new Asteroid(
                    new Vector2(entityData.x, entityData.y),
                    new Vector2(0, 0),
                    entityData.radius,
                    entityData.id
                );
                entity.hp = entityData.hp;
                entity.alive = entityData.alive;
                break;
            case "pickup":
                entity = new Pickup(
                    new Vector2(entityData.x, entityData.y),
                    entityData.id
                );
                entity.alive = entityData.alive;
                break;
            case "explosion":
                entity = Explosion.fromSnapshot(entityData);
                break;
            default:
                continue;
        }
        newWorld.spawn(entity);
    }

    authoritativeWorld = newWorld;
    lastSnapshotTick = snapshot.tick;
}

function sendInput(input) {
    if (!gameConnection || !myPlayerId) return;

    const inputMessage = {
        type: "input",
        seq: inputSeq++,
        tick: lastSnapshotTick,
        thrust: input.thrust,
        turnLeft: input.turnLeft,
        turnRight: input.turnRight,
        fire: input.fire,
        switchWeapon: input.switchWeapon,
    };

    gameConnection.send(inputMessage);
}

function startGame(room, playerName) {
    retryButton.style.display = "none";

    const input = createInput();

    roomWidth = Number(room.width) || canvas.width;
    roomHeight = Number(room.height) || canvas.height;

    let loop;

    loop = createLoop({
        // eslint-disable-next-line no-unused-vars
        simulate(_dt) {
            // Send current input to server
            const currentInput = {
                thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
                turnLeft: input.isDown("ArrowLeft") || input.isDown("KeyA"),
                turnRight: input.isDown("ArrowRight") || input.isDown("KeyD"),
                fire: input.isDown("Space"),
                switchWeapon: input.justPressed("KeyE"),
            };

            sendInput(currentInput);

            // No local simulation - we just render the authoritative state
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

            if (authoritativeWorld) {
                // Find my ship
                let myShip = null;
                if (myShipId) {
                    myShip = authoritativeWorld.get(myShipId);
                }

                // Render all entities
                for (const ship of authoritativeWorld.ofKind("ship")) {
                    const isMyShip = ship.id === myShipId;
                    let renderShip;

                    if (isMyShip && alpha !== undefined) {
                        // For local ship, we could interpolate but for Stage 2.1 we just render authoritative state
                        renderShip = {
                            x: ship.pos.x,
                            y: ship.pos.y,
                            angle: ship.angle,
                            thrust: ship.thrust,
                        };
                    } else {
                        renderShip = {
                            x: ship.pos.x,
                            y: ship.pos.y,
                            angle: ship.angle,
                            thrust: ship.thrust,
                        };
                    }

                    if (ship.alive) {
                        drawShip(context, renderShip);
                    }
                }

                for (const bullet of authoritativeWorld.ofKind("bullet")) {
                    drawBullet(context, bullet);
                }

                for (const missile of authoritativeWorld.ofKind("missile")) {
                    drawMissile(context, missile);
                }

                for (const pickup of authoritativeWorld.ofKind("pickup")) {
                    drawPickup(context, pickup);
                }

                for (const asteroid of authoritativeWorld.ofKind("asteroid")) {
                    drawAsteroid(context, asteroid);
                }

                for (const explosion of authoritativeWorld.ofKind("explosion")) {
                    drawExplosion(context, explosion);
                }

                // HUD
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

                if (myShip) {
                    context.fillText(`Ship HP: ${myShip.hp}`, 20, 140);
                    context.fillText(`Score: ${authoritativeWorld.score}`, 20, 162);
                    context.fillText(`Missiles: ${myShip.missileCount}`, 20, 184);
                    context.fillText(
                        `Weapon: ${myShip.weapon.toUpperCase()} [E]`,
                        20,
                        206,
                    );
                }
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
            alert("JOIN EVENT WORKS");
            console.log("LOBBY JOIN EVENT:", event.detail);
            const { room, playerName } = event.detail;

            lobby.leave();
            lobbyView.destroy();

            gameConnection?.disconnect();

            gameConnection = new Connection();
            window.gameConnection = gameConnection;

            let gameStarted = false;

            gameConnection.addEventListener("open", () => {
                console.log("WebSocket connected");

                gameConnection.send({
                    type: "join",
                    roomId: room.id,
                    playerName,
                });
            });

            gameConnection.addEventListener("joined", (event) => {
                console.log("Joined room:", event.detail.roomId);
                console.log("Player ID:", event.detail.playerId);
                console.log("Ship ID:", event.detail.shipId);
                console.log("Seed:", event.detail.seed);
                console.log("Room config:", event.detail.roomConfig);

                myPlayerId = event.detail.playerId;
                myShipId = event.detail.shipId;

                if (!gameStarted) {
                    gameStarted = true;
                    startGame(room, playerName);
                }
            });

            gameConnection.addEventListener("snapshot", (event) => {
                const snapshot = event.detail;
                applySnapshot(snapshot);
            });

            gameConnection.addEventListener("roster", (event) => {
                console.log("Players in room:", event.detail.players);
            });

            gameConnection.addEventListener("chat", (event) => {
                console.log(
                    `[${event.detail.playerName}]: ${event.detail.message}`,
                );
            });

            gameConnection.addEventListener("close", (event) => {
                console.log(
                    "WebSocket disconnected:",
                    event.detail.code,
                    event.detail.reason,
                );
            });

            gameConnection.addEventListener("error", (event) => {
                console.error("WebSocket error:", event.detail);
            });

            console.log("JOIN EVENT: connecting to WebSocket...");
            gameConnection.connect();
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