
import { performance } from "node:perf_hooks";
import {
    World,
    Ship,
    Asteroid,
    Pickup,
    Vector2,
    wrapShip,
} from "@dogfight/shared";
import { mulberry32 } from "@dogfight/shared/sim/random.js";

const TICK_RATE = 30;
const TICK_INTERVAL = 1000 / TICK_RATE;
const MAX_BUFFERED_AMOUNT = 1024 * 1024;
const MAX_PENDING_INPUTS = 120;

export class Match {
    constructor(room) {
        this.room = room;
        this.world = new World();
        this.players = new Map();

        // Останній застосований стан керування кожного гравця.
        this.inputs = new Map();

        this.tick = 0;
        this.running = false;
        this.timer = null;

        this.width = Number(room.config?.width) || 1600;
        this.height = Number(room.config?.height) || 900;

        this.random = mulberry32(this.createSeed());

        this.firstTickAt = null;
        this.lastTickAt = null;
        this.lastTickInterval = null;

        this.totalTickDuration = 0;
        this.lastTickDuration = 0;
        this.maxTickDuration = 0;

        this.totalJitter = 0;
        this.maxJitter = 0;
        this.jitterSamples = 0;

        this.initializeWorld();
    }

    createSeed() {
        return Math.floor(Math.random() * 0xFFFFFFFF);
    }

    initializeWorld() {
        const configuredCount = Number(this.room.config?.asteroidCount);

        const asteroidCount =
            Number.isInteger(configuredCount) && configuredCount >= 0
                ? configuredCount
                : 8;

        for (let i = 0; i < asteroidCount; i++) {
            const position = new Vector2(
                80 + this.random() * (this.width - 160),
                80 + this.random() * (this.height - 160),
            );

            const velocity = new Vector2(
                (this.random() - 0.5) * 80,
                (this.random() - 0.5) * 80,
            );

            this.world.spawn(
                new Asteroid(
                    position,
                    velocity,
                    18 + this.random() * 17,
                ),
            );
        }

        this.world.spawn(
            new Pickup(
                new Vector2(
                    this.width * 0.7,
                    this.height * 0.3,
                ),
            ),
        );
    }

    addPlayer(player) {
        if (this.players.has(player.id)) {
            return false;
        }

        const ship = this.world.spawn(
            new Ship(this.width / 2, this.height / 2),
        );

        this.players.set(player.id, {
            player,
            ship,
            lastReceivedSeq: 0,
            lastProcessedSeq: 0,
            pendingInputs: [],
            seenShotIds: new Set(),
        });

        this.inputs.set(player.id, {
            thrust: false,
            turn: 0,
            seq: 0,
        });

        if (!this.running) {
            this.start();
        }

        return true;
    }

    removePlayer(playerId) {
        const state = this.players.get(playerId);

        if (!state) {
            return false;
        }

        this.world.despawn(state.ship.id);
        this.players.delete(playerId);
        this.inputs.delete(playerId);

        if (this.players.size === 0) {
            this.stop();
        }

        return true;
    }

    setInput(playerId, input) {
        const state = this.players.get(playerId);

        if (!state || input.seq <= state.lastReceivedSeq) {
            return false;
        }

        if (
            input.fire &&
            (
                typeof input.clientShotId !== "string" ||
                !input.clientShotId.trim() ||
                state.seenShotIds.has(input.clientShotId)
            )
        ) {
            return false;
        }

        if (state.pendingInputs.length >= MAX_PENDING_INPUTS) {
            state.player.socket?.close?.(1013, "Input queue full");
            return false;
        }

        state.pendingInputs.push({
            thrust: input.thrust,
            turn: input.turn,
            fire: input.fire,
            clientShotId: input.fire ? input.clientShotId : undefined,
            seq: input.seq,
        });

        if (input.fire) {
            state.seenShotIds.add(input.clientShotId);
        }

        state.lastReceivedSeq = input.seq;

        return true;
    }

    createSnapshot(playerId) {
        const playerState = this.players.get(playerId);

        if (!playerState) {
            return null;
        }

        const playerIdsByShipId = new Map();

        for (const [id, state] of this.players) {
            playerIdsByShipId.set(state.ship.id, id);
        }

        const entities = [];

        for (const entity of this.world) {
            if (!entity.alive) {
                continue;
            }

            const snapshotEntity = {
                id: entity.id,
                kind: entity.kind,
                pos: {
                    x: entity.pos.x,
                    y: entity.pos.y,
                },
                vel: {
                    x: entity.vel.x,
                    y: entity.vel.y,
                },
                angle: entity.angle,
                radius: entity.radius,
                hp: entity.hp,
            };

            if (entity.kind === "ship") {
                snapshotEntity.playerId =
                    playerIdsByShipId.get(entity.id);

                snapshotEntity.thrust = entity.thrust;
                snapshotEntity.weapon = entity.weapon;
                snapshotEntity.missileCount = entity.missileCount;
            }

            if (entity.kind === "bullet") {
                snapshotEntity.playerId = entity.playerId;
                snapshotEntity.clientShotId = entity.clientShotId;
            }

            entities.push(snapshotEntity);
        }

        return {
            type: "snapshot",
            tick: this.tick,
            entities,
            events: this.world.events.map((event) => ({
                ...event,
            })),
            lastProcessedSeq: playerState.lastProcessedSeq,
        };
    }

