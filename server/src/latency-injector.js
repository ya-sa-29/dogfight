export const systemClock = {
    now: () => Date.now(),
    setTimeout: (fn, delay) => setTimeout(fn, delay),
    clearTimeout: (id) => clearTimeout(id),
};

function calculatePayloadBytes(payload) {
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

const UPSTREAM_NEVER_DROP = new Set(["join", "leave", "input"]);
const DOWNSTREAM_NEVER_DROP = new Set(["joined", "pong"]);

export function createLatencyQueue(
    socket,
    config,
    direction,
    clock = systemClock,
    random = Math.random,
) {
    const queue = [];
    let timerId = null;
    let closed = false;
    let queuedBytes = 0;

    const limits = config[direction] || {};
    const maxMessages =
        limits.maxMessages ?? (direction === "upstream" ? 1000 : 500);
    const maxBytes =
        limits.maxBytes ?? (direction === "upstream" ? 256 * 1024 : 512 * 1024);
    const baseMs = Math.max(0, limits.baseMs ?? 0);
    const jitterMs = Math.max(0, limits.jitterMs ?? 0);
    const dropRate = Math.max(0, Math.min(1, limits.dropRate ?? 0));
    const enabled = limits.enabled ?? false;

    function scheduleNext() {
        if (closed || queue.length === 0) {
            timerId = null;
            return;
        }

        const now = clock.now();
        const { data, sendFn, scheduledAt } = queue[0];
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

    function getMessageType(data) {
        if (typeof data === "string") {
            try {
                const parsed = JSON.parse(data);
                return parsed?.type;
            } catch {
                return null;
            }
        }
        if (data instanceof Buffer) {
            try {
                const parsed = JSON.parse(data.toString("utf-8"));
                return parsed?.type;
            } catch {
                return null;
            }
        }
        if (data instanceof Uint8Array) {
            try {
                const parsed = JSON.parse(new TextDecoder().decode(data));
                return parsed?.type;
            } catch {
                return null;
            }
        }
        if (data && typeof data === "object") {
            return data.type;
        }
        return null;
    }

    function shouldDrop(messageType, direction) {
        if (direction === "upstream") {
            return !UPSTREAM_NEVER_DROP.has(messageType) && random() < dropRate;
        }
        return !DOWNSTREAM_NEVER_DROP.has(messageType) && random() < dropRate;
    }

    function handleUpstreamOverflow(messageType) {
        // For upstream input/join/leave overflow, close the socket to prevent sequence gap
        // and ensure clean reconnect with reset state
        if (
            direction === "upstream" &&
            (messageType === "input" ||
                messageType === "join" ||
                messageType === "leave")
        ) {
            if (socket.readyState === 1 && typeof socket.close === "function") {
                socket.close(
                    1008,
                    `Upstream queue overflow: ${messageType} sequence would gap`,
                );
            }
        }
    }

    function enqueue(data, sendFn, typeHint) {
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
        const messageType =
            typeof typeHint === "string" ? typeHint : getMessageType(data);
        if (shouldDrop(messageType, direction)) {
            return { accepted: true, delayed: false, dropped: true };
        }

        const msgBytes = calculatePayloadBytes(data);

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
        const previousScheduledAt =
            queue.length > 0 ? queue[queue.length - 1].scheduledAt : now;
        const scheduledAt = Math.max(now + sampledDelay, previousScheduledAt);

        queue.push({ data, sendFn, scheduledAt, bytes: msgBytes });
        queuedBytes += msgBytes;

        if (timerId === null) {
            scheduleNext();
        }
        return { accepted: true, delayed: true, dropped: false };
    }

    function cleanup() {
        if (closed) return;
        closed = true;
        if (timerId !== null) {
            clock.clearTimeout(timerId);
            timerId = null;
        }
        queue.length = 0;
        queuedBytes = 0;
    }

    function getQueueLength() {
        return queue.length;
    }

    function getQueuedBytes() {
        return queuedBytes;
    }

    function isClosed() {
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

export function parseLatencyConfig(requestUrl) {
    const url = new URL(requestUrl, "http://localhost");

    const getNum = (key, def = 0) => {
        const v = url.searchParams.get(key);
        const n = v !== null ? Number(v) : def;
        return Number.isNaN(n) ? def : n;
    };

    const baseUp = getNum("latency_up_base", getNum("latency", 0));
    const baseDown = getNum("latency_down_base", getNum("latency", 0));

    const clamp01 = (x) => {
        const n = Number.isNaN(x) ? 0 : x;
        return Math.max(0, Math.min(1, n));
    };

    const upstream = {
        enabled: baseUp > 0,
        baseMs: Math.max(0, baseUp),
        jitterMs: Math.max(0, getNum("latency_up_jitter", 0)),
        dropRate: clamp01(getNum("latency_up_drop", getNum("latency_drop", 0))),
        maxMessages: 1000,
        maxBytes: 256 * 1024,
    };

    const downstream = {
        enabled: baseDown > 0,
        baseMs: Math.max(0, baseDown),
        jitterMs: Math.max(0, getNum("latency_down_jitter", 0)),
        dropRate: clamp01(
            getNum("latency_down_drop", getNum("latency_drop", 0)),
        ),
        maxMessages: 500,
        maxBytes: 512 * 1024,
    };

    if (upstream.baseMs > 5000)
        console.warn(
            `latency-injector: upstream baseMs ${upstream.baseMs} > 5000ms`,
        );
    if (downstream.baseMs > 5000)
        console.warn(
            `latency-injector: downstream baseMs ${downstream.baseMs} > 5000ms`,
        );

    return { upstream, downstream };
}
