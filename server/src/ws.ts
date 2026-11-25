import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { roomManager } from "./roomManager.js";
import { getRooms } from "./rooms.js";
import {
    createLatencyQueue,
    parseLatencyConfig,
    LatencyQueue,
} from "./latency-injector.js";
import { createTokenBucket, TokenBucket } from "./token-bucket.js";
import {
    encodeServerMessage,
    decodeClientFrame,
    normalizeCodec,
    TRANSPORT_JSON,
    TRANSPORT_BINARY,
    WireClientMessage,
} from "./wire.js";
import { parseClientMessage, ProtocolError } from "@dogfight/shared";
import type { Match, PlayerJoinData } from "./match.js";
import type { RoomConfig } from "./rooms.js";
import { config, isOriginAllowed, parseAllowedOrigins } from "./config.js";
import { logger, childLogger, LogContext } from "./logger.js";
import {
    incrementConnectedPlayers,
    incrementActiveRooms,
    recordMessageIn,
    recordMessageOut,
    recordRejection,
} from "./metrics.js";

/** Type guard for join messages (only valid for JSON-mode messages). */
function isJoinMessage(msg: WireClientMessage): msg is WireClientMessage & {
    roomId: string;
    playerName: string;
    codec: "json" | "binary";
} {
    return (
        msg.type === "join" &&
        "roomId" in msg &&
        "playerName" in msg &&
        "codec" in msg
    );
}

const JOIN_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 15000;

// Two independent buckets. Input traffic is the hot path (the client transmits
// at 30 Hz), so it gets a higher refill rate than control traffic.
const INPUT_RATE_LIMIT = 40;
const INPUT_RATE_BURST = 20;

const CONTROL_RATE_LIMIT = 10;
const CONTROL_RATE_BURST = 20;

const MAX_BUFFERED_AMOUNT = 1024 * 1024;

// Per-IP connection tracking for connection caps.
const connectionsByIp = new Map<string, Set<WebSocket>>();

function normalizeIp(ip: string | null | undefined): string {
    if (!ip) return "unknown";

    // Normalize IPv4-mapped IPv6 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
    if (ip.startsWith("::ffff:")) {
        return ip.slice(7);
    }

    return ip;
}

function getClientIp(request: import("http").IncomingMessage): string {
    // Use the socket's remote address. X-Forwarded-For is not trusted by
    // default; only enable it when an explicit reverse-proxy trust model is
    // configured in front of this server.
    return normalizeIp(request.socket.remoteAddress);
}

function addConnection(ip: string, socket: WebSocket): void {
    let set = connectionsByIp.get(ip);
    if (!set) {
        set = new Set();
        connectionsByIp.set(ip, set);
    }
    set.add(socket);
}

function removeConnection(ip: string, socket: WebSocket): void {
    const set = connectionsByIp.get(ip);
    if (!set) return;

    set.delete(socket);
    if (set.size === 0) {
        connectionsByIp.delete(ip);
    }
}

function connectionCountForIp(ip: string): number {
    const set = connectionsByIp.get(ip);
    return set ? set.size : 0;
}

// Extended properties stored separately to avoid WebSocket type conflicts
interface SocketExtensions {
    player: { id: string; name: string; socket: WebSocket } | null;
    match: Match | null;
    missedPongs: number;
    transportCodec: "json" | "binary";
}

const socketExtensions = new WeakMap<WebSocket, SocketExtensions>();

function getExt(socket: WebSocket): SocketExtensions {
    let ext = socketExtensions.get(socket);
    if (!ext) {
        ext = {
            player: null,
            match: null,
            missedPongs: 0,
            transportCodec: TRANSPORT_JSON,
        };
        socketExtensions.set(socket, ext);
    }
    return ext;
}

interface ChatMessage {
    playerId: string;
    playerName: string;
    message: string;
    timestamp: string;
}