    broadcastSnapshot() {
        for (const [playerId, state] of this.players) {
            const socket = state.player.socket;

            if (!socket || socket.readyState !== 1) {
                continue;
            }

            if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                socket.close(1013, "Client too slow");
                continue;
            }

            const snapshot = this.createSnapshot(playerId);

            if (!snapshot) {
                continue;
            }

            socket.send(JSON.stringify(snapshot), (error) => {
                if (error) {
                    console.error("Snapshot send error:", error);
                }
            });
        }
    }

    start() {
        if (this.running) {
            return;
        }

        this.running = true;
        this.nextTickAt = performance.now() + TICK_INTERVAL;

        this.scheduleTick();
    }

    scheduleTick() {
        if (!this.running) {
            return;
        }

        const delay = Math.max(
            0,
            this.nextTickAt - performance.now(),
        );

        this.timer = setTimeout(() => this.runTick(), delay);
    }

    runTick() {
        if (!this.running) {
            return;
        }

        const tickStart = performance.now();

        if (this.lastTickAt !== null) {
            this.lastTickInterval = tickStart - this.lastTickAt;

            const jitter = Math.abs(
                this.lastTickInterval - TICK_INTERVAL,
            );

            this.totalJitter += jitter;
            this.jitterSamples++;

            this.maxJitter = Math.max(this.maxJitter, jitter);
        } else {
            this.firstTickAt = tickStart;
        }

        this.lastTickAt = tickStart;

        const worldInputs = new Map();

        for (const [playerId, state] of this.players) {
            // Обробляємо не більше одного input за серверний тик.
            const nextInput = state.pendingInputs.shift();

            if (nextInput) {
                this.inputs.set(playerId, {
                    thrust: nextInput.thrust,
                    turn: nextInput.turn,
                    seq: nextInput.seq,
                });

                state.lastProcessedSeq = nextInput.seq;
            }

            // Рух зберігається між тиками, а постріл є одноразовою подією.
            const currentInput = this.inputs.get(playerId);

            worldInputs.set(state.ship.id, {
                thrust: currentInput.thrust,
                turn: currentInput.turn,
                fire: Boolean(nextInput?.fire),
                playerId,
                clientShotId: nextInput?.clientShotId,
            });
        }

        this.world.step(1 / TICK_RATE, worldInputs);

        for (const state of this.players.values()) {
            if (state.ship.alive) {
                wrapShip(state.ship, this.width, this.height);
            }
        }

        this.tick++;

        this.lastTickDuration = performance.now() - tickStart;
        this.totalTickDuration += this.lastTickDuration;

        this.maxTickDuration = Math.max(
            this.maxTickDuration,
            this.lastTickDuration,
        );

        this.broadcastSnapshot();

        this.nextTickAt += TICK_INTERVAL;

        if (
            this.nextTickAt <
            performance.now() - TICK_INTERVAL
        ) {
            this.nextTickAt = performance.now() + TICK_INTERVAL;
        }

        this.scheduleTick();
    }

    getStats() {
        const elapsed =
            this.firstTickAt !== null && this.lastTickAt !== null
                ? this.lastTickAt - this.firstTickAt
                : 0;

        const tickRate =
            elapsed > 0
                ? ((this.tick - 1) * 1000) / elapsed
                : 0;

        return {
            roomId: this.room.id,
            running: this.running,
            players: this.players.size,
            tick: this.tick,
            targetTickRate: TICK_RATE,
            actualTickRate: Number(tickRate.toFixed(2)),
            lastTickIntervalMs:
                this.lastTickInterval === null
                    ? null
                    : Number(this.lastTickInterval.toFixed(2)),
            lastTickDurationMs: Number(
                this.lastTickDuration.toFixed(3),
            ),
            averageTickDurationMs:
                this.tick > 0
                    ? Number(
                          (this.totalTickDuration / this.tick).toFixed(3),
                      )
                    : 0,
            maxTickDurationMs: Number(
                this.maxTickDuration.toFixed(3),
            ),
            averageJitterMs:
                this.jitterSamples > 0
                    ? Number(
                          (this.totalJitter / this.jitterSamples).toFixed(3),
                      )
                    : 0,
            maxJitterMs: Number(this.maxJitter.toFixed(3)),
        };
    }

    stop() {
        this.running = false;

        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
