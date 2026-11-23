import type { WebSocket } from "ws";

export const systemClock = {
    now: () => Date.now(),
    setTimeout: (fn: (...args: unknown[]) => void, delay: number) => setTimeout(fn, delay),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
};

function calculatePayloadBytes(payload: Buffer | Uint8Array | string | object): number {
    if (payload instanceof Buffer) {
        return payload.length;
    }
    if (payload instanceof Uint8Array) {
        return payload.byteLength;
    }
    if (typeof payload === "string") {
        return Buffer.byteLength(payload);
    }
    return Buffer.byteLength(JSON.stringify(payload));
}

const UPSTREAM_NEVER_DROP = new Set<string>(["join", "leave", "input"]);
const DOWNSTREAM_NEVER_DROP = new Set<string>(["joined", "pong"]);

export interface LatencyQueueConfig {
    maxMessages?: number;
    maxBytes?: number;
    baseMs?: number;
    jitterMs?: number;
    dropRate?: number;
    enabled?: boolean;
}

export interface LatencyQueue {
    enqueue(data: unknown, sendFn: (socket: WebSocket, message: unknown) => void, typeHint?: string): EnqueueResult;
    cleanup(): void;
    getQueueLength(): number;
    getQueuedBytes(): number;
    isClosed(): boolean;
}

export interface EnqueueResult {
    accepted: boolean;
    delayed?: boolean;
    dropped?: boolean;
    reason?: string;
}

interface LatencyConfig {
    upstream: LatencyQueueConfig & { enabled: boolean };
    downstream: LatencyQueueConfig & { enabled: boolean };
}

interface Clock {
    now: () => number;
    setTimeout: (fn: (...args: unknown[]) => void, delay: number) => ReturnType<typeof setTimeout>;
    clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
}