export function setupWebSocket(
    server: import("http").Server,
    { loadRooms = getRooms, now = () => Date.now() } = {},
) {
    const allowedOrigins = parseAllowedOrigins(config.allowedOrigins);

    const wss = new WebSocketServer({
        server,
        path: "/ws",
        maxPayload: 16 * 1024,

        // Origin verification: reject browser connections from unapproved origins.
        // A value of "*" allows all origins (suitable for local development).
        // In production, set ALLOWED_ORIGINS to a comma-separated list of
        // trusted origins (e.g. https://dogfight.example.com).
        verifyClient: (info: {
            origin: string | null;
            req: import("http").IncomingMessage;
        }) => {
            const origin = info.origin ?? null;
            const allowed = isOriginAllowed(origin);

            if (!allowed) {
                recordRejection("origin");
                logger.warn(
                    { origin, ip: getClientIp(info.req) },
                    "WebSocket origin rejected",
                );
                return false;
            }

            // Per-IP connection cap
            const ip = getClientIp(info.req);
            if (connectionCountForIp(ip) >= config.maxConnectionsPerIp) {
                recordRejection("per_ip_cap");
                logger.warn(
                    { ip, limit: config.maxConnectionsPerIp },
                    "WebSocket per-IP connection cap exceeded",
                );
                return false;
            }

            return true;
        },
    });

    wss.on(
        "connection",
        (socket: WebSocket, request: import("http").IncomingMessage) => {
            const ip = getClientIp(request);
            addConnection(ip, socket);
            incrementConnectedPlayers(1);

            const ext = getExt(socket);
            ext.player = null;
            ext.match = null;
            ext.missedPongs = 0;
            ext.transportCodec = TRANSPORT_JSON;

            const log = childLogger({ roomId: undefined, playerId: undefined });

            log.info({ ip }, "WebSocket client connected");

            // Parse latency configuration from request URL
            const requestUrl = request.url ?? "";
            const latencyConfig = parseLatencyConfig(requestUrl);

            // Create latency queues for this socket
            const upstreamQueue: LatencyQueue = createLatencyQueue(
                socket,
                latencyConfig,
                "upstream",
            );
            const downstreamQueue: LatencyQueue = createLatencyQueue(
                socket,
                latencyConfig,
                "downstream",
            );

            let joined = false;

            // Token Buckets (per connection, independent)
            const inputBucket: TokenBucket = createTokenBucket({
                refillRate: INPUT_RATE_LIMIT,
                burst: INPUT_RATE_BURST,
                now,
            });

            const controlBucket: TokenBucket = createTokenBucket({
                refillRate: CONTROL_RATE_LIMIT,
                burst: CONTROL_RATE_BURST,
                now,
            });

            const joinTimeout = setTimeout(() => {
                if (!joined) {
                    log.info("Join timeout");
                    recordRejection("join_timeout");
                    socket.close(1008, "Join timeout");
                }
            }, JOIN_TIMEOUT);

            socket.on("pong", () => {
                getExt(socket).missedPongs = 0;
            });

            function recordMessage(bytes: number, isIncoming: boolean): void {
                if (isIncoming) {
                    recordMessageIn(bytes);
                } else {
                    recordMessageOut(bytes);
                }
            }

            function handleMessage(
                s: WebSocket,
                rawData: Buffer | ArrayBuffer | Uint8Array | string,
                isBinary: boolean,
            ) {
                let message: WireClientMessage;

                try {
                    const decoded = decodeClientFrame(rawData, isBinary);
                    if (!decoded) {
                        throw new Error("Invalid message format");
                    }
                    message = decoded;
                } catch (error: unknown) {
                    if (!controlBucket.consume()) {
                        log.info("Rate limit exceeded");
                        recordRejection("rate_limit");
                        s.close(1008, "Rate limit exceeded");
                        return;
                    }

                    logger.error(error, "Invalid WebSocket message");
                    const err =
                        error instanceof Error
                            ? error
                            : new Error(String(error));
                    const closeCode =
                        error instanceof ProtocolError ? error.closeCode : 1008;
                    s.close(closeCode, err.message);
                    return;
                }

                const bucket =
                    message.type === "input" ? inputBucket : controlBucket;

                if (!bucket.consume()) {
                    log.info("Rate limit exceeded");
                    recordRejection("rate_limit");
                    s.close(1008, "Rate limit exceeded");
                    return;
                }

                if (message.type === "join") {
                    if (joined) {
                        s.close(1008, "Already joined");
                        return;
                    }

                    let roomConfig: RoomConfig | null = null;
                    loadRooms()
                        .then((rooms: RoomConfig[]) => {
                            const room = rooms.find(
                                (r) => r.id === message.roomId,
                            );
                            if (room) {
                                roomConfig = room;
                            }
                            handleJoin(roomConfig, message);
                        })
                        .catch((err) => {
                            logger.error(err, "Failed to get rooms");
                            s.close(1008, "Server error");
                        });

                    function handleJoin(
                        roomConfig: RoomConfig | null,
                        joinMsg: WireClientMessage,
                    ) {
                        if (!roomConfig) {
                            s.close(1008, "Room not found");
                            return;
                        }

                        if (!isJoinMessage(joinMsg)) {
                            s.close(1008, "Invalid join message");
                            return;
                        }

                        if (s.readyState !== WebSocket.OPEN) {
                            return;
                        }

                        let match = roomManager.getMatch(joinMsg.roomId);

                        if (
                            !match &&
                            roomManager.matches.size >= config.maxRooms
                        ) {
                            s.close(1008, "Server room limit reached");
                            return;
                        }

                        if (!match) {
                            match = roomManager.createMatch(
                                joinMsg.roomId,
                                roomConfig,
                                {
                                    sendFn: (
                                        targetSocket: WebSocket,
                                        msg: unknown,
                                    ) => {
                                        sendMessage(
                                            targetSocket,
                                            msg as import("@dogfight/shared").ServerMessage,
                                        );
                                    },
                                },
                            );
                        }

                        if (!match) {
                            s.close(1008, "Could not create match");
                            return;
                        }

                        if (match.players.size >= config.maxPlayersPerRoom) {
                            s.close(1008, "Room is full");
                            return;
                        }

                        const sExt = getExt(s);
                        const player = {
                            id: randomUUID(),
                            name: joinMsg.playerName,
                            socket: s,
                        };
                        sExt.player = player;

                        sExt.transportCodec = normalizeCodec(joinMsg.codec);

                        const added = match.addPlayer(player);

                        if (!added) {
                            s.close(1008, "Could not join match");
                            return;
                        }

                        sExt.match = match;
                        joined = true;

                        if (match.players.size === 1) {
                            match.start();
                        }

                        clearTimeout(joinTimeout);

                        const playerLog = childLogger({
                            roomId: match.id,
                            playerId: player.id,
                        });

                        playerLog.info(
                            { playerName: player.name, roomId: match.id },
                            "Player joined match",
                        );

                        sendMessage(s, {
                            type: "joined",
                            playerId: sExt.player.id,
                            seed: match.getSeed(),
                            roomConfig: match.getRoomConfig(),
                            shipId: match.ships.get(sExt.player.id) ?? 0,
                            codec: sExt.transportCodec,
                        } satisfies import("@dogfight/shared").ServerMessage);

                        broadcastRoster(match);
                    }
                    return;
                }

                if (!joined) {
                    s.close(1008, "Join required");
                    return;
                }

                if (message.type === "input") {
                    const result = parseClientMessage(message);
                    if (!result.success) {
                        logger.error(result.error, "Invalid input message");
                        s.close(1008, "Invalid input message");
                        return;
                    }
                    const validatedInput = result.data;
                    if (validatedInput.type !== "input") {
                        s.close(1008, "Expected input message");
                        return;
                    }

                    const sExt = getExt(s);
                    if (sExt.match && sExt.player) {
                        sExt.match.handleInput(sExt.player.id, validatedInput);
                    }
                    return;
                }

                if (message.type === "chat") {
                    const sExt = getExt(s);
                    if (sExt.match && sExt.player) {
                        const chatMessage = sExt.match.handleChat(
                            sExt.player.id,
                            message.message,
                        );

                        if (chatMessage) {
                            broadcast(sExt.match, {
                                type: "chat",
                                ...chatMessage,
                            } satisfies import("@dogfight/shared").ServerMessage);
                        }
                    }
                    return;
                }

                if (message.type === "leave") {
                    const sExt = getExt(s);
                    if (sExt.player) {
                        log.info(`Player ${sExt.player.name} left`);
                    }
                    s.close(1000, "Player left");
                }

                if (message.type === "ping") {
                    downstreamQueue.enqueue(
                        {
                            type: "pong",
                            timestamp: message.timestamp,
                            seq: message.seq,
                        } satisfies import("@dogfight/shared").ServerMessage,
                        (s: WebSocket, msg: unknown) =>
                            sendMessage(
                                s,
                                msg as import("@dogfight/shared").ServerMessage,
                            ),
                    );
                    return;
                }
            }

            socket.on("message", (data: Buffer, isBinary: boolean) => {
                const byteLength =
                    data instanceof Buffer ? data.byteLength : data.length;

                recordMessage(byteLength, true);

                upstreamQueue.enqueue(
                    data,
                    (s: WebSocket, rawData: unknown) =>
                        handleMessage(
                            s,
                            rawData as
                                Buffer | ArrayBuffer | Uint8Array | string,
                            isBinary,
                        ),
                    isBinary ? "input" : undefined,
                );
            });

            socket.on("close", () => {
                removeConnection(ip, socket);
                incrementConnectedPlayers(-1);

                log.info("WebSocket client disconnected");

                clearTimeout(joinTimeout);

                upstreamQueue.cleanup();
                downstreamQueue.cleanup();

                const ext = getExt(socket);
                if (joined && ext.match && ext.player) {
                    ext.match.removePlayer(ext.player.id);
                    broadcastRoster(ext.match);
                }
            });

            socket.on("error", (error: Error) => {
                logger.error(error, "WebSocket error");
            });
        },
    );

    const heartbeat = setInterval(() => {
        for (const socket of wss.clients) {
            if (socket.readyState !== WebSocket.OPEN) {
                continue;
            }

            const ext = getExt(socket);
            ext.missedPongs += 1;

            if (ext.missedPongs >= 2) {
                logger.info("Terminating unresponsive WebSocket client");
                socket.terminate();
                continue;
            }

            socket.ping();
        }
    }, HEARTBEAT_INTERVAL);

    wss.on("close", () => {
        clearInterval(heartbeat);
    });

    return wss;
}

