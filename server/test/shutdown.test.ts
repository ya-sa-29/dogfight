import { describe, expect, test, vi, beforeEach } from "vitest";
import { notifyShutdown } from "../src/ws.js";
import {
    shutdown,
    isServerReady,
    isServerShuttingDown,
} from "../src/index.js";
import type { WebSocket, WebSocketServer } from "ws";

process.env["VITEST"] = "true";

// Mock process.exit permanently for this test file to prevent vitest
// from intercepting the shutdown() process.exit call.
vi.spyOn(process, "exit").mockImplementation(
    (() => undefined as never) as never,
);

function createMockSocket(readyState = 1): WebSocket {
    return {
        readyState,
        send: vi.fn(),
        close: vi.fn(),
    } as unknown as WebSocket;
}

function createMockWss(clientCount = 2): WebSocketServer {
    const clients = new Set<WebSocket>();
    for (let i = 0; i < clientCount; i++) {
        clients.add(createMockSocket());
    }

    return {
        clients,
        close: vi.fn(),
    } as unknown as WebSocketServer;
}

describe("notifyShutdown", () => {
    test("sends shutdown message and closes each client with code 1001", () => {
        const wss = createMockWss(2);

        notifyShutdown(wss);

        for (const socket of wss.clients) {
            expect(socket.send).toHaveBeenCalled();
            expect(socket.close).toHaveBeenCalledWith(
                1001,
                "server shutting down",
            );
        }
    });

    test("handles empty client list", () => {
        const wss = createMockWss(0);

        expect(() => notifyShutdown(wss)).not.toThrow();
    });

    test("skips sockets that are not open", () => {
        const wss = createMockWss(1);
        const closedSocket = {
            readyState: 3,
            send: vi.fn(),
            close: vi.fn(),
        } as unknown as WebSocket;
        wss.clients.add(closedSocket);

        expect(() => notifyShutdown(wss)).not.toThrow();
        expect(closedSocket.send).not.toHaveBeenCalled();
        expect(closedSocket.close).not.toHaveBeenCalled();
    });
});

describe("shutdown coordination", () => {
    test("sets isShuttingDown and isReady false on SIGTERM", () => {
        expect(isServerReady()).toBe(false);
        expect(isServerShuttingDown()).toBe(false);

        shutdown("SIGTERM");

        expect(isServerShuttingDown()).toBe(true);
        expect(isServerReady()).toBe(false);
    });

    test("is idempotent - second SIGTERM returns early", () => {
        shutdown("SIGTERM");
        shutdown("SIGTERM");

        // Second call returns early due to isShuttingDown check
        expect(isServerShuttingDown()).toBe(true);
    });

    test("does not throw when server.close callback fires", () => {
        shutdown("SIGTERM");

        // server.close() on a non-listening server emits ERR_SERVER_NOT_RUNNING
        // which sets process.exitCode = 1, then calls process.exit(1).
        // The mock above prevents vitest from intercepting this.
        expect(isServerShuttingDown()).toBe(true);
    });
});
