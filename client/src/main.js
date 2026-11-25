import "./lobby/lobby.css";

import { createAudioSystem } from "./audio/audio.js";
import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import {
    World,
    Vector2,
    Explosion,
    Ship,
    Bullet,
    Missile,
    Asteroid,
    Pickup,
} from "@dogfight/shared";
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
import { NO_SNAPSHOT_TICK, canSendInput } from "./network/inputGate.js";
import { createInputSender } from "./network/inputSender.js";
import { createInputTransmitter } from "./network/inputTransmitter.js";
import { createPredictor } from "./network/predictor.js";
import { createInterpolator } from "./network/interpolator.js";
import { createBulletPredictor } from "./network/bulletPredictor.js";
import { createNetgraph } from "./netgraph/netgraph.js";
import { computeWorldViewport } from "./render/viewport.js";

const canvas = createCanvas();

let gameConnection = null;
let authoritativeWorld = null;
let myPlayerId = null;
let myShipId = null;
let roomWidth = 0;
let roomHeight = 0;
let lastSnapshotTick = NO_SNAPSHOT_TICK;

// Input pipeline: the sender owns sequence numbers and pending-input tracking,
// the transmitter gates transmission to 30 Hz and latches one-shot actions.
let inputSender = null;
let inputTransmitter = null;

// M2: client-side prediction/reconciliation for the local ship.
let predictor = null;
let lastCorrectionMagnitude = 0;

// M3: remote entity interpolation + local bullet prediction.
let interpolator = null;
let bulletPredictor = null;
// Local fire cooldown mirroring the server's 0.25 s bullet cooldown, used to
// throttle local bullet prediction so we do not spawn duplicates.
let localFireCooldown = 0;

// Netgraph state
let clockOffset = 0; // Estimated serverTime - performance.now()
let firstSnapshotReceived = false;

function ensureInputPipeline() {
    if (inputSender && inputTransmitter && predictor) {
        return;
    }

    inputSender = createInputSender({
        getConnection: () => gameConnection,
        getPlayerId: () => myPlayerId,
        getSnapshotTick: () => lastSnapshotTick,
    });

    predictor = createPredictor();

    // M3: remote entity interpolation + local bullet prediction.
    if (!interpolator) {
        interpolator = createInterpolator();
    }
    if (!bulletPredictor) {
        bulletPredictor = createBulletPredictor();
    }

    inputTransmitter = createInputTransmitter({
        canSend: () => canSendInput(lastSnapshotTick),
        send: (input) => {
            // Capture the sequence number the sender assigns so the predictor
            // can replay this exact input after reconciliation.
            const prevSeq = inputSender.getInputSeq();
            const accepted = inputSender.send(input);
            if (accepted) {
                // The sender increments inputSeq only on acceptance, so the
                // sequence just sent is prevSeq.
                predictor.pushPending(prevSeq, input);
            }
            return accepted;
        },
    });
}

