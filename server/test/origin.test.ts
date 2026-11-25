import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

async function createWsServer(
    allowedOrigins: string,
): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
    process.env["ALLOWED_ORIGINS"] = allowedOrigins;
    vi.resetModules();

    const { setupWebSocket } = await import("../src/ws.js");

    const httpServer = createServer();
    setupWebSocket(httpServer, {
        loadRooms: async () => [],
    });

    await new Promise<void>((resolve) => {
        httpServer.listen(0, "127.0.0.1", () => {
            resolve();
        });
    });

    const addr = httpServer.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    return { server: httpServer, port };
}

function connectWebSocket(
    port: number,
    origin?: string,
): Promise<{ connected: boolean; ws?: WebSocket }> {
    return new Promise((resolve) => {
        const wsUrl = `ws://127.0.0.1:${port}/ws`;
        const ws = new WebSocket(wsUrl, { origin });

        let resolved = false;

        ws.on("open", () => {
            if (!resolved) {
                resolved = true;
                resolve({ connected: true, ws });
            }
        });

        ws.on("error", () => {
            if (!resolved) {
                resolved = true;
                resolve({ connected: false });
            }
        });

        ws.on("close", () => {
            // Connection may close after rejection - handled by error or open
        });

        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                try {
                    ws.close();
                } catch {
                    // ignore
                }
                resolve({ connected: false });
            }
        }, 5000);
    });
}

describe("origin verification", () => {
    let servers: Array<{ server: ReturnType<typeof createServer> }> = [];

    afterEach(() => {
        for (const s of servers) {
            try {
                s.server.close();
            } catch {
                // ignore
            }
        }
        servers = [];
        delete process.env["ALLOWED_ORIGINS"];
        vi.resetModules();
    });

    test("allows connection when ALLOWED_ORIGINS is *", async () => {
        const { server, port } = await createWsServer("*");
        servers.push({ server });

        const result = await connectWebSocket(port, "https://any.example.com");
        expect(result.connected).toBe(true);
        result.ws?.close();
    });

    test("allows connection from configured origin", async () => {
        const { server, port } = await createWsServer(
            "https://dogfight.example.com",
        );
        servers.push({ server });

        const result = await connectWebSocket(
            port,
            "https://dogfight.example.com",
        );
        expect(result.connected).toBe(true);
        result.ws?.close();
    });

    test("rejects connection from unconfigured origin", async () => {
        const { server, port } = await createWsServer(
            "https://dogfight.example.com",
        );
        servers.push({ server });

        const result = await connectWebSocket(port, "https://evil.example.com");
        expect(result.connected).toBe(false);
    });

    test("rejects connection with missing origin when specific origins configured", async () => {
        const { server, port } = await createWsServer(
            "https://dogfight.example.com",
        );
        servers.push({ server });

        const result = await connectWebSocket(port);
        expect(result.connected).toBe(false);
    });
});

describe("config defaults", () => {
    test("config has sensible default connection cap", async () => {
        const { config } = await import("../src/config.js");
        expect(config.maxConnectionsPerIp).toBe(50);
    });

    test("config has sensible default room limit", async () => {
        const { config } = await import("../src/config.js");
        expect(config.maxRooms).toBe(100);
    });

    test("config has sensible default player limit per room", async () => {
        const { config } = await import("../src/config.js");
        expect(config.maxPlayersPerRoom).toBe(8);
    });
});
