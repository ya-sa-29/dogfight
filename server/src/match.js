import { EventEmitter } from 'node:events';
import { createMatchLog } from './matchlog.js';
import { World, Ship, initializeWorld, createRNG, wrapShip } from '@dogfight/shared';

const TICK_RATE = 30;
const TICK_INTERVAL = 1000 / TICK_RATE;

export class Match extends EventEmitter {
    constructor(id, roomConfig) {
        super();

        this.id = id;
        this.roomConfig = roomConfig;
        this.players = new Map(); // playerId -> { id, name, socket, shipId, inputSeq: 0, lastProcessedSeq: -1, pendingInputs: [] }
        this.matchLog = createMatchLog(id);

        // Generate authoritative seed for this match
        this.seed = createRNG(Date.now() + Math.random() * 1000000).randomInt(1, 2147483647);

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

        this.on('event', (event) => {
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
            new Ship(roomWidth / 2, roomHeight / 2, player.id)
        );
        this.ships.set(player.id, ship.id);

        this.players.set(player.id, {
            ...player,
            shipId: ship.id,
            inputSeq: 0,
            lastProcessedSeq: -1,
            pendingInputs: [],
        });

        this.emit('join', player);
        this.emit('event', {
            type: 'join',
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
        initializeWorld(this.world, this.seed, this.roomConfig.width, this.roomConfig.height, this.roomConfig.asteroidCount, ship);
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

        this.emit('leave', player);
        this.emit('event', {
            type: 'leave',
            playerId: player.id,
            playerName: player.name,
        });

        if (this.players.size === 0) {
            this.emit('empty');
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
            console.warn(`Player ${playerId} sent input seq ${input.seq}, expected ${player.inputSeq}`);
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
        // Build inputs object for world.step
        // The shared World.step expects a single input object with thrust, turnLeft, turnRight, fire, switchWeapon
        // For now, we'll use the first player's input (single player) or combine inputs
        // For multiplayer, we need to handle each ship separately - but shared World.step doesn't support that yet
        // For Stage 2.1, we'll use a combined input approach

        let combinedInput = {
            thrust: false,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        };

        // eslint-disable-next-line no-unused-vars
        for (const [_playerId, player] of this.players) {
            if (player.pendingInputs.length > 0) {
                // Use the latest input for this tick
                const latestInput = player.pendingInputs[player.pendingInputs.length - 1];

                // Combine inputs (OR for boolean actions)
                combinedInput.thrust = combinedInput.thrust || latestInput.thrust;
                combinedInput.turnLeft = combinedInput.turnLeft || latestInput.turnLeft;
                combinedInput.turnRight = combinedInput.turnRight || latestInput.turnRight;
                combinedInput.fire = combinedInput.fire || latestInput.fire;
                combinedInput.switchWeapon = combinedInput.switchWeapon || latestInput.switchWeapon;

                // Acknowledge all processed inputs
                player.lastProcessedSeq = latestInput.seq;
                player.pendingInputs = [];
            }
        }

        return combinedInput;
    }

    broadcastSnapshot() {
        const entitiesSnapshot = this.world.getEntitiesSnapshot();

        // Build snapshot with per-player lastProcessedSeq
        const playerAcks = {};
        for (const [playerId, player] of this.players) {
            playerAcks[playerId] = player.lastProcessedSeq;
        }

        const snapshot = {
            type: 'snapshot',
            tick: this.tick,
            seed: this.seed,
            entities: entitiesSnapshot,
            playerAcks,
        };

        // Broadcast to all players
        for (const player of this.players.values()) {
            this.sendToPlayer(player.socket, snapshot);
        }

        // Also emit for match logging
        this.emit('event', {
            type: 'snapshot',
            tick: this.tick,
            entityCount: entitiesSnapshot.length,
        });
    }

    sendToPlayer(socket, message) {
        if (socket.readyState !== 1) return; // WebSocket.OPEN = 1

        try {
            socket.send(JSON.stringify(message));
        } catch (error) {
            console.error('Match send error:', error);
        }
    }

    getStats() {
        const avgTickDuration = this.tickDurations.length > 0
            ? this.tickDurations.reduce((a, b) => a + b, 0) / this.tickDurations.length
            : 0;

        const maxTickDuration = this.tickDurations.length > 0
            ? Math.max(...this.tickDurations)
            : 0;

        return {
            tick: this.tick,
            tickRate: TICK_RATE,
            avgTickDurationMs: avgTickDuration,
            maxTickDurationMs: maxTickDuration,
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

        this.emit('chat', chatMessage);
        this.emit('event', {
            type: 'chat',
            ...chatMessage,
        });

        return chatMessage;
    }
}