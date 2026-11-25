import { describe, expect, test, vi, beforeEach } from "vitest";

type MetricsModule = typeof import("../src/metrics.js");

async function importMetrics(): Promise<MetricsModule> {
    return (await vi.importActual("../src/metrics.js")) as MetricsModule;
}

describe("metrics first sample", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("first sample returns zero rates without inflation", async () => {
        const { getMetrics, recordMessageIn, recordMessageOut } =
            await importMetrics();
        recordMessageIn(100);
        recordMessageIn(200);
        recordMessageOut(50);

        const m = getMetrics();

        expect(m.messagesInPerSec).toBe(0);
        expect(m.messagesOutPerSec).toBe(0);
        expect(m.bytesInPerSec).toBe(0);
        expect(m.bytesOutPerSec).toBe(0);
    });

    test("second sample computes non-zero per-second rates", async () => {
        const {
            getMetrics,
            recordMessageIn,
            incrementConnectedPlayers,
        } = await importMetrics();

        // First sample: establish baseline
        recordMessageIn(100);
        incrementConnectedPlayers(1);
        const first = getMetrics();
        expect(first.messagesInPerSec).toBe(0);
        expect(first.connectedPlayers).toBe(1);

        // Second sample: record more messages, expect non-zero rate
        recordMessageIn(50);
        incrementConnectedPlayers(1);

        const second = getMetrics();
        expect(second.messagesInPerSec).toBeGreaterThan(0);
        expect(second.connectedPlayers).toBe(2);
    });

    test("first sample connected players gauge is correct", async () => {
        const { getMetrics, incrementConnectedPlayers } = await importMetrics();
        incrementConnectedPlayers(3);
        incrementConnectedPlayers(-1);

        const m = getMetrics();
        expect(m.connectedPlayers).toBe(2);
    });

    test("connectedPlayers does not go below zero on first sample", async () => {
        const { getMetrics, incrementConnectedPlayers } = await importMetrics();
        incrementConnectedPlayers(-5);

        const m = getMetrics();
        expect(m.connectedPlayers).toBe(0);
    });
});

describe("metrics event-loop lag initialization", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("eventLoopLagP99Us returns -1 before any samples", async () => {
        const { getMetrics } = await importMetrics();

        const m = getMetrics();

        expect(m.eventLoopLagP99Us).toBe(-1);
    });

    test("eventLoopLagP99Us is defined and numeric after first sample", async () => {
        const { getMetrics } = await importMetrics();

        const m = getMetrics();

        expect(typeof m.eventLoopLagP99Us).toBe("number");
        expect(m.eventLoopLagP99Us).toBeGreaterThanOrEqual(-1);
    });
});

describe("metrics gauges", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("incrementConnectedPlayers tracks player count", async () => {
        const { getMetrics, incrementConnectedPlayers } = await importMetrics();
        incrementConnectedPlayers(1);
        incrementConnectedPlayers(1);
        incrementConnectedPlayers(-1);

        const m = getMetrics();
        expect(m.connectedPlayers).toBe(1);
    });

    test("incrementActiveRooms tracks room count", async () => {
        const { getMetrics, incrementActiveRooms } = await importMetrics();
        incrementActiveRooms(3);
        incrementActiveRooms(-1);

        const m = getMetrics();
        expect(m.activeRooms).toBe(2);
    });
});

describe("metrics rejection counters", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("records rejections by reason", async () => {
        const {
            getMetrics,
            getRejectionReasons,
            recordRejection,
        } = await importMetrics();
        recordRejection("origin");
        recordRejection("origin");
        recordRejection("rate_limit");

        const reasons = getRejectionReasons();
        expect(reasons["origin"]).toBe(2);
        expect(reasons["rate_limit"]).toBe(1);

        const m = getMetrics();
        expect(m.rejectionReasons["origin"]).toBe(2);
        expect(m.rejectionReasons["rate_limit"]).toBe(1);
    });
});

describe("metrics tick duration histogram", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("records tick durations and computes p99", async () => {
        const { getMetrics, recordTickDuration } = await importMetrics();
        for (let i = 1; i <= 100; i++) {
            recordTickDuration(i);
        }

        const m = getMetrics();
        expect(m.tickDurationP99Ms).toBeGreaterThan(0);
        expect(m.tickDurationP99Ms).toBeLessThanOrEqual(100);
    });

    test("tickDurationP99Ms returns 0 when no samples", async () => {
        const { getMetrics } = await importMetrics();

        const m = getMetrics();
        expect(m.tickDurationP99Ms).toBe(0);
    });
});

describe("metrics snapshot structure", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("returns a well-formed MetricsSnapshot", async () => {
        const { getMetrics } = await importMetrics();

        const m = getMetrics();

        expect(m).toMatchObject({
            timestamp: expect.any(String),
            uptimeMs: expect.any(Number),
            nodeEnv: expect.any(String),
            connectedPlayers: expect.any(Number),
            activeRooms: expect.any(Number),
            messagesInPerSec: expect.any(Number),
            messagesOutPerSec: expect.any(Number),
            bytesInPerSec: expect.any(Number),
            bytesOutPerSec: expect.any(Number),
            tickDurationP99Ms: expect.any(Number),
            eventLoopLagP99Us: expect.any(Number),
            rssMb: expect.any(Number),
            rejectionReasons: expect.any(Object),
        });
    });

    test("includes nodeEnv from config", async () => {
        const { getMetrics } = await importMetrics();

        expect(typeof getMetrics().nodeEnv).toBe("string");
        expect(getMetrics().nodeEnv.length).toBeGreaterThan(0);
    });

    test("rssMb is a positive number", async () => {
        const { getMetrics } = await importMetrics();

        expect(getMetrics().rssMb).toBeGreaterThan(0);
    });
});
