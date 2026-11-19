
import "./lobby/lobby.css";

import { createAudioSystem } from "./audio/audio.js";
import { gameEvents } from "./events/gameEvents.js";
import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { createCanvas } from "./render/canvas.js";
import {
    drawAsteroid,
    drawBullet,
    drawGrid,
    drawMissile,
    drawPickup,
    drawShip,
} from "./render/draw.js";
import { loadAll, loadJson } from "./assets/loader.js";
import { Lobby } from "./lobby/lobby.js";
import { LobbyView } from "./lobby/lobbyView.js";
import { Connection } from "./network/connection.js";
import { createPrediction } from "./network/prediction.js";
import { createInterpolationBuffer } from "./network/interpolation.js";
import { createPredictedBullets } from "./network/predictedBullets.js";

const canvas = createCanvas();

let gameConnection = null;

const SIMULATION_STEP = 1 / 30;
const INTERPOLATION_DELAY_MS = 100;
const MIN_INTERPOLATION_DELAY_MS = 0;
const MAX_INTERPOLATION_DELAY_MS = 500;
const INTERPOLATION_DELAY_STEP_MS = 10;
const FIRE_COOLDOWN_SECONDS = 0.25;

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

function drawNetgraph(
    context,
    stats,
    pendingInputs,
    correctionMagnitude,
    interpolationDelayMs,
) {
    const width = 300;
    const height = 250;
    const margin = 12;

    const x = Math.max(10, canvas.width - width - 20);
    const y = 20;

    context.save();

    context.fillStyle = "rgba(25, 24, 37, 0.92)";
    context.fillRect(x, y, width, height);

    context.strokeStyle = "#454354";
    context.lineWidth = 1;
    context.strokeRect(x, y, width, height);

    context.fillStyle = "#F1FEC8";
    context.font = "bold 13px monospace";
    context.textAlign = "left";
    context.fillText("NETWORK MONITOR", x + margin, y + 19);

    context.font = "12px monospace";

    context.fillStyle = "#64d8ff";
    context.fillText(
        `RTT: ${stats.rttMs.toFixed(1)} ms`,
        x + margin,
        y + 43,
    );

    context.fillStyle = "#F1FEC8";
    context.fillText(
        `AVG: ${stats.averageRttMs.toFixed(1)} ms`,
        x + 150,
        y + 43,
    );

    context.fillStyle = "#F1FEC8";
    context.fillText(
        `MAX: ${stats.maxRttMs.toFixed(1)} ms`,
        x + margin,
        y + 62,
    );

    const graphX = x + margin;
    const graphY = y + 75;
    const graphWidth = width - margin * 2;
    const graphHeight = 43;

    context.fillStyle = "rgba(0, 0, 0, 0.25)";
    context.fillRect(graphX, graphY, graphWidth, graphHeight);

    const samples = stats.rttSamples;
    const maxRtt = Math.max(100, ...samples, 1);

    context.strokeStyle = "#454354";
    context.lineWidth = 1;

    for (let i = 1; i <= 2; i++) {
        const gridY = graphY + (graphHeight / 3) * i;

        context.beginPath();
        context.moveTo(graphX, gridY);
        context.lineTo(graphX + graphWidth, gridY);
        context.stroke();
    }

    if (samples.length > 1) {
        context.beginPath();

        samples.forEach((value, index) => {
            const pointX =
                graphX +
                (index / (samples.length - 1)) * graphWidth;

            const pointY =
                graphY +
                graphHeight -
                (Math.min(value, maxRtt) / maxRtt) * graphHeight;

            if (index === 0) {
                context.moveTo(pointX, pointY);
            } else {
                context.lineTo(pointX, pointY);
            }
        });

        context.strokeStyle = "#64d8ff";
        context.lineWidth = 2;
        context.stroke();
    }

    const snapshotAge =
        stats.snapshotAgeMs === null
            ? "waiting"
            : `${stats.snapshotAgeMs.toFixed(0)} ms`;

    context.font = "12px monospace";
    context.fillStyle = "#F1FEC8";
    context.fillText(
        `Snapshot age: ${snapshotAge}`,
        x + margin,
        y + 137,
    );

    context.fillStyle = "#64d8ff";
    context.fillText(
        `DOWN: ${(stats.receivedBytesPerSecond / 1024).toFixed(2)} KB/s`,
        x + margin,
        y + 158,
    );

    context.fillStyle = "#F1FEC8";
    context.fillText(
        `UP: ${(stats.sentBytesPerSecond / 1024).toFixed(2)} KB/s`,
        x + 150,
        y + 158,
    );

    context.fillStyle = pendingInputs > 10 ? "#ff7777" : "#F1FEC8";
    context.fillText(
        `Pending inputs: ${pendingInputs}`,
        x + margin,
        y + 179,
    );

    context.fillStyle = "#b8c4d8";
    context.font = "10px monospace";
    context.fillText(
        `Dropped: OUT ${stats.droppedOutgoing} / IN ${stats.droppedIncoming}`,
        x + margin,
        y + 198,
    );

    context.font = "12px monospace";
    context.fillStyle = "#64d8ff";
    context.fillText(
        `Interpolation: ${interpolationDelayMs} ms`,
        x + margin,
        y + 218,
    );

    context.fillStyle = "#b8c4d8";
    context.font = "10px monospace";
    context.fillText(
        "[ / ]: adjust interpolation delay",
        x + margin,
        y + 233,
    );

    context.fillStyle =
        correctionMagnitude > 10 ? "#ff7777" : "#64d8ff";

    context.font = "12px monospace";
    context.fillText(
        `Correction: ${correctionMagnitude.toFixed(2)} px`,
        x + margin,
        y + 248,
    );

    context.restore();
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

function startGame(room, playerName, playerId) {
    retryButton.style.display = "none";

    const input = createInput();

    const roomWidth = Number(room.width) || 1600;
    const roomHeight = Number(room.height) || 900;

    let latestSnapshot = null;
    let sequence = 0;
    let shotSequence = 0;
    let fireCooldownRemaining = 0;

    const prediction = createPrediction({
        width: roomWidth,
        height: roomHeight,
        step: SIMULATION_STEP,
        smoothingMs: 100,
    });

    const predictedBullets = createPredictedBullets();

    const interpolation = createInterpolationBuffer({
        width: roomWidth,
        height: roomHeight,
        step: SIMULATION_STEP,
        delayMs: INTERPOLATION_DELAY_MS,
    });

    const loop = createLoop({
        step: SIMULATION_STEP,

        simulate() {
            if (!gameConnection) {
                return;
            }

            const turnLeft =
                input.isDown("ArrowLeft") || input.isDown("KeyA");

            const turnRight =
                input.isDown("ArrowRight") || input.isDown("KeyD");

            const thrust =
                input.isDown("ArrowUp") || input.isDown("KeyW");

            if (input.justPressed("BracketLeft")) {
                interpolation.setDelayMs(
                    Math.max(
                        MIN_INTERPOLATION_DELAY_MS,
                        interpolation.delayMs - INTERPOLATION_DELAY_STEP_MS,
                    ),
                );
            }

            if (input.justPressed("BracketRight")) {
                interpolation.setDelayMs(
                    Math.min(
                        MAX_INTERPOLATION_DELAY_MS,
                        interpolation.delayMs + INTERPOLATION_DELAY_STEP_MS,
                    ),
                );
            }

            fireCooldownRemaining = Math.max(
                0,
                fireCooldownRemaining - SIMULATION_STEP,
            );

            const predictedState = prediction.getRenderState();

            const fire =
                input.justPressed("Space") &&
                fireCooldownRemaining <= 0 &&
                predictedState !== null;

            let clientShotId;

            if (fire) {
                shotSequence++;
                clientShotId = `${playerId}:${shotSequence}`;

                fireCooldownRemaining = FIRE_COOLDOWN_SECONDS;

                const ownShip = latestSnapshot?.entities.find(
                    (entity) =>
                        entity.kind === "ship" &&
                        entity.playerId === playerId,
                );

                if (ownShip?.weapon === "bullet") {
                    predictedBullets.spawn({
                        ship: predictedState,
                        playerId,
                        clientShotId,
                    });
                }
            }

            sequence++;

            const currentInput = {
                type: "input",
                seq: sequence,
                thrust,
                turn: Number(turnRight) - Number(turnLeft),
                fire,
                ...(fire ? { clientShotId } : {}),
            };

            prediction.predict(currentInput);

            gameConnection.send(currentInput);

            predictedBullets.update(SIMULATION_STEP);

            input.clearJustPressed();
        },

        render() {
            const context = canvas.context;

            context.clearRect(0, 0, canvas.width, canvas.height);

            const scaleX = canvas.width / roomWidth;
            const scaleY = canvas.height / roomHeight;

            context.save();
            context.scale(scaleX, scaleY);

            drawGrid(context, roomWidth, roomHeight);

            const interpolatedEntities =
                interpolation.sample() ??
                latestSnapshot?.entities ??
                [];

            const serverEntities = latestSnapshot?.entities ?? [];

            const ownShip = serverEntities.find(
                (entity) =>
                    entity.kind === "ship" &&
                    entity.playerId === playerId,
            );

            const predictedState = prediction.getRenderState();

            // Локальна куля зникає, коли її серверна версія
            // з'являється в поточному інтерпольованому стані.
            predictedBullets.reconcile(interpolatedEntities);

            for (const entity of interpolatedEntities) {
                switch (entity.kind) {
                    case "ship": {
                        const isOwnShip =
                            entity.playerId === playerId;

                        const position =
                            isOwnShip && predictedState
                                ? predictedState.pos
                                : entity.pos;

                        const angle =
                            isOwnShip && predictedState
                                ? predictedState.angle
                                : entity.angle;

                        const thrust =
                            isOwnShip && predictedState
                                ? predictedState.thrust
                                : entity.thrust;

                        drawShip(context, {
                            x: position.x,
                            y: position.y,
                            angle,
                            thrust,
                        });

                        break;
                    }

                    case "bullet":
                        drawBullet(context, entity);
                        break;

                    case "missile":
                        drawMissile(context, entity);
                        break;

                    case "pickup":
                        drawPickup(context, entity);
                        break;

                    case "asteroid":
                        drawAsteroid(context, entity);
                        break;
                }
            }

            // Передбачені локальні кулі відображаються відразу,
            // не чекаючи серверного snapshot.
            for (const bullet of predictedBullets.getAll()) {
                drawBullet(context, bullet);
            }

            context.restore();

            context.fillStyle = "#F1FEC8";
            context.font = "14px monospace";
            context.textAlign = "left";

            context.fillText(`Player: ${playerName}`, 20, 30);
            context.fillText(`Arena: ${room.name}`, 20, 52);
            context.fillText(`FPS: ${loop.getStats().fps}`, 20, 74);

            context.fillText(
                `Steps/s: ${loop.getStats().stepsPerSecond}`,
                20,
                96,
            );

            context.fillText(
                `Server tick: ${latestSnapshot?.tick ?? 0}`,
                20,
                118,
            );

            context.fillText(
                `Ship HP: ${ownShip?.hp ?? "-"}`,
                20,
                140,
            );

            context.fillText(
                `Missiles: ${ownShip?.missileCount ?? "-"}`,
                20,
                162,
            );

            context.fillText(
                `Weapon: ${ownShip?.weapon?.toUpperCase() ?? "-"}`,
                20,
                184,
            );

            context.fillText(
                `Input seq: ${sequence}`,
                20,
                206,
            );

            const ack = latestSnapshot?.lastProcessedSeq ?? 0;

            context.fillText(
                `Server ACK: ${ack}`,
                20,
                228,
            );

            if (!latestSnapshot) {
                context.textAlign = "center";
                context.font = "22px monospace";
                context.fillText(
                    "WAITING FOR SERVER SNAPSHOT...",
                    canvas.width / 2,
                    canvas.height / 2,
                );
            }

            const networkStats = gameConnection?.getNetworkStats();

            if (networkStats) {
                drawNetgraph(
                    context,
                    networkStats,
                    prediction.pendingCount,
                    predictedState?.correctionMagnitude ?? 0,
                    interpolation.delayMs,
                );
            }
        },
    });

    gameConnection.addEventListener("snapshot", (event) => {
        const snapshot = event.detail;

        if (
            !Number.isSafeInteger(snapshot.tick) ||
            !Array.isArray(snapshot.entities)
        ) {
            return;
        }

        if (
            latestSnapshot &&
            snapshot.tick <= latestSnapshot.tick
        ) {
            return;
        }

        const accepted = interpolation.push(snapshot);

        if (!accepted) {
            return;
        }

        prediction.reconcile(snapshot, playerId);

        for (const gameEvent of snapshot.events ?? []) {
            if (
                !gameEvent ||
                !["fired", "hit", "exploded"].includes(gameEvent.type)
            ) {
                continue;
            }

            if (
                gameEvent.type === "hit" &&
                typeof gameEvent.clientShotId === "string"
            ) {
                predictedBullets.remove(gameEvent.clientShotId);
            }

            gameEvents.emit(gameEvent.type, gameEvent);
        }

        latestSnapshot = snapshot;
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

                if (!gameStarted) {
                    gameStarted = true;

                    startGame(
                        room,
                        playerName,
                        event.detail.playerId,
                    );
                }
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
