import { describe, expect, test, afterEach } from "vitest";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { setupWebSocket } from "../src/ws.js";

async function createGarbageTestServer(): Promise<{
    server: ReturnType<typeof createServer>;
    port: number;
}> {
    const httpServer = createServer();
    setupWebSocket(httpServer, {
        loadRooms: async () => [
            {
                id: "test-room",
                name: "Test",
                description: "Test room",
                width: 800,
                height: 600,
                asteroidCount: 5,
            },
        ],
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

function connectAndSendGarbage(
    port: number,
): Promise<{ code?: number; reason?: string }> {
    return new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        let closed = false;
        let closeCode: number | undefined;
        let closeReason: string | undefined;

        ws.on("open", () => {
            // Send 100 garbage messages as fast as possible
            for (let i = 0; i < 100; i++) {
                try {
                    ws.send("garbage{{{invalid");
                } catch {
                    break;
                }
            }
            ws.close();
        });

        ws.on("close", (code, reason) => {
            closed = true;
            closeCode = code;
            closeReason = reason?.toString() || undefined;
            resolve({ code: closeCode, reason: closeReason });
        });

        ws.on("error", () => {
            if (!closed) {
                closed = true;
                resolve({ code: undefined, reason: "error" });
            }
        });

        setTimeout(() => {
            if (!closed) {
                closed = true;
                try {
                    ws.close();
                } catch {
                    // ignore
                }
                resolve({ code: undefined, reason: "timeout" });
            }
        }, 5000);
    });
}

describe("garbage frame handling", () => {
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
    });

    test("client sending invalid messages gets disconnected", async () => {
        const { server, port } = await createGarbageTestServer();
        servers.push({ server });

        const result = await connectAndSendGarbage(port);

        // Connection should be closed (not a normal 1000 close)
        expect(result.code).toBeDefined();
        expect(result.code).not.toBe(1000);
    });
});
