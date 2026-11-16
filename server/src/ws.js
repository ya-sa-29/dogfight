
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { RoomManager } from './roomManager.js';
import { parseClientMessage } from './protocol.js';

const JOIN_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 15000;

const RATE_LIMIT = 10;
const RATE_BURST = 20;

const MAX_PLAYERS_PER_ROOM = 8;
const MAX_ROOMS = 100;

const MAX_BUFFERED_AMOUNT = 1024 * 1024;

export const roomManager = new RoomManager();

export function setupWebSocket(server) {
    const wss = new WebSocketServer({
        server,
        path: '/ws',
        maxPayload: 16 * 1024,
    });

    wss.on('connection', (socket) => {
        console.log('WebSocket client connected');

        socket.player = null;
        socket.room = null;
        socket.missedPongs = 0;

        let joined = false;

        // Token Bucket
        let tokens = RATE_BURST;
        let lastRefill = Date.now();

        function consumeToken() {
            const now = Date.now();
            const elapsed = (now - lastRefill) / 1000;

            tokens = Math.min(
                RATE_BURST,
                tokens + elapsed * RATE_LIMIT,
            );

            lastRefill = now;

            if (tokens < 1) {
                return false;
            }

            tokens -= 1;
            return true;
        }

        const joinTimeout = setTimeout(() => {
            if (!joined) {
                console.log('Join timeout');
                socket.close(1008, 'Join timeout');
            }
        }, JOIN_TIMEOUT);

        socket.on('pong', () => {
            socket.missedPongs = 0;
        });

        socket.on('message', (data) => {
            // Rate limiting
            if (!consumeToken()) {
                console.log('Rate limit exceeded');
                socket.close(1008, 'Rate limit exceeded');
                return;
            }

            let message;

            try {
                message = parseClientMessage(data);
            } catch (error) {
                console.error('Invalid WebSocket message:', error);
                socket.close(error.closeCode || 1008, error.message);
                return;
            }

            if (message.type === 'join') {
                if (joined) {
                    socket.close(1008, 'Already joined');
                    return;
                }

                let room = roomManager.getRoom(message.roomId);

                // Maximum rooms per server
                if (!room && roomManager.rooms.size >= MAX_ROOMS) {
                    socket.close(1008, 'Server room limit reached');
                    return;
                }

                // Create room if necessary
                if (!room) {
                    room = roomManager.createRoom(message.roomId);
                }

                if (!room) {
                    socket.close(1008, 'Could not create room');
                    return;
                }

                // Maximum players per room
                if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
                    socket.close(1008, 'Room is full');
                    return;
                }

                socket.player = {
                    id: randomUUID(),
                    name: message.playerName,
                    socket,
                };

                const added = room.join(socket.player);

                if (!added) {
                    socket.close(1008, 'Could not join room');
                    return;
                }

                socket.room = room;
                joined = true;

                clearTimeout(joinTimeout);

                console.log(
                    `Player ${socket.player.name} joined room ${room.id}`,
                );

                sendMessage(socket, {
                    type: 'joined',
                    playerId: socket.player.id,
                    roomId: room.id,
                });

                broadcastRoster(room);
                return;
            }

            if (!joined) {
                socket.close(1008, 'Join required');
                return;
            }

            if (message.type === 'chat') {
                const chatMessage = socket.room.chat(
                    socket.player.id,
                    message.message,
                );

                if (chatMessage) {
                    broadcast(socket.room, {
                        type: 'chat',
                        ...chatMessage,
                    });
                }
            }

            if (message.type === 'leave') {
                console.log(`Player ${socket.player.name} left`);
                socket.close(1000, 'Player left');
            }
        });

        socket.on('close', () => {
            console.log('WebSocket client disconnected');

            clearTimeout(joinTimeout);

            if (joined && socket.room && socket.player) {
                socket.room.leave(socket.player.id);
                broadcastRoster(socket.room);
            }
        });

        socket.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    const heartbeat = setInterval(() => {
        for (const socket of wss.clients) {
            if (socket.readyState !== WebSocket.OPEN) {
                continue;
            }

            socket.missedPongs += 1;

            if (socket.missedPongs >= 2) {
                console.log('Terminating unresponsive WebSocket client');
                socket.terminate();
                continue;
            }

            socket.ping();
        }
    }, HEARTBEAT_INTERVAL);

    wss.on('close', () => {
        clearInterval(heartbeat);
    });

    return wss;
}

function sendMessage(socket, message) {
    if (socket.readyState !== WebSocket.OPEN) {
        return false;
    }

    if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        console.log('Slow client detected, closing connection');
        socket.close(1013, 'Client too slow');
        return false;
    }

    socket.send(JSON.stringify(message), (error) => {
        if (error) {
            console.error('WebSocket send error:', error);
        }
    });

    return true;
}

function broadcastRoster(room) {
    const roster = {
        type: 'roster',
        players: Array.from(room.players.values()).map((player) => ({
            id: player.id,
            name: player.name,
        })),
    };

    broadcast(room, roster);
}

function broadcast(room, message) {
    for (const player of room.players.values()) {
        sendMessage(player.socket, message);
    }
}
