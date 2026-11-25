import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { roomManager } from "./roomManager.js";
import { validateInputMessage } from "@dogfight/shared";
import { getRooms } from "./rooms.js";
import { createLatencyQueue, parseLatencyConfig } from "./latency-injector.js";
import { createTokenBucket } from "./token-bucket.js";
import {
    encodeServerMessage,
    decodeClientFrame,
    normalizeCodec,
    TRANSPORT_JSON,
} from "./wire.js";

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

export function setupWebSocket(
    server,
    { loadRooms = getRooms, now = () => Date.now() } = {},
) {
    const wss = new WebSocketServer({
        server,
        path: "/ws",
        maxPayload: 16 * 1024,
    });

    wss.on("connection", (socket, request) => {
        console.log("WebSocket client connected");

        // Parse latency configuration from request URL
        const requestUrl = request.url;
        const latencyConfig = parseLatencyConfig(requestUrl);

        // Create latency queues for this socket
        const upstreamQueue = createLatencyQueue(
            socket,
            latencyConfig,
            "upstream",
        );
        const downstreamQueue = createLatencyQueue(
            socket,
            latencyConfig,
            "downstream",
        );

        socket.player = null;
        socket.match = null;
        socket.missedPongs = 0;
        // M4: per-connection transport codec for data-plane messages
        // (input/snapshot). Control-plane messages stay JSON. Negotiated from
        // the join message; defaults to JSON.
        socket.transportCodec = TRANSPORT_JSON;

        let joined = false;

        // Token Buckets (per connection, independent)
        const inputBucket = createTokenBucket({
            refillRate: INPUT_RATE_LIMIT,
            burst: INPUT_RATE_BURST,
            now,
        });

        const controlBucket = createTokenBucket({
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
            socket.missedPongs = 0;
        });

        function handleMessage(s, rawData, isBinary) {
            let message;

            try {
                // M4: binary frames carry an input (binary codec); text frames
                // are JSON control-plane messages (or JSON-mode inputs).
                message = decodeClientFrame(rawData, isBinary);
            } catch (error) {
                // Malformed and unknown messages still consume a control token
                // so a client cannot bypass rate limiting by sending garbage.
                if (!controlBucket.consume()) {
                    console.log("Rate limit exceeded");
                    s.close(1008, "Rate limit exceeded");
                    return;
                }

                console.error("Invalid WebSocket message:", error);
                s.close(error.closeCode || 1008, error.message);
                return;
            }

            // Select the bucket by message category: input traffic is the hot
            // path and must not be throttled by control traffic (or vice versa).
            const bucket =
                message.type === "input" ? inputBucket : controlBucket;

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
                let roomConfig = null;
                loadRooms()
                    .then((rooms) => {
                        const room = rooms.find((r) => r.id === message.roomId);
                        if (room) {
                            roomConfig = room;
                        }
                        handleJoin(roomConfig);
                    })
                    .catch((err) => {
                        console.error("Failed to get rooms:", err);
                        s.close(1008, "Server error");
                    });

                function handleJoin(roomConfig) {
                    if (!roomConfig) {
                        s.close(1008, "Room not found");
                        return;
                    }

                    // The peer may have disconnected while rooms were loading.
                    // Registering a player for a closed socket would leak a
                    // permanent ghost player and consume room capacity.
                    if (s.readyState !== WebSocket.OPEN) {
                        return;
                    }

                    let match = roomManager.getMatch(message.roomId);

                    // Maximum rooms per server
                    if (!match && roomManager.matches.size >= MAX_ROOMS) {
                        s.close(1008, "Server room limit reached");
                        return;
                    }

                    // Create match if necessary
                    if (!match) {
                        match = roomManager.createMatch(
                            message.roomId,
                            roomConfig,
                            {
                                sendFn: (targetSocket, msg) =>
                                    downstreamQueue.enqueue(msg, sendMessage),
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

                    s.player = {
                        id: randomUUID(),
                        name: message.playerName,
                        socket: s,
                    };

                    // M4: negotiate this connection's data-plane codec. Must be
                    // set before the first snapshot can be sent to this socket.
                    s.transportCodec = normalizeCodec(message.codec);

                    const added = match.addPlayer(s.player);

                    if (!added) {
                        s.close(1008, "Could not join match");
                        return;
                    }

                    s.match = match;
                    joined = true;

                    // Start the tick loop once the first player is registered.
                    // Match.start() is idempotent, and subsequent players must
                    // not create another loop.
                    if (match.players.size === 1) {
                        match.start();
                    }

                    clearTimeout(joinTimeout);

                    console.log(
                        `Player ${s.player.name} joined match ${match.id}`,
                    );

                    sendMessage(s, {
                        type: "joined",
                        playerId: s.player.id,
                        roomId: match.id,
                        seed: match.getSeed(),
                        roomConfig: match.getRoomConfig(),
                        shipId: match.ships.get(s.player.id),
                        // M4: echo the negotiated transport codec so the client
                        // can verify its request was honoured.
                        codec: s.transportCodec,
                    });

                    broadcastRoster(match);
                }
                return;
            }

            if (!joined) {
                s.close(1008, "Join required");
                return;
            }

            if (message.type === "input") {
                // Validate input message
                let validatedInput;
                try {
                    validatedInput = validateInputMessage(message);
                } catch (error) {
                    console.error("Invalid input message:", error);
                    s.close(error.closeCode || 1008, error.message);
                    return;
                }

                // Forward to match
                if (s.match) {
                    s.match.handleInput(s.player.id, validatedInput);
                }
                return;
            }

            if (message.type === "chat") {
                if (s.match) {
                    const chatMessage = s.match.handleChat(
                        s.player.id,
                        message.message,
                    );

                    if (chatMessage) {
                        broadcast(s.match, {
                            type: "chat",
                            ...chatMessage,
                        });
                    }
                }
                return;
            }

            if (message.type === "leave") {
                console.log(`Player ${s.player.name} left`);
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
                    },
                    sendMessage,
                );
                return;
            }
        }

        socket.on("message", (data, isBinary) => {
            // M4: capture isBinary so the decode path (binary vs JSON) and the
            // latency-injector type hint survive queueing. A binary upstream
            // frame is always an input, so it is classified as "input" and
            // remains in the never-drop set even though the injector cannot
            // JSON-sniff a binary payload.
            upstreamQueue.enqueue(
                data,
                (s, rawData) => handleMessage(s, rawData, isBinary),
                isBinary ? "input" : undefined,
            );
        });

        socket.on("close", () => {
            console.log("WebSocket client disconnected");

            clearTimeout(joinTimeout);

            upstreamQueue.cleanup();
            downstreamQueue.cleanup();

            if (joined && socket.match && socket.player) {
                socket.match.removePlayer(socket.player.id);
                broadcastRoster(socket.match);
            }
        });

        socket.on("error", (error) => {
            console.error("WebSocket error:", error);
        });
    });

    const heartbeat = setInterval(() => {
        for (const socket of wss.clients) {
            if (socket.readyState !== WebSocket.OPEN) {
                continue;
            }

            socket.missedPongs += 1;

            if (socket.missedPongs >= 2) {
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

function sendMessage(socket, message) {
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
    const payload = encodeServerMessage(message, socket.transportCodec);

    socket.send(payload, (error) => {
        if (error) {
            console.error("WebSocket send error:", error);
        }
    });

    return true;
}

function broadcastRoster(match) {
    const roster = {
        type: "roster",
        players: Array.from(match.players.values()).map((player) => ({
            id: player.id,
            name: player.name,
        })),
    };

    broadcast(match, roster);
}

function broadcast(match, message) {
    for (const player of match.players.values()) {
        sendMessage(player.socket, message);
    }
}
