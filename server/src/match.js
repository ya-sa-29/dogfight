import { EventEmitter } from "node:events";
import { createMatchLog } from "./matchlog.js";
import {
    World,
    Ship,
    initializeWorld,
    createRNG,
    wrapShip,
} from "@dogfight/shared";

const TICK_RATE = 30;
const TICK_INTERVAL = 1000 / TICK_RATE;

export class Match extends EventEmitter {
    constructor(id, roomConfig, { sendFn } = {}) {
        super();

        this.id = id;
        this.roomConfig = roomConfig;
        this.players = new Map(); // playerId -> { id, name, socket, shipId, inputSeq: 0, lastProcessedSeq: -1, pendingInputs: [] }
        this.matchLog = createMatchLog(id);

        // Generate authoritative seed for this match
        this.seed = createRNG(Date.now() + Math.random() * 1000000).randomInt(
            1,
            2147483647,
        );

        // Create authoritative world
        this.world = new World();
        this.world.score = 0;

        // Spawn ship for each player (will be done when players join)
        this.ships = new Map(); // playerId -> shipId

        // Server tick state
        this.tick = 0;
        this.running = false;
        this.nextTickTarget = 0;

        // Stats
        this.tickDurations = [];
        this.maxTickDurations = 100;

        // Scheduling jitter (actual tick start minus scheduled target), kept
        // signed for diagnostics and aggregated as absolute values. Uses the
        // same bounded window as tick durations so the two statistics stay
        // consistent.
        this.tickJitters = [];

        // Send function for downstream latency injection
        this.sendFn =
            sendFn ||
            ((socket, message) => {
                if (socket.readyState !== 1) return;
                try {
                    socket.send(JSON.stringify(message));
                } catch (error) {
                    console.error("Match send error:", error);
                }
            });

        this.on("event", (event) => {
            this.matchLog.write(event);
        });
    }

    getSeed() {
        return this.seed;
    }

    getRoomConfig() {
        return this.roomConfig;
    }

    addPlayer(player) {
        if (this.players.has(player.id)) {
            return false;
        }

        // Spawn ship for this player
        const roomWidth = this.roomConfig.width;
        const roomHeight = this.roomConfig.height;
        const ship = this.world.spawn(
            new Ship(roomWidth / 2, roomHeight / 2, player.id),
        );
        this.ships.set(player.id, ship.id);

        this.players.set(player.id, {
            ...player,
            shipId: ship.id,
            inputSeq: 0,
            lastProcessedSeq: -1,
            pendingInputs: [],
        });

        this.emit("join", player);
        this.emit("event", {
            type: "join",
            playerId: player.id,
            playerName: player.name,
        });

        // If this is the first player, initialize the world with seed
        if (this.players.size === 1) {
            this.initializeWorld();
        }

        return true;
    }

    initializeWorld() {
        // Initialize asteroids and pickup using authoritative seed
        const ship = this.world.get(this.ships.values().next().value);
        initializeWorld(
            this.world,
            this.seed,
            this.roomConfig.width,
            this.roomConfig.height,
            this.roomConfig.asteroidCount,
            ship,
        );
    }

    removePlayer(playerId) {
        const player = this.players.get(playerId);

        if (!player) {
            return false;
        }

        // Despawn ship
        const shipId = this.ships.get(playerId);
        if (shipId) {
            this.world.despawn(shipId);
            this.ships.delete(playerId);
        }

        this.players.delete(playerId);

        this.emit("leave", player);
        this.emit("event", {
            type: "leave",
            playerId: player.id,
            playerName: player.name,
        });

        if (this.players.size === 0) {
            this.emit("empty");
            this.matchLog.close();
            this.stop();
        }

        return true;
    }

    handleInput(playerId, input) {
        const player = this.players.get(playerId);
        if (!player) {
            return false;
        }

        // Validate sequence - must be next expected
        if (input.seq !== player.inputSeq) {
            console.warn(
                `Player ${playerId} sent input seq ${input.seq}, expected ${player.inputSeq}`,
            );
            return false;
        }

        // Store input for this tick
        player.pendingInputs.push(input);
        player.inputSeq++;

        return true;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.nextTickTarget = performance.now() + TICK_INTERVAL;
        this.scheduleNextTick();
    }

    stop() {
        this.running = false;
    }

    scheduleNextTick() {
        if (!this.running) return;

        const now = performance.now();
        const delay = Math.max(0, this.nextTickTarget - now);

        setTimeout(() => {
            this.tickLoop();
        }, delay);
    }

    tickLoop() {
        if (!this.running) return;

        const tickStart = performance.now();

        // Scheduling jitter: how far the callback actually fired from its
        // absolute target. Signed (negative = early, positive = late) so
        // diagnostics can show drift direction. Measured against the scheduled
        // target, NOT against World.step duration.
        const tickJitter = tickStart - this.nextTickTarget;
        this.tickJitters.push(tickJitter);
        if (this.tickJitters.length > this.maxTickDurations) {
            this.tickJitters.shift();
        }

        // Step simulation
        const dt = 1 / TICK_RATE;
        const inputs = this.getInputsForStep();
        this.world.step(dt, inputs);

        // Wrap ships
        // eslint-disable-next-line no-unused-vars
        for (const [_playerId, shipId] of this.ships) {
            const ship = this.world.get(shipId);
            if (ship && ship.alive) {
                wrapShip(ship, this.roomConfig.width, this.roomConfig.height);
            }
        }

        // Broadcast snapshot
        this.broadcastSnapshot();

        // Record tick duration
        const tickDuration = performance.now() - tickStart;
        this.tickDurations.push(tickDuration);
        if (this.tickDurations.length > this.maxTickDurations) {
            this.tickDurations.shift();
        }

        // Schedule next tick
        this.tick++;
        this.nextTickTarget += TICK_INTERVAL;
        this.scheduleNextTick();
    }

