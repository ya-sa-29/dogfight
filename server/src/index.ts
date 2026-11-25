import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolveStaticFile } from "./static.js";
import { getRooms, saveRooms, RoomConfig } from "./rooms.js";
import { readJsonBody } from "./body.js";
import { setupWebSocket, notifyShutdown } from "./ws.js";
import { roomManager } from "./roomManager.js";
import { getMetrics } from "./metrics.js";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const logDirectory = path.resolve(config.logDir);

const version = process.env["GIT_SHA"] ?? process.env["BUILD_VERSION"] ?? "dev";

let isReady = false;
let isShuttingDown = false;

export function isServerReady(): boolean {
    return isReady;
}

export function isServerShuttingDown(): boolean {
    return isShuttingDown;
}

const SHUTDOWN_TIMEOUT_MS = 10000;

export async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
        });

        res.end(
            JSON.stringify({
                status: "ok",
                version,
                timestamp: new Date().toISOString(),
            }),
        );

        return;
    }

    if (req.method === "GET" && url.pathname === "/ready") {
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
        });

        res.end(
            JSON.stringify({
                ready: isReady && !isShuttingDown,
                version,
                timestamp: new Date().toISOString(),
            }),
        );

        return;
    }

    if (req.method === "GET" && url.pathname === "/metrics") {
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
        });

        res.end(JSON.stringify(getMetrics()));

        return;
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
        const matches = roomManager.getAllMatches();
        const stats = {
            timestamp: new Date().toISOString(),
            matches: matches.map((match) => match.getStats()),
            totalPlayers: matches.reduce((sum, m) => sum + m.players.size, 0),
            totalMatches: matches.length,
        };

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
        });

        res.end(JSON.stringify(stats));
        return;
    }

    // Deliberately block the Event Loop for 300 ms.
    if (req.method === "GET" && url.pathname === "/api/slow") {
        const start = Date.now();

        while (Date.now() - start < 300) {
            // Intentional busy loop for the M4 demonstration.
        }

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
        });

        res.end(
            JSON.stringify({
                message: "Event Loop was blocked",
                blockedForMs: Date.now() - start,
            }),
        );

        return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/replays/")) {
        try {
            const id = decodeURIComponent(
                url.pathname.slice("/api/replays/".length),
            );

            if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
                res.writeHead(400);
                res.end("Invalid replay ID");
                return;
            }

            const files = await readdir(logDirectory);
            const fileName = files.find(
                (file) => file.startsWith(`${id}-`) && file.endsWith(".ndjson"),
            );

            if (!fileName) {
                res.writeHead(404);
                res.end("Replay not found");
                return;
            }

            res.writeHead(200, {
                "Content-Type": "application/x-ndjson; charset=utf-8",
                "Content-Disposition": `attachment; filename="${fileName}"`,
            });

            await pipeline(
                createReadStream(path.join(logDirectory, fileName)),
                res,
            );
        } catch (error: unknown) {
            logger.error(error, "Replay download error");

            if (!res.headersSent) {
                res.writeHead(404);
                res.end("Replay not found");
            } else {
                res.destroy(
                    error instanceof Error ? error : new Error(String(error)),
                );
            }
        }

        return;
    }

    if (
        req.method === "GET" &&
        (url.pathname === "/api/rooms" || url.pathname === "/api/rooms.json")
    ) {
        try {
            const rooms = await getRooms();

            res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
            });

            res.end(JSON.stringify(rooms));
        } catch (error: unknown) {
            logger.error(error, "Failed to load rooms");

            res.writeHead(500, {
                "Content-Type": "application/json; charset=utf-8",
            });

            res.end(JSON.stringify({ error: "Failed to load rooms" }));
        }

        return;
    }

    if (req.method === "POST" && url.pathname === "/api/rooms") {
        try {
            const newRoom = await readJsonBody<Record<string, unknown>>(req);

            if (
                !newRoom ||
                typeof newRoom !== "object" ||
                Array.isArray(newRoom) ||
                typeof newRoom["id"] !== "string" ||
                !newRoom["id"] ||
                typeof newRoom["name"] !== "string" ||
                !newRoom["name"] ||
                typeof newRoom["description"] !== "string" ||
                typeof newRoom["width"] !== "number" ||
                !Number.isInteger(newRoom["width"]) ||
                newRoom["width"] <= 0 ||
                typeof newRoom["height"] !== "number" ||
                !Number.isInteger(newRoom["height"]) ||
                newRoom["height"] <= 0 ||
                typeof newRoom["asteroidCount"] !== "number" ||
                !Number.isInteger(newRoom["asteroidCount"]) ||
                newRoom["asteroidCount"] < 0
            ) {
                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8",
                });

                res.end(JSON.stringify({ error: "Invalid room data" }));
                return;
            }

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
                    "Content-Type": "application/json; charset=utf-8",
                });

                res.end(JSON.stringify({ error: "Room already exists" }));
                return;
            }

            rooms.push(roomConfig);
            await saveRooms(rooms);

            res.writeHead(201, {
                "Content-Type": "application/json; charset=utf-8",
            });

            res.end(JSON.stringify(roomConfig));
        } catch (error: unknown) {
            logger.error(error, "Failed to create room");

            const err =
                error instanceof Error ? error : new Error(String(error));
            const statusCode =
                err.message === "Request body too large"
                    ? 413
                    : err.message === "Invalid JSON"
                      ? 400
                      : 500;

            res.writeHead(statusCode, {
                "Content-Type": "application/json; charset=utf-8",
            });

            res.end(
                JSON.stringify({
                    error:
                        statusCode === 413
                            ? "Request body too large"
                            : statusCode === 400
                              ? "Invalid JSON"
                              : "Failed to create room",
                }),
            );
        }

        return;
    }

    const staticFile = await resolveStaticFile(url.pathname);

    if (staticFile) {
        res.writeHead(200, {
            "Content-Type": staticFile.contentType,
        });

        const stream = createReadStream(staticFile.filePath);

        stream.on("error", (error) => {
            logger.error(error, "Static file error");

            if (!res.headersSent) {
                res.writeHead(500);
                res.end("Internal Server Error");
            } else {
                res.destroy(error);
            }
        });

        stream.pipe(res);
        return;
    }

    res.writeHead(404, {
        "Content-Type": "application/json; charset=utf-8",
    });

    res.end(JSON.stringify({ error: "Not Found" }));
}

