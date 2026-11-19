
import { createServer } from "node:http";
import { config } from "./config.js";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolveStaticFile } from "./static.js";
import { getRooms, saveRooms } from "./rooms.js";
import { readJsonBody } from "./body.js";
import { setupWebSocket, roomManager } from "./ws.js";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const logDirectory = path.resolve(config.logDir);

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
        });

        res.end(
            JSON.stringify({
                status: "ok",
                timestamp: new Date().toISOString(),
            }),
        );

        return;
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
        const matches = Array.from(roomManager.rooms.values())
            .map((room) => room.match.getStats());

        const activeMatches = matches.filter(
            (match) => match.running,
        );

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
        });

        res.end(
            JSON.stringify({
                timestamp: new Date().toISOString(),
                activeMatches: activeMatches.length,
                activePlayers: activeMatches.reduce(
                    (total, match) => total + match.players,
                    0,
                ),
                matches,
            }),
        );

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
                (file) =>
                    file.startsWith(`${id}-`) &&
                    file.endsWith(".ndjson"),
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
        } catch (error) {
            console.error("Replay download error:", error);

            if (!res.headersSent) {
                res.writeHead(404);
                res.end("Replay not found");
            } else {
                res.destroy(error);
            }
        }

        return;
    }

    if (req.method === "GET" && url.pathname === "/api/rooms") {
        try {
            const rooms = await getRooms();

            res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
            });

            res.end(JSON.stringify(rooms));
        } catch (error) {
            console.error("Failed to load rooms:", error);

            res.writeHead(500, {
                "Content-Type": "application/json; charset=utf-8",
            });

            res.end(
                JSON.stringify({ error: "Failed to load rooms" }),
            );
        }

        return;
    }

    if (req.method === "POST" && url.pathname === "/api/rooms") {
        try {
            const newRoom = await readJsonBody(req);

            if (
                !newRoom ||
                typeof newRoom !== "object" ||
                Array.isArray(newRoom) ||
                typeof newRoom.id !== "string" ||
                !newRoom.id.trim() ||
                typeof newRoom.name !== "string" ||
                !newRoom.name.trim() ||
                typeof newRoom.description !== "string" ||
                !Number.isInteger(newRoom.width) ||
                newRoom.width <= 0 ||
                !Number.isInteger(newRoom.height) ||
                newRoom.height <= 0 ||
                !Number.isInteger(newRoom.asteroidCount) ||
                newRoom.asteroidCount < 0
            ) {
                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8",
                });

                res.end(JSON.stringify({ error: "Invalid room data" }));
                return;
            }

            const rooms = await getRooms();

            if (rooms.some((room) => room.id === newRoom.id)) {
                res.writeHead(409, {
                    "Content-Type": "application/json; charset=utf-8",
                });

                res.end(JSON.stringify({ error: "Room already exists" }));
                return;
            }

            rooms.push(newRoom);
            await saveRooms(rooms);

            const registered = roomManager.addRoomConfig(newRoom);

            if (!registered) {
                console.error(
                    `Room ${newRoom.id} was saved but could not be registered`,
                );

                res.writeHead(500, {
                    "Content-Type": "application/json; charset=utf-8",
                });

                res.end(
                    JSON.stringify({
                        error: "Room saved but runtime registration failed",
                    }),
                );

                return;
            }

            res.writeHead(201, {
                "Content-Type": "application/json; charset=utf-8",
            });

            res.end(JSON.stringify(newRoom));
        } catch (error) {
            console.error("Failed to create room:", error);

            const statusCode =
                error.message === "Request body too large"
                    ? 413
                    : error.message === "Invalid JSON"
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
            console.error("Static file error:", error);

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
});

const roomConfigs = await getRooms();
const wss = setupWebSocket(server, roomConfigs);

server.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
});

let isShuttingDown = false;

function shutdown(signal) {
    if (isShuttingDown) return;

    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Shutting down...`);

    for (const socket of wss.clients) {
        socket.terminate();
    }

    wss.close();

    server.close((error) => {
        if (error) {
            console.error("Error during shutdown:", error);
            process.exitCode = 1;
            return;
        }

        console.log("HTTP server closed.");
        process.exitCode = 0;
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
