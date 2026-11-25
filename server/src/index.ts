import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.js';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolveStaticFile } from './static.js';
import { getRooms, saveRooms, RoomConfig } from './rooms.js';
import { readJsonBody } from './body.js';
import { setupWebSocket } from './ws.js';
import { roomManager } from './roomManager.js';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const logDirectory = path.resolve(config.logDir);

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
        });

        res.end(JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
        }));

        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/stats') {
        const matches = roomManager.getAllMatches();
        const stats = {
            timestamp: new Date().toISOString(),
            matches: matches.map(match => match.getStats()),
            totalPlayers: matches.reduce((sum, m) => sum + m.players.size, 0),
            totalMatches: matches.length,
        };

        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
        });

        res.end(JSON.stringify(stats));
        return;
    }

    // Deliberately block the Event Loop for 300 ms.
    if (req.method === 'GET' && url.pathname === '/api/slow') {
        const start = Date.now();

        while (Date.now() - start < 300) {
            // Intentional busy loop for the M4 demonstration.
        }

        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
        });

        res.end(JSON.stringify({
            message: 'Event Loop was blocked',
            blockedForMs: Date.now() - start,
        }));

        return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/replays/')) {
        try {
            const id = decodeURIComponent(
                url.pathname.slice('/api/replays/'.length),
            );

            if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
                res.writeHead(400);
                res.end('Invalid replay ID');
                return;
            }

            const files = await readdir(logDirectory);
            const fileName = files.find(
                (file) =>
                    file.startsWith(`${id}-`) &&
                    file.endsWith('.ndjson'),
            );

            if (!fileName) {
                res.writeHead(404);
                res.end('Replay not found');
                return;
            }

            res.writeHead(200, {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            });

            await pipeline(
                createReadStream(path.join(logDirectory, fileName)),
                res,
            );
        } catch (error: unknown) {
            console.error('Replay download error:', error);

            if (!res.headersSent) {
                res.writeHead(404);
                res.end('Replay not found');
            } else {
                res.destroy(error instanceof Error ? error : new Error(String(error)));
            }
        }

        return;
    }

    if (req.method === 'GET' && (url.pathname === '/api/rooms' || url.pathname === '/api/rooms.json')) {
        try {
            const rooms = await getRooms();

            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
            });

            res.end(JSON.stringify(rooms));
        } catch (error: unknown) {
            console.error('Failed to load rooms:', error);

            res.writeHead(500, {
                'Content-Type': 'application/json; charset=utf-8',
            });

            res.end(JSON.stringify({ error: 'Failed to load rooms' }));
        }

        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/rooms') {
        try {
            const newRoom = await readJsonBody<Record<string, unknown>>(req);

            if (
                !newRoom ||
                typeof newRoom !== 'object' ||
                Array.isArray(newRoom) ||
                typeof newRoom["id"] !== 'string' ||
                !newRoom["id"] ||
                typeof newRoom["name"] !== 'string' ||
                !newRoom["name"] ||
                typeof newRoom["description"] !== 'string' ||
                typeof newRoom["width"] !== 'number' ||
                !Number.isInteger(newRoom["width"]) ||
                newRoom["width"] <= 0 ||
                typeof newRoom["height"] !== 'number' ||
                !Number.isInteger(newRoom["height"]) ||
                newRoom["height"] <= 0 ||
                typeof newRoom["asteroidCount"] !== 'number' ||
                !Number.isInteger(newRoom["asteroidCount"]) ||
                newRoom["asteroidCount"] < 0
            ) {
                res.writeHead(400, {
                    'Content-Type': 'application/json; charset=utf-8',
                });

                res.end(JSON.stringify({ error: 'Invalid room data' }));
                return;
            }

            // Properties are validated above; narrow types for RoomConfig construction.
            const id = newRoom["id"] as string;
            const name = newRoom["name"] as string;
            const description = newRoom["description"] as string;
            const width = newRoom["width"] as number;
            const height = newRoom["height"] as number;
            const asteroidCount = newRoom["asteroidCount"] as number;

            const roomConfig: RoomConfig = {
                id,
                name,
                description,
                width,
                height,
                asteroidCount,
            };

            const rooms = await getRooms();

            if (rooms.some((room) => room.id === roomConfig.id)) {
                res.writeHead(409, {
                    'Content-Type': 'application/json; charset=utf-8',
                });

                res.end(JSON.stringify({ error: 'Room already exists' }));
                return;
            }

            rooms.push(roomConfig);
            await saveRooms(rooms);

            res.writeHead(201, {
                'Content-Type': 'application/json; charset=utf-8',
            });

            res.end(JSON.stringify(roomConfig));
        } catch (error: unknown) {
            console.error('Failed to create room:', error);

            const err = error instanceof Error ? error : new Error(String(error));
            const statusCode =
                err.message === 'Request body too large'
                    ? 413
                    : err.message === 'Invalid JSON'
                        ? 400
                        : 500;

            res.writeHead(statusCode, {
                'Content-Type': 'application/json; charset=utf-8',
            });

            res.end(JSON.stringify({
                error:
                    statusCode === 413
                        ? 'Request body too large'
                        : statusCode === 400
                            ? 'Invalid JSON'
                            : 'Failed to create room',
            }));
        }

        return;
    }

    const staticFile = await resolveStaticFile(url.pathname);

    if (staticFile) {
        res.writeHead(200, {
            'Content-Type': staticFile.contentType,
        });

        const stream = createReadStream(staticFile.filePath);

        stream.on('error', (error) => {
            console.error('Static file error:', error);

            if (!res.headersSent) {
                res.writeHead(500);
                res.end('Internal Server Error');
            } else {
                res.destroy(error);
            }
        });

        stream.pipe(res);
        return;
    }

    res.writeHead(404, {
        'Content-Type': 'application/json; charset=utf-8',
    });

    res.end(JSON.stringify({ error: 'Not Found' }));
});

const wss = setupWebSocket(server);

server.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
});

let isShuttingDown = false;

function shutdown(signal: string) {
    if (isShuttingDown) return;

    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Shutting down...`);

    for (const socket of wss.clients) {
        socket.terminate();
    }

    wss.close();

    server.close((error) => {
        if (error) {
            console.error('Error during shutdown:', error);
            process.exitCode = 1;
            return;
        }

        console.log('HTTP server closed.');
        process.exitCode = 0;
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));