/**
 * Notify all connected WebSocket clients that the server is shutting down,
 * then close each connection with code 1001 so clients can reconnect.
 */
export function notifyShutdown(wss: WebSocketServer): void {
    const shutdownMsg = JSON.stringify({
        type: "shutdown",
        reason: "server shutting down",
    });

    for (const socket of wss.clients) {
        if (socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(shutdownMsg);
            } catch {
                // Ignore send errors during shutdown.
            }
            try {
                socket.close(1001, "server shutting down");
            } catch {
                // Ignore close errors during shutdown.
            }
        }
    }
}

function sendMessage(
    socket: WebSocket,
    message: import("@dogfight/shared").ServerMessage,
): boolean {
    if (socket.readyState !== WebSocket.OPEN) {
        return false;
    }

    if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        logger.info("Slow client detected, closing connection");
        socket.close(1013, "Client too slow");
        return false;
    }

    const ext = getExt(socket);
    const payload = encodeServerMessage(message, ext.transportCodec);

    const byteLength =
        payload instanceof Buffer ? payload.byteLength : payload.length;

    const callback = (err: Error | null) => {
        if (err) {
            logger.error(err, "WebSocket send error");
        }
    };

    (
        socket.send as (
            data: string | Buffer,
            cb?: (err: Error | null) => void,
        ) => boolean
    )(payload, callback);

    recordMessageOut(byteLength);

    return true;
}

function broadcastRoster(match: Match): void {
    const roster: import("@dogfight/shared").ServerMessage = {
        type: "roster",
        players: Array.from(match.players.values()).map((player) => ({
            id: player.id,
            name: player.name,
        })),
    };

    broadcast(match, roster);
}

function broadcast(
    match: Match,
    message: import("@dogfight/shared").ServerMessage,
): void {
    for (const player of match.players.values()) {
        sendMessage(player.socket, message);
    }
}
