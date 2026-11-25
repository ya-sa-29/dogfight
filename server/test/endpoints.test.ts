import { describe, expect, test, beforeAll, vi } from "vitest";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

beforeAll(() => {
    process.env["VITEST"] = "true";
});

async function createTestServer(): Promise<Server> {
    const mod = await import("../src/index.js");
    const { handleRequest } = mod;
    const server = createServer((req, res) => {
        void handleRequest(req, res);
    });
    await new Promise<void>((resolve, reject) => {
        server.listen(0, "127.0.0.1", (err?: Error | null) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
    return server;
}

function getPort(server: Server): number {
    const addr = server.address();
    if (addr === null || typeof addr === "string") {
        throw new Error("Server address is not an IP address");
    }
    return addr.port;
}

function request(
    server: Server,
    pathname: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
        const port = getPort(server);
        const http = require("node:http");
        const req = http.get(
            `http://127.0.0.1:${port}${pathname}`,
            (res: import("node:http").IncomingMessage) => {
                let data = "";
                res.on("data", (chunk: string) => {
                    data += chunk;
                });
                res.on("end", () => {
                    try {
                        const body = JSON.parse(data) as Record<string, unknown>;
                        resolve({
                            statusCode: res.statusCode ?? 0,
                            body,
                        });
                    } catch (err) {
                        reject(err);
                    }
                });
            },
        );
        req.setTimeout(5000, () => {
            req.destroy(new Error("Request timeout"));
        });
        req.on("error", (err: unknown) => {
            reject(err);
        });
    });
}

describe("/health endpoint", () => {
    test("returns status ok, version, and timestamp", async () => {
        const server = await createTestServer();
        try {
            const res = await request(server, "/health");
            expect(res.statusCode).toBe(200);
            expect(res.body["status"]).toBe("ok");
            expect(res.body["timestamp"]).toBeDefined();
            expect(typeof res.body["version"]).toBe("string");
        } finally {
            server.close();
        }
    });
});

describe("/ready endpoint", () => {
    test("returns ready boolean and timestamp", async () => {
        const server = await createTestServer();
        try {
            const res = await request(server, "/ready");
            expect(res.statusCode).toBe(200);
            expect(typeof res.body["ready"]).toBe("boolean");
            expect(res.body["timestamp"]).toBeDefined();
        } finally {
            server.close();
        }
    });
});

describe("/metrics endpoint", () => {
    test("returns metrics JSON with required fields", async () => {
        const server = await createTestServer();
        try {
            const res = await request(server, "/metrics");
            expect(res.statusCode).toBe(200);
            expect(res.body["connectedPlayers"]).toBeDefined();
            expect(res.body["activeRooms"]).toBeDefined();
            expect(res.body["messagesInPerSec"]).toBeDefined();
            expect(res.body["messagesOutPerSec"]).toBeDefined();
            expect(res.body["bytesInPerSec"]).toBeDefined();
            expect(res.body["bytesOutPerSec"]).toBeDefined();
            expect(res.body["tickDurationP99Ms"]).toBeDefined();
            expect(res.body["eventLoopLagP99Us"]).toBeDefined();
            expect(res.body["rssMb"]).toBeDefined();
            expect(res.body["rejectionReasons"]).toBeDefined();
        } finally {
            server.close();
        }
    });
});
