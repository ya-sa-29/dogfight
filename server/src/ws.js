import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { roomManager } from './roomManager.js';
import { parseClientMessage, validateInputMessage } from './protocol.js';
import { getRooms } from './rooms.js';

const JOIN_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 15000;

const RATE_LIMIT = 10;
const RATE_BURST = 20;

const MAX_PLAYERS_PER_ROOM = 8;
const MAX_ROOMS = 100;

const MAX_BUFFERED_AMOUNT = 1024 * 1024;

export function setupWebSocket(server) {
    const wss = new WebSocketServer({
        server,
        path: '/ws',
        maxPayload: 16 * 1024,
    });

    wss.on('connection', (socket) => {
        console.log('WebSocket client connected');

        socket.player = null;
        socket.match = null;
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

                // Get room config from rooms.json
                let roomConfig = null;
                getRooms().then(rooms => {
                    const room = rooms.find(r => r.id === message.roomId);
                    if (room) {
                        roomConfig = room;
                    }
                    handleJoin(roomConfig);
                }).catch(err => {
                    console.error('Failed to get rooms:', err);
                    socket.close(1008, 'Server error');
                });

                function handleJoin(roomConfig) {
                    if (!roomConfig) {
                        socket.close(1008, 'Room not found');
                        return;
                    }

                    let match = roomManager.getMatch(message.roomId);

                    // Maximum rooms per server
                    if (!match && roomManager.matches.size >= MAX_ROOMS) {
                        socket.close(1008, 'Server room limit reached');
                        return;
                    }

                    // Create match if necessary
                    if (!match) {
                        match = roomManager.createMatch(message.roomId, roomConfig);
                    }

                    if (!match) {
                        socket.close(1008, 'Could not create match');
                        return;
                    }

                    // Maximum players per room
                    if (match.players.size >= MAX_PLAYERS_PER_ROOM) {
                        socket.close(1008, 'Room is full');
                        return;
                    }

                    socket.player = {
                        id: randomUUID(),
                        name: message.playerName,
                        socket,
                    };

                    const added = match.addPlayer(socket.player);

                    if (!added) {
                        socket.close(1008, 'Could not join match');
                        return;
                    }

                    socket.match = match;
                    joined = true;

                    clearTimeout(joinTimeout);

                    console.log(
                        `Player ${socket.player.name} joined match ${match.id}`,
                    );

                    sendMessage(socket, {
                        type: 'joined',
                        playerId: socket.player.id,
                        roomId: match.id,
                        seed: match.getSeed(),
                        roomConfig: match.getRoomConfig(),
                    });

                    broadcastRoster(match);
                }
                return;
            }

            if (!joined) {
                socket.close(1008, 'Join required');
                return;
            }

            if (message.type === 'input') {
                // Validate input message
                let validatedInput;
                try {
                    validatedInput = validateInputMessage(message);
                } catch (error) {
                    console.error('Invalid input message:', error);
                    socket.close(error.closeCode || 1008, error.message);
                    return;
                }

                // Forward to match
                if (socket.match) {
                    socket.match.handleInput(socket.player.id, validatedInput);
                }
                return;
            }

            if (message.type === 'chat') {
                if (socket.match) {
                    const chatMessage = socket.match.handleChat(
                        socket.player.id,
                        message.message,
                    );

                    if (chatMessage) {
                        broadcast(socket.match, {
                            type: 'chat',
                            ...chatMessage,
                        });
                    }
                }
                return;
            }

            if (message.type === 'leave') {
                console.log(`Player ${socket.player.name} left`);
                socket.close(1000, 'Player left');
            }
        });

        socket.on('close', () => {
            console.log('WebSocket client disconnected');

            clearTimeout(joinTimeout);

            if (joined && socket.match && socket.player) {
                socket.match.removePlayer(socket.player.id);
                broadcastRoster(socket.match);
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

function broadcastRoster(match) {
    const roster = {
        type: 'roster',
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