    getInputsForStep() {
        // Build per-ship inputs Map for world.step
        // Returns Map<shipId, Input> for per-entity input handling
        const inputsMap = new Map();

        for (const [playerId, player] of this.players) {
            const shipId = this.ships.get(playerId);
            if (!shipId) continue;

            // For each ship, combine all pending inputs into one input for this tick
            // Continuous actions (thrust, turnLeft, turnRight): use latest state
            // One-shot actions (fire, switchWeapon): OR across all pending inputs
            if (player.pendingInputs.length > 0) {
                let combinedInput = {
                    thrust: false,
                    turnLeft: false,
                    turnRight: false,
                    fire: false,
                    switchWeapon: false,
                };

                for (const pendingInput of player.pendingInputs) {
                    // Continuous actions: use latest (last) input's state
                    // One-shot actions: accumulate (OR)
                    combinedInput.thrust = pendingInput.thrust;
                    combinedInput.turnLeft = pendingInput.turnLeft;
                    combinedInput.turnRight = pendingInput.turnRight;
                    combinedInput.fire =
                        combinedInput.fire || pendingInput.fire;
                    combinedInput.switchWeapon =
                        combinedInput.switchWeapon || pendingInput.switchWeapon;
                }

                inputsMap.set(shipId, combinedInput);

                // Acknowledge all processed inputs
                const latestInput =
                    player.pendingInputs[player.pendingInputs.length - 1];
                player.lastProcessedSeq = latestInput.seq;
                player.pendingInputs = [];
            } else {
                // No input this tick - send empty input to maintain state
                inputsMap.set(shipId, {
                    thrust: false,
                    turnLeft: false,
                    turnRight: false,
                    fire: false,
                    switchWeapon: false,
                });
            }
        }

        return inputsMap;
    }

    broadcastSnapshot() {
        const entitiesSnapshot = this.world.getEntitiesSnapshot();

        // Build snapshot with per-player lastProcessedSeq
        const playerAcks = {};
        for (const [playerId, player] of this.players) {
            playerAcks[playerId] = player.lastProcessedSeq;
        }

        const snapshot = {
            type: "snapshot",
            tick: this.tick,
            serverTime: performance.now(), // Server timestamp for snapshot age calculation
            seed: this.seed,
            entities: entitiesSnapshot,
            playerAcks,
        };

        // Broadcast to all players
        for (const player of this.players.values()) {
            this.sendToPlayer(player.socket, snapshot);
        }

        // Also emit for match logging
        this.emit("event", {
            type: "snapshot",
            tick: this.tick,
            entityCount: entitiesSnapshot.length,
        });
    }

    sendToPlayer(socket, message) {
        if (socket.readyState !== 1) return; // WebSocket.OPEN = 1

        try {
            this.sendFn(socket, message);
        } catch (error) {
            console.error("Match send error:", error);
        }
    }

    getStats() {
        const avgTickDuration =
            this.tickDurations.length > 0
                ? this.tickDurations.reduce((a, b) => a + b, 0) /
                  this.tickDurations.length
                : 0;

        const maxTickDuration =
            this.tickDurations.length > 0 ? Math.max(...this.tickDurations) : 0;

        // Aggregate jitter as absolute values (sign is preserved in the
        // per-tick samples for diagnostics, but the headline numbers are
        // magnitudes). Returns 0 before the first tick.
        const avgAbsTickJitter =
            this.tickJitters.length > 0
                ? this.tickJitters.reduce((sum, j) => sum + Math.abs(j), 0) /
                  this.tickJitters.length
                : 0;

        const maxAbsTickJitter =
            this.tickJitters.length > 0
                ? this.tickJitters.reduce(
                      (max, j) => Math.max(max, Math.abs(j)),
                      0,
                  )
                : 0;

        return {
            tick: this.tick,
            tickRate: TICK_RATE,
            avgTickDurationMs: avgTickDuration,
            maxTickDurationMs: maxTickDuration,
            avgTickJitterMs: avgAbsTickJitter,
            maxTickJitterMs: maxAbsTickJitter,
            playerCount: this.players.size,
            entityCount: this.world.getEntitiesSnapshot().length,
        };
    }

    handleChat(playerId, message) {
        const player = this.players.get(playerId);
        if (!player) return false;

        const chatMessage = {
            playerId: player.id,
            playerName: player.name,
            message,
            timestamp: new Date().toISOString(),
        };

        this.emit("chat", chatMessage);
        this.emit("event", {
            type: "chat",
            ...chatMessage,
        });

        return chatMessage;
    }
}