function drawLoading(progress = 0, message = "Loading assets...") {
    const context = canvas.context;

    // Screen-space overlay: use CSS viewport dimensions, since the context
    // base transform already applies devicePixelRatio exactly once.
    const viewWidth = canvas.viewWidth;
    const viewHeight = canvas.viewHeight;

    context.clearRect(0, 0, viewWidth, viewHeight);
    context.fillStyle = "#23212c";
    context.fillRect(0, 0, viewWidth, viewHeight);

    context.textAlign = "center";
    context.fillStyle = "#F1FEC8";
    context.font = "28px monospace";
    context.fillText("DOGFIGHT", viewWidth / 2, viewHeight / 2 - 60);

    context.font = "16px monospace";
    context.fillText(message, viewWidth / 2, viewHeight / 2 - 15);

    const barWidth = Math.min(400, viewWidth * 0.7);
    const barHeight = 12;
    const barX = (viewWidth - barWidth) / 2;
    const barY = viewHeight / 2 + 15;

    context.fillStyle = "#454354";
    context.fillRect(barX, barY, barWidth, barHeight);

    context.fillStyle = "#64d8ff";
    context.fillRect(barX, barY, (barWidth * progress) / 100, barHeight);

    context.fillStyle = "#F1FEC8";
    context.font = "14px monospace";
    context.fillText(`${progress}%`, viewWidth / 2, barY + 40);
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

const connectionStatus = document.createElement("div");

Object.assign(connectionStatus.style, {
    position: "fixed",
    top: "12px",
    left: "50%",
    transform: "translateX(-50%)",
    display: "none",
    padding: "8px 16px",
    border: "1px solid #ff6b6b",
    borderRadius: "4px",
    background: "rgba(35, 33, 44, 0.92)",
    color: "#ff9b9b",
    font: "14px monospace",
    zIndex: "1000",
});

document.body.appendChild(connectionStatus);

function showConnectionStatus(message) {
    connectionStatus.textContent = message;
    connectionStatus.style.display = "block";
}

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
                entity.invulnerabilityTimer =
                    entityData.invulnerabilityTimer || 0;
                entity.hp = entityData.hp;
                entity.alive = entityData.alive;
                break;
            case "bullet":
                entity = new Bullet(
                    new Vector2(entityData.x, entityData.y),
                    new Vector2(0, 0),
                    entityData.angle || 0,
                    entityData.ttl || 1.5,
                    entityData.id,
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
                    entityData.id,
                );
                entity.alive = entityData.alive;
                break;
            case "asteroid":
                entity = new Asteroid(
                    new Vector2(entityData.x, entityData.y),
                    new Vector2(0, 0),
                    entityData.radius,
                    entityData.id,
                );
                entity.hp = entityData.hp;
                entity.alive = entityData.alive;
                break;
            case "pickup":
                entity = new Pickup(
                    new Vector2(entityData.x, entityData.y),
                    entityData.id,
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

    // M3: capture plain entity data for remote-entity interpolation. The
    // interpolator buffers snapshots and renders remote entities at
    // `now - interpolationDelay`, smoothing 30 Hz snapshots to the render rate.
    if (interpolator) {
        const interpEntities = snapshot.entities
            .filter((e) => e.kind === "ship" || e.kind === "bullet" || e.kind === "missile")
            .map((e) => ({
                id: e.id,
                kind: e.kind,
                x: e.x,
                y: e.y,
                angle: e.angle || 0,
                thrust: e.thrust || false,
                radius: e.radius,
                hp: e.hp,
                alive: e.alive,
            }));
        interpolator.pushFrame(snapshot.serverTime, interpEntities);
    }

    // M3: reconcile locally predicted bullets against the authoritative
    // bullets. A predicted bullet close to an authoritative bullet of the same
    // kind is confirmed and removed; the authoritative bullet is drawn instead.
    if (bulletPredictor) {
        const authoritativeBullets = snapshot.entities
            .filter((e) => e.kind === "bullet")
            .map((e) => ({ id: e.id, x: e.x, y: e.y }));
        bulletPredictor.reconcile(authoritativeBullets);
    }

    // M2: reconcile the local ship prediction against the authoritative state.
    // The server's ship for this player is the reconciliation anchor; replay of
    // still-pending inputs happens inside reconcile().
    if (predictor && myShipId) {
        const serverShip = newWorld.get(myShipId);
        if (serverShip) {
            const ackSeq =
                snapshot.playerAcks && myPlayerId
                    ? snapshot.playerAcks[myPlayerId]
                    : undefined;
            const magnitude = predictor.reconcile(
                {
                    x: serverShip.pos.x,
                    y: serverShip.pos.y,
                    angle: serverShip.angle,
                },
                ackSeq,
            );
            if (typeof magnitude === "number") {
                lastCorrectionMagnitude = magnitude;
            }
        }
    }

    // Netgraph: Handle playerAcks for pending inputs tracking
    if (
        snapshot.playerAcks &&
        myPlayerId &&
        snapshot.playerAcks[myPlayerId] !== undefined
    ) {
        inputSender?.ack(snapshot.playerAcks[myPlayerId]);
        predictor?.ack(snapshot.playerAcks[myPlayerId]);
    }

    // Netgraph: Estimate clock offset using serverTime from snapshot
    // clockOffset = serverTime - clientTime (approximate)
    if (snapshot.serverTime !== undefined) {
        const clientNow = performance.now();
        // Use RTT/2 as one-way delay estimate for clock offset
        const rtt = gameConnection?.getRtt();
        const oneWayDelay = rtt ? rtt / 2 : 0;
        // Smooth clock offset estimation
        const newOffset = snapshot.serverTime - (clientNow + oneWayDelay);
        if (!firstSnapshotReceived) {
            clockOffset = newOffset;
            firstSnapshotReceived = true;
        } else {
            // Exponential moving average with alpha = 0.1
            clockOffset = clockOffset * 0.9 + newOffset * 0.1;
        }
    }
}

function startGame(room, playerName) {
    retryButton.style.display = "none";

    const input = createInput();

    roomWidth = Number(room.width) || canvas.viewWidth;
    roomHeight = Number(room.height) || canvas.viewHeight;

    // M3: reset per-game interpolation/bullet-prediction state.
    if (interpolator) {
        interpolator.reset();
    }
    if (bulletPredictor) {
        bulletPredictor.reset();
    }
    localFireCooldown = 0;

    let loop;
    let netgraph;

    loop = createLoop({
        simulate(_dt) {
            // Sample input every simulation step (60 Hz). One-shot actions are
            // captured here, before clearJustPressed(), so short presses are
            // never lost between 30 Hz transmission steps.
            const currentInput = {
                thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
                turnLeft: input.isDown("ArrowLeft") || input.isDown("KeyA"),
                turnRight: input.isDown("ArrowRight") || input.isDown("KeyD"),
                fire: input.isDown("Space"),
                switchWeapon: input.justPressed("KeyE"),
            };

            // The transmitter decides when to actually transmit (30 Hz) and
            // latches one-shot actions until the handoff succeeds.
            inputTransmitter?.step(currentInput);

            // M2: predict the local ship one step forward. Prediction only runs
            // once we have authoritative state to reconcile against.
            if (predictor?.hasState()) {
                predictor.predict(currentInput);
            }

            // M3: local bullet prediction. When the local ship fires, spawn a
            // predicted bullet immediately (using the predicted ship state so
            // the bullet matches what the player sees). A local fire cooldown
            // mirrors the server's 0.25 s bullet cooldown so we do not spawn
            // duplicate predictions between authoritative confirmations.
            if (bulletPredictor && predictor?.hasState() && currentInput.fire) {
                const ship = predictor.getPredicted();
                const localShip = authoritativeWorld?.get(myShipId);
                if (ship && localShip && localFireCooldown <= 0) {
                    const direction = { x: Math.cos(ship.angle), y: Math.sin(ship.angle) };
                    const noseX = ship.pos.x + direction.x * 15;
                    const noseY = ship.pos.y + direction.y * 15;
                    const bvx = ship.vel.x + direction.x * 450;
                    const bvy = ship.vel.y + direction.y * 450;
                    bulletPredictor.spawnBullet({
                        x: noseX,
                        y: noseY,
                        vx: bvx,
                        vy: bvy,
                        angle: ship.angle,
                    });
                    localFireCooldown = 0.25;
                }
            }
            if (localFireCooldown > 0) {
                localFireCooldown = Math.max(0, localFireCooldown - _dt);
            }

            // Advance predicted bullets one step.
            if (bulletPredictor) {
                bulletPredictor.update(_dt);
            }

            input.clearJustPressed();
        },

        // eslint-disable-next-line no-unused-vars
        render(_alpha) {
            const context = canvas.context;

            // Screen-space drawing uses CSS viewport dimensions. The context
            // base transform already applies devicePixelRatio exactly once, so
            // using the backing-buffer size here would apply DPR twice.
            const viewWidth = canvas.viewWidth;
            const viewHeight = canvas.viewHeight;

            context.clearRect(0, 0, viewWidth, viewHeight);

            // Uniform scale preserves the world aspect ratio; the letterbox
            // offsets centre the world inside the viewport.
            const { scale, offsetX, offsetY } = computeWorldViewport({
                viewWidth,
                viewHeight,
                roomWidth,
                roomHeight,
            });

            context.save();
            context.translate(offsetX, offsetY);
            context.scale(scale, scale);

            drawGrid(context, roomWidth, roomHeight);

            if (authoritativeWorld) {
                // Find my ship
                let myShip = null;
                if (myShipId) {
                    myShip = authoritativeWorld.get(myShipId);
                }

                // Render all entities
                // M2: the local ship is rendered from the prediction/reconciliation
                // pipeline (predicted position + smoothed error), not the raw
                // authoritative snapshot, so it feels instant.
                const predictedRender = predictor?.getRenderState();

                // M3: interpolate remote entities at `now - interpolationDelay`
                // so 30 Hz snapshots render smoothly at the display rate. The
                // local ship is excluded (it uses the prediction pipeline).
                const interpolated = interpolator
                    ? interpolator.interpolate()
                    : null;

                for (const ship of authoritativeWorld.ofKind("ship")) {
                    const isMyShip = ship.id === myShipId;
                    let renderShip;

                    if (isMyShip && predictedRender) {
                        renderShip = {
                            x: predictedRender.pos.x,
                            y: predictedRender.pos.y,
                            angle: predictedRender.angle,
                            thrust: ship.thrust,
                        };
                    } else if (interpolated && interpolated.has(ship.id)) {
                        const ip = interpolated.get(ship.id);
                        renderShip = {
                            x: ip.x,
                            y: ip.y,
                            angle: ip.angle,
                            thrust: ip.thrust,
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
                    // Remote bullets are interpolated; the authoritative
                    // position is used as a fallback when interpolation has no
                    // bracketing frame for this bullet yet.
                    let drawPos = bullet;
                    if (interpolated && interpolated.has(bullet.id)) {
                        const ip = interpolated.get(bullet.id);
                        drawPos = { pos: { x: ip.x, y: ip.y }, radius: bullet.radius, angle: ip.angle };
                    }
                    drawBullet(context, drawPos);
                }

                for (const missile of authoritativeWorld.ofKind("missile")) {
                    let drawPos = missile;
                    if (interpolated && interpolated.has(missile.id)) {
                        const ip = interpolated.get(missile.id);
                        drawPos = { pos: { x: ip.x, y: ip.y }, radius: missile.radius, angle: ip.angle };
                    }
                    drawMissile(context, drawPos);
                }

                // M3: draw locally predicted bullets (not yet confirmed by an
                // authoritative snapshot) so the player sees their shots
                // immediately.
                if (bulletPredictor) {
                    for (const pb of bulletPredictor.getRenderBullets()) {
                        drawBullet(context, {
                            pos: { x: pb.x, y: pb.y },
                            radius: pb.radius,
                        });
                    }
                }

                for (const pickup of authoritativeWorld.ofKind("pickup")) {
                    drawPickup(context, pickup);
                }

                for (const asteroid of authoritativeWorld.ofKind("asteroid")) {
                    drawAsteroid(context, asteroid);
                }

                for (const explosion of authoritativeWorld.ofKind(
                    "explosion",
                )) {
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
                    context.fillText(
                        `Score: ${authoritativeWorld.score}`,
                        20,
                        162,
                    );
                    context.fillText(
                        `Missiles: ${myShip.missileCount}`,
                        20,
                        184,
                    );
                    context.fillText(
                        `Weapon: ${myShip.weapon.toUpperCase()} [E]`,
                        20,
                        206,
                    );
                }
            }

            // Render Netgraph overlay. Drawn in screen space (outside the
            // world transform) so it is unaffected by camera scaling and does
            // not depend on the world being initialized.
            if (netgraph) {
                netgraph.render();
            }
        },
    });

    loop.start();

    // Netgraph initialization
    netgraph = createNetgraph(canvas, () => {
        const rtt = gameConnection?.getRtt();
        const bytes = gameConnection?.getBytesPerSecond() || {
            sent: 0,
            received: 0,
        };

        // Calculate snapshot age: clientNow - (serverTime - clockOffset)
        // serverTime at snapshot creation = snapshot.serverTime
        // client time when snapshot created ≈ snapshot.serverTime - clockOffset
        // age = clientNow - (snapshot.serverTime - clockOffset)
        // But we track it continuously using last snapshot's serverTime
        let age = null;
        if (firstSnapshotReceived && lastSnapshotTick >= 0) {
            // The last snapshot had serverTime, we can estimate its age
            // Since we don't store each snapshot's serverTime, we use clockOffset
            // age = clientNow - (estimatedServerTimeOfLastSnapshot)
            // estimatedServerTimeOfLastSnapshot = clientNowOfReceipt - oneWayDelay
            // But simpler: use clockOffset to estimate current server time
            // then age = currentServerTime - lastSnapshotServerTime
            // We don't track lastSnapshotServerTime, so we approximate:
            // snapshotAge ≈ (clientNow - clockOffset) - (lastSnapshotTick * 1000/30 + serverStartTime)
            // This is approximate. For now, we'll compute based on RTT and tick.
            // const tickInterval = 1000 / 30;
            // We don't know server start time, so we use a different approach
            // Snapshot age = time since snapshot was generated on server
            // = (clientNow - clientTimeWhenSnapshotReceived) + (clientTimeWhenSnapshotReceived - serverTimeWhenSnapshotGenerated)
            // The second term is approximately one-way delay
            // For display, we'll use: RTT/2 + time since receipt
            // This is a simplification
            if (rtt !== null) {
                age = rtt / 2; // Base latency
                // Add time since last snapshot receipt (we don't track this precisely)
            }
        }

        return {
            rtt,
            snapshotAge: age,
            bytesInPerSec: bytes.received,
            bytesOutPerSec: bytes.sent,
            pendingInputs: inputSender?.getPendingCount() ?? 0,
            correction: predictor?.hasState() ? lastCorrectionMagnitude : null,
            interpolationDelay: interpolator ? interpolator.getDelayMs() : null,
        };
    });

    // Toggle netgraph with F1 key; adjust interpolation delay with [ and ].
    const handleKeyDown = (event) => {
        if (event.key === "F1") {
            event.preventDefault();
            netgraph.toggle();
        } else if (event.key === "[" || event.key === "{") {
            // Decrease interpolation delay by 10 ms.
            if (interpolator) {
                interpolator.adjustDelay(-10);
            }
        } else if (event.key === "]" || event.key === "}") {
            // Increase interpolation delay by 10 ms.
            if (interpolator) {
                interpolator.adjustDelay(10);
            }
        }
    };
    window.addEventListener("keydown", handleKeyDown);

    // Store cleanup function
    window.netgraphCleanup = () => {
        window.removeEventListener("keydown", handleKeyDown);
    };
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

            // Cleanup previous netgraph
            if (window.netgraphCleanup) {
                window.netgraphCleanup();
            }

            gameConnection?.disconnect();

            // M4: select the data-plane transport codec. `?codec=binary` opts
            // into the binary DataView protocol for input/snapshot; anything
            // else (including no flag) keeps the JSON transport.
            const requestedCodec = (() => {
                try {
                    const value = new URL(window.location.href).searchParams.get(
                        "codec",
                    );
                    return value === "binary" ? "binary" : "json";
                } catch {
                    return "json";
                }
            })();

            gameConnection = new Connection({ codec: requestedCodec });
            window.gameConnection = gameConnection;

            let gameStarted = false;

            gameConnection.addEventListener("open", () => {
                console.log("WebSocket connected");

                gameConnection.send({
                    type: "join",
                    roomId: room.id,
                    playerName,
                    codec: requestedCodec,
                });
            });

            gameConnection.addEventListener("joined", (event) => {
                console.log("Joined room:", event.detail.roomId);
                console.log("Player ID:", event.detail.playerId);
                console.log("Ship ID:", event.detail.shipId);
                console.log("Seed:", event.detail.seed);
                console.log("Room config:", event.detail.roomConfig);

                // M4: report the negotiated transport codec and warn on a
                // mismatch (the server echoes the codec it will use for
                // snapshots to this connection).
                const activeCodec = event.detail.codec || "json";
                if (activeCodec !== requestedCodec) {
                    console.warn(
                        `Transport codec mismatch: requested ${requestedCodec}, server negotiated ${activeCodec}`,
                    );
                } else {
                    console.log(`Transport codec: ${activeCodec}`);
                }

                myPlayerId = event.detail.playerId;
                myShipId = event.detail.shipId;

                // Reset sequence state and transmission cadence for the new
                // match session.
                ensureInputPipeline();
                inputSender.reset();
                inputTransmitter.reset();
                predictor.reset();
                lastCorrectionMagnitude = 0;

                lastSnapshotTick = NO_SNAPSHOT_TICK; // Wait for the new match's first snapshot

                // Netgraph: Reset ACK tracking
                firstSnapshotReceived = false;
                clockOffset = 0;

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

                // Netgraph: Clear pending inputs on disconnect
                inputSender?.clearPending();

                if (event.detail.permanent) {
                    showConnectionStatus(
                        `Connection rejected: ${
                            event.detail.reason || "server policy violation"
                        } (${event.detail.code})`,
                    );
                }
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