const server = createServer(handleRequest);

const wss = setupWebSocket(server);

// Mark the process ready once the server is listening and WebSocket is attached.
if (process.env["VITEST"] !== "true") {
    server.listen(config.port, () => {
        isReady = true;
        logger.info(
            { port: config.port, version, nodeEnv: config.nodeEnv },
            "Server listening",
        );
    });
}

export function shutdown(signal: string) {
    if (isShuttingDown) return;

    isShuttingDown = true;
    isReady = false;

    logger.info(
        { signal },
        "Received shutdown signal, starting graceful shutdown",
    );

    // Hard timeout to prevent indefinite hanging. .unref() so it does not
    // keep the process alive if shutdown completes first.
    const timeout = setTimeout(() => {
        logger.warn("Shutdown timeout reached, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref();

    // Notify WebSocket clients and close connections with code 1001.
    notifyShutdown(wss);

    wss.close();

    server.close((error) => {
        if (error) {
            logger.error(error, "Error during shutdown");
            process.exitCode = 1;
        } else {
            logger.info("HTTP server closed");
            process.exitCode = 0;
        }

        logger.flush();
        process.exit(process.exitCode ?? 0);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (error: Error) => {
    logger.error(error, "Uncaught exception, exiting");
    process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
    logger.error(
        reason instanceof Error ? reason : new Error(String(reason)),
        "Unhandled rejection, exiting",
    );
    process.exit(1);
});
