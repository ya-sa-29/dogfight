import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { createMatchLog, MatchLog } from "./matchlog.js";
import {
    World,
    Ship,
    initializeWorld,
    createRNG,
    wrapShip,
    SeededRNG,
    EntityId,
    EntityInput,
    InputMap,
} from "@dogfight/shared";

const TICK_RATE = 30;
const TICK_INTERVAL = 1000 / TICK_RATE;

export interface Player {
    id: string;
    name: string;
    socket: WebSocket;
    shipId: EntityId;
    inputSeq: number;
    lastProcessedSeq: number;
    pendingInputs: InputMessage[];
}

/** Player data required to join a match (server adds the rest). */
export interface PlayerJoinData {
    id: string;
    name: string;
    socket: WebSocket;
}

interface InputMessage {
    seq: number;
    tick: number;
    thrust: boolean;
    turnLeft: boolean;
    turnRight: boolean;
    fire: boolean;
    switchWeapon: boolean;
    clientBulletId?: number;
}

interface ShipInfo {
    id: EntityId;
    // Add other ship properties as needed
}

export class Match extends EventEmitter {
    id: string;
    roomConfig: RoomConfig;
    players: Map<string, Player>;
    matchLog: MatchLog;
    seed: number;
    world: World;
    ships: Map<string, EntityId>; // playerId -> shipId
    tick: number;
    running: boolean;
    nextTickTarget: number;
    tickDurations: number[];
    maxTickDurations: number;
    tickJitters: number[];
    sendFn: (socket: WebSocket, message: unknown) => void;

    constructor(id: string, roomConfig: RoomConfig, { sendFn }: { sendFn?: (socket: WebSocket, message: unknown) => void } = {}) {
        super();

        this.id = id;
        this.roomConfig = roomConfig;
        this.players = new Map();
        this.matchLog = createMatchLog(id);

        // Generate authoritative seed for this match
        const rng: SeededRNG = createRNG(Date.now() + Math.random() * 1000000);
        this.seed = rng.randomInt(1, 2147483647);

        // Create authoritative world
        this.world = new World();
        this.world.score = 0;

        // Spawn ship for each player (will be done when players join)
        this.ships = new Map();

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
            ((socket: WebSocket, message: unknown) => {
                if (socket.readyState !== 1) return;
                try {
                    socket.send(JSON.stringify(message));
                } catch (error: unknown) {
                    console.error("Match send error:", error);
                }
            });

        this.on("event", (event: Record<string, unknown>) => {
            this.matchLog.write(event);
        });
    }

    getSeed(): number {
        return this.seed;
    }

    getRoomConfig(): RoomConfig {
        return this.roomConfig;
    }

    addPlayer(player: PlayerJoinData): boolean {
        if (this.players.has(player.id)) {
            return false;
        }

        // Spawn ship for this player
        const roomWidth = this.roomConfig.width;
        const roomHeight = this.roomConfig.height;
        // Let the world assign a fresh EntityId (pass 0 as EntityId)
        const ship = this.world.spawn(
            new Ship(roomWidth / 2, roomHeight / 2, 0 as EntityId),
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

    initializeWorld(): void {
        // Initialize asteroids and pickup using authoritative seed
        const shipId = this.ships.values().next().value;
        if (!shipId) return;
        const ship = this.world.get(shipId);
        if (!ship) return;
        initializeWorld(
            this.world,
            this.seed,
            this.roomConfig.width,
            this.roomConfig.height,
            this.roomConfig.asteroidCount,
            ship,
        );
    }

    removePlayer(playerId: string): boolean {
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

    handleInput(playerId: string, input: InputMessage): boolean {
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

    start(): void {
        if (this.running) return;
        this.running = true;
        this.nextTickTarget = performance.now() + TICK_INTERVAL;
        this.scheduleNextTick();
    }

    stop(): void {
        this.running = false;
    }

    scheduleNextTick(): void {
        if (!this.running) return;

        const now = performance.now();
        const delay = Math.max(0, this.nextTickTarget - now);

        setTimeout(() => {
            this.tickLoop();
        }, delay);
    }

    tickLoop(): void {
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

    getInputsForStep(): InputMap {
        // Build per-ship inputs Map for world.step
        // Returns Map<shipId, EntityInput> for per-entity input handling
        const inputsMap = new Map<EntityId, EntityInput>();

        for (const [playerId, player] of this.players) {
            const shipId = this.ships.get(playerId);
            if (shipId === undefined || shipId === null) continue;

            // For each ship, combine all pending inputs into one input for this tick
            // Continuous actions (thrust, turnLeft, turnRight): use latest state
            // One-shot actions (fire, switchWeapon): OR across all pending inputs
            if (player.pendingInputs.length > 0) {
                let combinedInput: EntityInput = {
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
                    player.pendingInputs[player.pendingInputs.length - 1]!;
                player.lastProcessedSeq = latestInput.seq;
                player.pendingInputs = [];
            } else {
                // No input this tick - send neutral input to maintain state
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

    broadcastSnapshot(): void {
        const entitiesSnapshot = this.world.getEntitiesSnapshot();

        // Build snapshot with per-player lastProcessedSeq
        const playerAcks: Record<string, number> = {};
        for (const [playerId, player] of this.players) {
            playerAcks[playerId] = player.lastProcessedSeq;
        }

        const snapshot = {
            type: "snapshot" as const,
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

    sendToPlayer(socket: WebSocket, message: unknown): void {
        if (socket.readyState !== 1) return; // WebSocket.OPEN = 1

        try {
            this.sendFn(socket, message);
        } catch (error: unknown) {
            console.error("Match send error:", error);
        }
    }

    getStats(): MatchStats {
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

    handleChat(playerId: string, message: string): ChatMessage | false {
        const player = this.players.get(playerId);
        if (!player) return false;

        const chatMessage: ChatMessage = {
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

interface RoomConfig {
    width: number;
    height: number;
    asteroidCount: number;
}

interface MatchStats {
    tick: number;
    tickRate: number;
    avgTickDurationMs: number;
    maxTickDurationMs: number;
    avgTickJitterMs: number;
    maxTickJitterMs: number;
    playerCount: number;
    entityCount: number;
}

interface ChatMessage {
    playerId: string;
    playerName: string;
    message: string;
    timestamp: string;
}