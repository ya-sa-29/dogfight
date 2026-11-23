import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { roomManager } from "./roomManager.js";
import { getRooms } from "./rooms.js";
import { createLatencyQueue, parseLatencyConfig, LatencyQueue } from "./latency-injector.js";
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

/** Type guard for join messages (only valid for JSON-mode messages). */
function isJoinMessage(msg: WireClientMessage): msg is WireClientMessage & { roomId: string; playerName: string; codec: "json" | "binary" } {
    return msg.type === "join" && "roomId" in msg && "playerName" in msg && "codec" in msg;
}

const JOIN_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 15000;

// Two independent buckets. Input traffic is the hot path (the client transmits
// at 30 Hz), so it gets a higher refill rate than control traffic.
const INPUT_RATE_LIMIT = 40;
const INPUT_RATE_BURST = 20;

const CONTROL_RATE_LIMIT = 10;
const CONTROL_RATE_BURST = 20;

const MAX_PLAYERS_PER_ROOM = 8;
const MAX_ROOMS = 100;

const MAX_BUFFERED_AMOUNT = 1024 * 1024;

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
        ext = { player: null, match: null, missedPongs: 0, transportCodec: TRANSPORT_JSON };
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
    const wss = new WebSocketServer({
        server,
        path: "/ws",
        maxPayload: 16 * 1024,
    });

    wss.on("connection", (socket: WebSocket, request: import("http").IncomingMessage) => {
        console.log("WebSocket client connected");

        // Initialize socket extensions
        const ext = getExt(socket);
        ext.player = null;
        ext.match = null;
        ext.missedPongs = 0;
        ext.transportCodec = TRANSPORT_JSON;

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
                console.log("Join timeout");
                socket.close(1008, "Join timeout");
            }
        }, JOIN_TIMEOUT);

        socket.on("pong", () => {
            getExt(socket).missedPongs = 0;
        });

        function handleMessage(s: WebSocket, rawData: Buffer | ArrayBuffer | Uint8Array | string, isBinary: boolean) {
            let message: WireClientMessage;

            try {
                // M4: binary frames carry an input (binary codec); text frames
                // are JSON control-plane messages (or JSON-mode inputs).
                const decoded = decodeClientFrame(rawData, isBinary);
                if (!decoded) {
                    // Malformed frame - treat as protocol error
                    throw new Error("Invalid message format");
                }
                message = decoded;
            } catch (error: unknown) {
                // Malformed and unknown messages still consume a control token
                // so a client cannot bypass rate limiting by sending garbage.
                if (!controlBucket.consume()) {
                    console.log("Rate limit exceeded");
                    s.close(1008, "Rate limit exceeded");
                    return;
                }

                console.error("Invalid WebSocket message:", error);
                const err = error instanceof Error ? error : new Error(String(error));
                // ProtocolError has closeCode; narrow safely.
                const closeCode = error instanceof ProtocolError ? error.closeCode : 1008;
                s.close(closeCode, err.message);
                return;
            }

            // Select the bucket by message category: input traffic is the hot
            // path and must not be throttled by control traffic (or vice versa).
            const bucket = message.type === "input" ? inputBucket : controlBucket;

            if (!bucket.consume()) {
                console.log("Rate limit exceeded");
                s.close(1008, "Rate limit exceeded");
                return;
            }

            if (message.type === "join") {
                if (joined) {
                    s.close(1008, "Already joined");
                    return;
                }

                // Get room config from rooms.json
                let roomConfig: RoomConfig | null = null;
                loadRooms()
                    .then((rooms: RoomConfig[]) => {
                        const room = rooms.find((r) => r.id === message.roomId);
                        if (room) {
                            roomConfig = room;
                        }
                        handleJoin(roomConfig, message);
                    })
                    .catch((err) => {
                        console.error("Failed to get rooms:", err);
                        s.close(1008, "Server error");
                    });

                function handleJoin(roomConfig: RoomConfig | null, joinMsg: WireClientMessage) {
                    if (!roomConfig) {
                        s.close(1008, "Room not found");
                        return;
                    }

                    if (!isJoinMessage(joinMsg)) {
                        s.close(1008, "Invalid join message");
                        return;
                    }

                    // The peer may have disconnected while rooms were loading.
                    // Registering a player for a closed socket would leak a
                    // permanent ghost player and consume room capacity.
                    if (s.readyState !== WebSocket.OPEN) {
                        return;
                    }

                    let match = roomManager.getMatch(joinMsg.roomId);

                    // Maximum rooms per server
                    if (!match && roomManager.matches.size >= MAX_ROOMS) {
                        s.close(1008, "Server room limit reached");
                        return;
                    }

                    // Create match if necessary
                    if (!match) {
                        match = roomManager.createMatch(
                            joinMsg.roomId,
                            roomConfig,
                            {
                                sendFn: (targetSocket: WebSocket, msg: unknown) => {
                                    downstreamQueue.enqueue(msg, (s: WebSocket, m: unknown) => {
                                        sendMessage(s, m as import("@dogfight/shared").ServerMessage);
                                    });
                                },
                            },
                        );
                    }

                    if (!match) {
                        s.close(1008, "Could not create match");
                        return;
                    }

                    // Maximum players per room
                    if (match.players.size >= MAX_PLAYERS_PER_ROOM) {
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

                    // M4: negotiate this connection's data-plane codec. Must be
                    // set before the first snapshot can be sent to this socket.
                    sExt.transportCodec = normalizeCodec(joinMsg.codec);

                    const added = match.addPlayer(player);

                    if (!added) {
                        s.close(1008, "Could not join match");
                        return;
                    }

                    sExt.match = match;
                    joined = true;

                    // Start the tick loop once the first player is registered.
                    // Match.start() is idempotent, and subsequent players must
                    // not create another loop.
                    if (match.players.size === 1) {
                        match.start();
                    }

                    clearTimeout(joinTimeout);

                    console.log(
                        `Player ${sExt.player.name} joined match ${match.id}`,
                    );

                    sendMessage(s, {
                        type: "joined",
                        playerId: sExt.player.id,
                        seed: match.getSeed(),
                        roomConfig: match.getRoomConfig(),
                        // Player was just added to match, ship must exist.
                        shipId: match.ships.get(sExt.player.id) ?? 0,
                        // M4: echo the negotiated transport codec so the client
                        // can verify its request was honoured.
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
                // Validate input message using Zod-based parser (returns Result, never throws)
                const result = parseClientMessage(message);
                if (!result.success) {
                    console.error("Invalid input message:", result.error);
                    const closeCode = 1008;
                    s.close(closeCode, "Invalid input message");
                    return;
                }
                const validatedInput = result.data;
                // Narrow to InputMessage since we checked message.type === "input" above
                if (validatedInput.type !== "input") {
                    s.close(1008, "Expected input message");
                    return;
                }

                // Forward to match
                const sExt = getExt(s);
                if (sExt.match && sExt.player) {
                    sExt.match.handleInput(sExt.player.id, validatedInput);
                }
                return;
            }

            if (message.type === "chat") {
                const sExt = getExt(s);
                if (sExt.match && sExt.player) {
                    const chatMessage = sExt.match.handleChat(sExt.player.id, message.message);

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
                    console.log(`Player ${sExt.player.name} left`);
                }
                s.close(1000, "Player left");
            }

            if (message.type === "ping") {
                // Respond to ping with pong, echoing the timestamp and seq
                // This is for client-side RTT measurement. Route pong through
                // the downstream queue so it experiences the same downstream
                // latency as snapshots (otherwise RTT only reflects upstream).
                downstreamQueue.enqueue(
                    {
                        type: "pong",
                        timestamp: message.timestamp,
                        seq: message.seq,
                    } satisfies import("@dogfight/shared").ServerMessage,
                    (s: WebSocket, msg: unknown) => sendMessage(s, msg as import("@dogfight/shared").ServerMessage),
                );
                return;
            }
        }

        socket.on("message", (data: Buffer, isBinary: boolean) => {
            // M4: capture isBinary so the decode path (binary vs JSON) and the
            // latency-injector type hint survive queueing. A binary upstream
            // frame is always an input, so it is classified as "input" and
            // remains in the never-drop set even though the injector cannot
            // JSON-sniff a binary payload.
            upstreamQueue.enqueue(
                data,
                (s: WebSocket, rawData: unknown) => handleMessage(s, rawData as Buffer | ArrayBuffer | Uint8Array | string, isBinary),
                isBinary ? "input" : undefined,
            );
        });

        socket.on("close", () => {
            console.log("WebSocket client disconnected");

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
            console.error("WebSocket error:", error);
        });
    });

    const heartbeat = setInterval(() => {
        for (const socket of wss.clients) {
            if (socket.readyState !== WebSocket.OPEN) {
                continue;
            }

            const ext = getExt(socket);
            ext.missedPongs += 1;

            if (ext.missedPongs >= 2) {
                console.log("Terminating unresponsive WebSocket client");
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

function sendMessage(socket: WebSocket, message: import("@dogfight/shared").ServerMessage): boolean {
    if (socket.readyState !== WebSocket.OPEN) {
        return false;
    }

    if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        console.log("Slow client detected, closing connection");
        socket.close(1013, "Client too slow");
        return false;
    }

    // M4: encode the message for this recipient's negotiated transport codec.
    // Only `snapshot` is binary-encoded; all other message types stay JSON.
    const ext = getExt(socket);
    const payload = encodeServerMessage(message, ext.transportCodec);

    const callback = (err: Error | null) => {
        if (err) {
            console.error("WebSocket send error:", err);
        }
    };

    // Workaround for ws overload resolution: cast to avoid callback/options ambiguity
    (socket.send as (data: string | Buffer, cb?: (err: Error | null) => void) => boolean)(payload, callback);

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

function broadcast(match: Match, message: import("@dogfight/shared").ServerMessage): void {
    for (const player of match.players.values()) {
        sendMessage(player.socket, message);
    }
}