export function createLatencyQueue(
    socket: WebSocket,
    config: { upstream: LatencyQueueConfig; downstream: LatencyQueueConfig },
    direction: "upstream" | "downstream",
    clock: Clock = systemClock,
    random: () => number = Math.random,
): LatencyQueue {
    const queue: Array<{ data: unknown; sendFn: (socket: WebSocket, message: unknown) => void; scheduledAt: number; bytes: number }> = [];
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let queuedBytes = 0;

    const limits = config[direction] || {};
    const maxMessages = limits.maxMessages ?? (direction === "upstream" ? 1000 : 500);
    const maxBytes = limits.maxBytes ?? (direction === "upstream" ? 256 * 1024 : 512 * 1024);
    const baseMs = Math.max(0, limits.baseMs ?? 0);
    const jitterMs = Math.max(0, limits.jitterMs ?? 0);
    const dropRate = Math.max(0, Math.min(1, limits.dropRate ?? 0));
    const enabled = limits.enabled ?? false;

    function scheduleNext(): void {
        if (closed || queue.length === 0) {
            timerId = null;
            return;
        }

        const now = clock.now();
        const first = queue[0];
        if (!first) {
            timerId = null;
            return;
        }
        const { data, sendFn, scheduledAt } = first;
        const delay = Math.max(0, scheduledAt - now);

        timerId = clock.setTimeout(() => {
            timerId = null;
            if (!closed && socket.readyState === 1) {
                sendFn(socket, data);
            }
            const dequeued = queue.shift();
            queuedBytes = Math.max(0, queuedBytes - (dequeued?.bytes ?? 0));
            scheduleNext();
        }, delay);
    }

    function getMessageType(data: unknown): string | null {
        if (typeof data === "string") {
            try {
                const parsed = JSON.parse(data);
                return parsed?.type ?? null;
            } catch {
                return null;
            }
        }
        if (data instanceof Buffer) {
            try {
                const parsed = JSON.parse(data.toString("utf-8"));
                return parsed?.type ?? null;
            } catch {
                return null;
            }
        }
        if (data instanceof Uint8Array) {
            try {
                const parsed = JSON.parse(new TextDecoder().decode(data));
                return parsed?.type ?? null;
            } catch {
                return null;
            }
        }
        if (data && typeof data === "object") {
            return (data as Record<string, unknown>)["type"] as string;
        }
        return null;
    }

    function shouldDrop(messageType: string | null, dir: "upstream" | "downstream"): boolean {
        if (dir === "upstream") {
            return !UPSTREAM_NEVER_DROP.has(messageType ?? "") && random() < dropRate;
        }
        return !DOWNSTREAM_NEVER_DROP.has(messageType ?? "") && random() < dropRate;
    }

    function handleUpstreamOverflow(messageType: string | null): void {
        // For upstream input/join/leave overflow, close the socket to prevent sequence gap
        // and ensure clean reconnect with reset state
        if (
            direction === "upstream" &&
            (messageType === "input" || messageType === "join" || messageType === "leave")
        ) {
            if (socket.readyState === 1 && typeof socket.close === "function") {
                socket.close(
                    1008,
                    `Upstream queue overflow: ${messageType} sequence would gap`,
                );
            }
        }
    }

    function enqueue(data: unknown, sendFn: (socket: WebSocket, message: unknown) => void, typeHint?: string): EnqueueResult {
        if (closed) {
            return { accepted: false, reason: "closed" };
        }

        if (!enabled) {
            if (socket.readyState === 1) {
                sendFn(socket, data);
            }
            return { accepted: true, delayed: false };
        }

        // `typeHint` lets callers that know the message type out-of-band (e.g.
        // a binary frame that is always an input) avoid the JSON-sniffing in
        // getMessageType, which cannot classify binary payloads. It is only
        // honoured when it is a string; existing callers that pass a third
        // argument (e.g. a clock) are unaffected and fall back to detection.
        const messageType = typeof typeHint === "string" ? typeHint : getMessageType(data);
        if (shouldDrop(messageType, direction)) {
            return { accepted: true, delayed: false, dropped: true };
        }

        const msgBytes = calculatePayloadBytes(data as Buffer | Uint8Array | string | object);

        if (queue.length >= maxMessages) {
            if (direction === "upstream") {
                handleUpstreamOverflow(messageType);
                return { accepted: false, reason: "queue_overflow" };
            }
            return { accepted: false, reason: "queue_overflow" };
        }

        if (queuedBytes + msgBytes > maxBytes) {
            if (direction === "upstream") {
                handleUpstreamOverflow(messageType);
                return { accepted: false, reason: "queue_overflow" };
            }
            return { accepted: false, reason: "queue_overflow" };
        }

        const now = clock.now();
        const jitterSample = (random() - 0.5) * 2 * jitterMs;
        const sampledDelay = Math.max(0, baseMs + jitterSample);
        const lastItem = queue[queue.length - 1];
        const previousScheduledAt = lastItem ? lastItem.scheduledAt : now;
        const scheduledAt = Math.max(now + sampledDelay, previousScheduledAt);

        queue.push({ data, sendFn, scheduledAt, bytes: msgBytes });
        queuedBytes += msgBytes;

        if (timerId === null) {
            scheduleNext();
        }
        return { accepted: true, delayed: true, dropped: false };
    }

    function cleanup(): void {
        if (closed) return;
        closed = true;
        if (timerId !== null) {
            clock.clearTimeout(timerId);
            timerId = null;
        }
        queue.length = 0;
        queuedBytes = 0;
    }

    function getQueueLength(): number {
        return queue.length;
    }

    function getQueuedBytes(): number {
        return queuedBytes;
    }

    function isClosed(): boolean {
        return closed;
    }

    return {
        enqueue,
        cleanup,
        getQueueLength,
        getQueuedBytes,
        isClosed,
    };
}

export function parseLatencyConfig(requestUrl: string): LatencyConfig {
    const url = new URL(requestUrl, "http://localhost");

    const getNum = (key: string, def = 0): number => {
        const v = url.searchParams.get(key);
        const n = v !== null ? Number(v) : def;
        return Number.isNaN(n) ? def : n;
    };

    const baseUp = getNum("latency_up_base", getNum("latency", 0));
    const baseDown = getNum("latency_down_base", getNum("latency", 0));

    const clamp01 = (x: number): number => {
        const n = Number.isNaN(x) ? 0 : x;
        return Math.max(0, Math.min(1, n));
    };

    const upstream: LatencyQueueConfig & { enabled: boolean } = {
        enabled: baseUp > 0,
        baseMs: Math.max(0, baseUp),
        jitterMs: Math.max(0, getNum("latency_up_jitter", 0)),
        dropRate: clamp01(getNum("latency_up_drop", getNum("latency_drop", 0))),
        maxMessages: 1000,
        maxBytes: 256 * 1024,
    };

    const downstream: LatencyQueueConfig & { enabled: boolean } = {
        enabled: baseDown > 0,
        baseMs: Math.max(0, baseDown),
        jitterMs: Math.max(0, getNum("latency_down_jitter", 0)),
        dropRate: clamp01(getNum("latency_down_drop", getNum("latency_drop", 0))),
        maxMessages: 500,
        maxBytes: 512 * 1024,
    };

    if (upstream.baseMs! > 5000) console.warn(`latency-injector: upstream baseMs ${upstream.baseMs} > 5000ms`);
    if (downstream.baseMs! > 5000) console.warn(`latency-injector: downstream baseMs ${downstream.baseMs} > 5000ms`);

    return { upstream, downstream };
}