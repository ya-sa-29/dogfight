/**
 * Process-level metrics for observability.
 *
 * All metrics are in-memory gauges/counters exposed through `getMetrics()`.
 * Values are sampled on demand; rolling windows are bounded to prevent
 * unbounded memory growth.
 */

import { config } from "./config.js";

interface Counter {
    value: number;
}

interface Gauge {
    value: number;
}

interface Histogram {
    values: number[];
    maxSize: number;
    add(value: number): void;
    p99(): number;
}

function createCounter(): Counter {
    return { value: 0 };
}

function createGauge(initial = 0): Gauge {
    return { value: initial };
}

function createHistogram(maxSize = 600): Histogram {
    const values: number[] = [];
    return {
        values,
        maxSize,
        add(value: number): void {
            values.push(value);
            if (values.length > maxSize) {
                values.shift();
            }
        },
        p99(): number {
            if (values.length === 0) return 0;
            const sorted = [...values].sort((a, b) => a - b);
            const index = Math.ceil((sorted.length * 99) / 100) - 1;
            const value = sorted[Math.max(0, index)];
            return value ?? 0;
        },
    };
}

// ---- Connection / room gauges ----
const connectedPlayers = createGauge(0);
const activeRooms = createGauge(0);

// ---- Message / byte counters (per-second sampling) ----
let messagesIn = 0;
let messagesOut = 0;
let bytesIn = 0;
let bytesOut = 0;

let lastMsgIn = 0;
let lastMsgOut = 0;
let lastByteIn = 0;
let lastByteOut = 0;
let lastSecond = Date.now();
let metricsInitialized = false;

// ---- Tick duration histogram ----
const tickDurations = createHistogram();

// ---- Rejection counters by reason ----
const rejectionReasons = new Map<string, number>();

// ---- Event-loop utilization ----
let eventLoopLagSamples: number[] = [];
const MAX_LAG_SAMPLES = 100;
let loopCheckScheduled = false;
let lagSamplingStarted = false;

function sampleEventLoopLag(): void {
    if (loopCheckScheduled) return;
    loopCheckScheduled = true;

    const start = process.hrtime.bigint();
    setImmediate(() => {
        const end = process.hrtime.bigint();
        // Delay in microseconds: how late the setImmediate fired relative to ideal
        const lagUs = Number(end - start) / 1000;
        eventLoopLagSamples.push(lagUs);
        if (eventLoopLagSamples.length > MAX_LAG_SAMPLES) {
            eventLoopLagSamples.shift();
        }
        loopCheckScheduled = false;
        // Reschedule next sample
        setTimeout(sampleEventLoopLag, 1000);
    });
}

// Start periodic event-loop sampling
setTimeout(sampleEventLoopLag, 1000).unref();
lagSamplingStarted = true;

// ---- Public API ----

export function incrementConnectedPlayers(delta: number): void {
    connectedPlayers.value += delta;
    if (connectedPlayers.value < 0) connectedPlayers.value = 0;
}

export function incrementActiveRooms(delta: number): void {
    activeRooms.value += delta;
    if (activeRooms.value < 0) activeRooms.value = 0;
}

export function recordMessageIn(bytes: number): void {
    messagesIn += 1;
    bytesIn += bytes;
}

export function recordMessageOut(bytes: number): void {
    messagesOut += 1;
    bytesOut += bytes;
}

export function recordTickDuration(ms: number): void {
    tickDurations.add(ms);
}

export function recordRejection(reason: string): void {
    const current = rejectionReasons.get(reason) || 0;
    rejectionReasons.set(reason, current + 1);
}

export function getRejectionReasons(): Record<string, number> {
    return Object.fromEntries(rejectionReasons);
}

export interface MetricsSnapshot {
    timestamp: string;
    uptimeMs: number;
    nodeEnv: string;
    connectedPlayers: number;
    activeRooms: number;
    messagesInPerSec: number;
    messagesOutPerSec: number;
    bytesInPerSec: number;
    bytesOutPerSec: number;
    tickDurationP99Ms: number;
    eventLoopLagP99Us: number;
    rssMb: number;
    rejectionReasons: Record<string, number>;
}

export function getMetrics(): MetricsSnapshot {
    const now = Date.now();
    const elapsedSec = Math.max(1, now - lastSecond) / 1000;

    // First sample: record baselines, return zero rates to avoid inflated
    // per-second values from a nonexistent previous baseline.
    if (!metricsInitialized) {
        lastMsgIn = messagesIn;
        lastMsgOut = messagesOut;
        lastByteIn = bytesIn;
        lastByteOut = bytesOut;
        lastSecond = now;
        metricsInitialized = true;

        const lagSamples = [...eventLoopLagSamples].sort((a, b) => a - b);
        const lagP99Us =
            lagSamples.length > 0
                ? (lagSamples[
                      Math.max(0, Math.ceil((lagSamples.length * 99) / 100) - 1)
                  ] ?? 0)
                : -1;

        const mem = process.memoryUsage();

        return {
            timestamp: new Date().toISOString(),
            uptimeMs: process.uptime() * 1000,
            nodeEnv: config.nodeEnv,
            connectedPlayers: connectedPlayers.value,
            activeRooms: activeRooms.value,
            messagesInPerSec: 0,
            messagesOutPerSec: 0,
            bytesInPerSec: 0,
            bytesOutPerSec: 0,
            tickDurationP99Ms: Math.round(tickDurations.p99() * 100) / 100,
            eventLoopLagP99Us: lagP99Us,
            rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
            rejectionReasons: getRejectionReasons(),
        };
    }

    // Compute per-second rates since last sample
    const msgInPerSec = (messagesIn - lastMsgIn) / elapsedSec;
    const msgOutPerSec = (messagesOut - lastMsgOut) / elapsedSec;
    const byteInPerSec = (bytesIn - lastByteIn) / elapsedSec;
    const byteOutPerSec = (bytesOut - lastByteOut) / elapsedSec;

    // Roll counters forward
    lastMsgIn = messagesIn;
    lastMsgOut = messagesOut;
    lastByteIn = bytesIn;
    lastByteOut = bytesOut;
    lastSecond = now;

    const lagSamples = [...eventLoopLagSamples].sort((a, b) => a - b);
    const lagP99Us =
        lagSamples.length > 0
            ? (lagSamples[
                  Math.max(0, Math.ceil((lagSamples.length * 99) / 100) - 1)
              ] ?? 0)
            : -1;

    const mem = process.memoryUsage();

    return {
        timestamp: new Date().toISOString(),
        uptimeMs: process.uptime() * 1000,
        nodeEnv: config.nodeEnv,
        connectedPlayers: connectedPlayers.value,
        activeRooms: activeRooms.value,
        messagesInPerSec: Math.round(msgInPerSec * 100) / 100,
        messagesOutPerSec: Math.round(msgOutPerSec * 100) / 100,
        bytesInPerSec: Math.round(byteInPerSec * 100) / 100,
        bytesOutPerSec: Math.round(byteOutPerSec * 100) / 100,
        tickDurationP99Ms: Math.round(tickDurations.p99() * 100) / 100,
        eventLoopLagP99Us: lagP99Us,
        rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        rejectionReasons: getRejectionReasons(),
    };
}
