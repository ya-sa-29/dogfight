import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import { setupWebSocket } from "../../server/src/ws.js";
import { getRooms } from "../../server/src/rooms.js";

const HEARTBEAT_INTERVAL = 15000;

describe("WebSocket heartbeat setup", () => {
    let httpServer: ReturnType<typeof createServer>;
    let setIntervalSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        httpServer = createServer();
        setIntervalSpy = vi.spyOn(globalThis, "setInterval");
        setupWebSocket(httpServer, {
            loadRooms: () => Promise.resolve(getRooms()),
        });
    });

    afterEach(() => {
        httpServer.close();
        setIntervalSpy.mockRestore();
    });

    test("heartbeat interval is set up with HEARTBEAT_INTERVAL", () => {
        expect(setIntervalSpy).toHaveBeenCalledWith(
            expect.any(Function),
            HEARTBEAT_INTERVAL,
        );
    });
});
