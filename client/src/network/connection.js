
export class Connection extends EventTarget {
    constructor({
        url = "/ws",
        reconnectDelay = 500,
        maxReconnectDelay = 30000,
    } = {}) {
        super();

        this.url = url;
        this.reconnectDelay = reconnectDelay;
        this.maxReconnectDelay = maxReconnectDelay;

        this.socket = null;
        this.sendQueue = [];
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.reconnectAttempts = 0;
        this.manualClose = false;

        this.pingId = 0;
        this.pendingPings = new Map();
        this.rttSamples = [];

        this.networkConditions = {
            latencyMs: 0,
            jitterMs: 0,
            packetLoss: 0,
        };

        this.pendingTimers = new Set();

        this.lastSnapshotReceivedAt = null;

        this.rateSampleAt = performance.now();
        this.lastRateSentBytes = 0;
        this.lastRateReceivedBytes = 0;

        this.networkStats = {
            sentMessages: 0,
            receivedMessages: 0,
            droppedOutgoing: 0,
            droppedIncoming: 0,
            sentBytes: 0,
            receivedBytes: 0,
            sentBytesPerSecond: 0,
            receivedBytesPerSecond: 0,
            rttMs: 0,
            averageRttMs: 0,
            maxRttMs: 0,
        };
    }

    setNetworkConditions({
        latencyMs = this.networkConditions.latencyMs,
        jitterMs = this.networkConditions.jitterMs,
        packetLoss = this.networkConditions.packetLoss,
    } = {}) {
        if (
            !Number.isFinite(latencyMs) ||
            latencyMs < 0 ||
            !Number.isFinite(jitterMs) ||
            jitterMs < 0 ||
            !Number.isFinite(packetLoss) ||
            packetLoss < 0 ||
            packetLoss > 1
        ) {
            throw new TypeError("Invalid network conditions");
        }

        this.networkConditions = {
            latencyMs,
            jitterMs,
            packetLoss,
        };

        this.rttSamples = [];
        this.pendingPings.clear();

        this.networkStats.rttMs = 0;
        this.networkStats.averageRttMs = 0;
        this.networkStats.maxRttMs = 0;

        return { ...this.networkConditions };
    }

    updateTransferRates() {
        const now = performance.now();
        const elapsed = now - this.rateSampleAt;

        if (elapsed < 500) {
            return;
        }

        const sentDelta =
            this.networkStats.sentBytes - this.lastRateSentBytes;

        const receivedDelta =
            this.networkStats.receivedBytes - this.lastRateReceivedBytes;

        const seconds = elapsed / 1000;

        this.networkStats.sentBytesPerSecond =
            sentDelta / seconds;

        this.networkStats.receivedBytesPerSecond =
            receivedDelta / seconds;

        this.lastRateSentBytes = this.networkStats.sentBytes;
        this.lastRateReceivedBytes = this.networkStats.receivedBytes;
        this.rateSampleAt = now;
    }

    getNetworkStats() {
        this.updateTransferRates();

        const snapshotAgeMs =
            this.lastSnapshotReceivedAt === null
                ? null
                : performance.now() - this.lastSnapshotReceivedAt;

        return {
            ...this.networkStats,
            ...this.networkConditions,

            snapshotAgeMs,

            rttSamples: [...this.rttSamples],

            pendingTimers: this.pendingTimers.size,
            queuedMessages: this.sendQueue.length,
            pendingPings: this.pendingPings.size,
        };
    }

    getDelay() {
        const { latencyMs, jitterMs } = this.networkConditions;
        const variation = (Math.random() * 2 - 1) * jitterMs;

        return Math.max(0, latencyMs + variation);
    }

    shouldDropPacket() {
        return Math.random() < this.networkConditions.packetLoss;
    }

    schedule(callback, delay) {
        const timer = setTimeout(() => {
            this.pendingTimers.delete(timer);
            callback();
        }, delay);

        this.pendingTimers.add(timer);
    }

    startPinging(socket) {
        this.stopPinging();

        this.pingTimer = setInterval(() => {
            if (
                this.socket !== socket ||
                socket.readyState !== WebSocket.OPEN
            ) {
                return;
            }

            this.send({
                type: "ping",
                timestamp: ++this.pingId,
            });
        }, 1000);
    }

    stopPinging() {
        if (this.pingTimer !== null) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }

        this.pendingPings.clear();
    }

    recordRtt(timestamp) {
        const sentAt = this.pendingPings.get(timestamp);

        if (sentAt === undefined) {
            return;
        }

        this.pendingPings.delete(timestamp);

        const receivedAt = performance.now();
        const rtt = receivedAt - sentAt;

        this.rttSamples.push(rtt);

        if (this.rttSamples.length > 60) {
            this.rttSamples.shift();
        }

        this.networkStats.rttMs = rtt;

        this.networkStats.averageRttMs =
            this.rttSamples.reduce((sum, value) => sum + value, 0) /
            this.rttSamples.length;

        this.networkStats.maxRttMs = Math.max(...this.rttSamples);
    }

    connect() {
        if (
            this.socket &&
            (this.socket.readyState === WebSocket.OPEN ||
                this.socket.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        this.manualClose = false;

        const socketUrl = new URL(this.url, window.location.href);

        socketUrl.protocol =
            window.location.protocol === "https:" ? "wss:" : "ws:";

        const socket = new WebSocket(socketUrl);

        this.socket = socket;

        socket.addEventListener("open", () => {
            if (this.socket !== socket) {
                return;
            }

            this.reconnectAttempts = 0;

            this.dispatchEvent(new Event("open"));

            this.flushQueue();
            this.startPinging(socket);
        });

        socket.addEventListener("message", (event) => {
            if (this.socket !== socket) {
                return;
            }

            let message;

            try {
                message = JSON.parse(event.data);
            } catch {
                this.dispatchEvent(
                    new CustomEvent("error", {
                        detail: { message: "Invalid server message JSON" },
                    }),
                );
                return;
            }

            if (!message || typeof message.type !== "string") {
                return;
            }

            if (
                message.type === "snapshot" &&
                this.shouldDropPacket()
            ) {
                this.networkStats.droppedIncoming++;
                return;
            }

            const receivedAt = performance.now();

            if (message.type === "snapshot") {
                this.lastSnapshotReceivedAt = receivedAt;
            }

            const delay = this.getDelay();

            this.schedule(() => {
                if (this.socket !== socket) {
                    return;
                }

                this.networkStats.receivedMessages++;
                this.networkStats.receivedBytes +=
                    new TextEncoder().encode(event.data).length;

                if (message.type === "pong") {
                    this.recordRtt(message.timestamp);
                }

                if (message.type === "snapshot") {
                    message.clientReceivedAt = receivedAt;
                }

                this.dispatchMessage(message);
            }, delay);
        });

        socket.addEventListener("close", (event) => {
            if (this.socket !== socket) {
                return;
            }

            this.stopPinging();

            this.dispatchEvent(
                new CustomEvent("close", {
                    detail: {
                        code: event.code,
                        reason: event.reason,
                    },
                }),
            );

            if (!this.manualClose) {
                this.scheduleReconnect();
            }
        });

        socket.addEventListener("error", (event) => {
            this.dispatchEvent(
                new CustomEvent("error", {
                    detail: { event },
                }),
            );
        });
    }

    dispatchMessage(message) {
        this.dispatchEvent(
            new CustomEvent(message.type, {
                detail: message,
            }),
        );

        this.dispatchEvent(
            new CustomEvent("message", {
                detail: message,
            }),
        );
    }

    send(message) {
        const data = JSON.stringify(message);

        if (this.socket?.readyState === WebSocket.OPEN) {
            this.sendRaw(data, message.type, this.socket);
            return;
        }

        this.sendQueue.push({
            data,
            type: message.type,
        });

        if (
            !this.manualClose &&
            (!this.socket ||
                this.socket.readyState === WebSocket.CLOSED)
        ) {
            this.connect();
        }
    }

    sendRaw(data, type, socket) {
        if (type === "input" && this.shouldDropPacket()) {
            this.networkStats.droppedOutgoing++;
            return;
        }

        let pingMessage = null;

        if (type === "ping") {
            pingMessage = JSON.parse(data);

            const sentAt = performance.now();

            this.pendingPings.set(pingMessage.timestamp, sentAt);
        }

        this.schedule(() => {
            if (
                this.socket !== socket ||
                socket.readyState !== WebSocket.OPEN
            ) {
                if (pingMessage) {
                    this.pendingPings.delete(pingMessage.timestamp);
                }

                return;
            }

            socket.send(data);

            this.networkStats.sentMessages++;
            this.networkStats.sentBytes +=
                new TextEncoder().encode(data).length;
        }, this.getDelay());
    }

    flushQueue() {
        while (
            this.sendQueue.length > 0 &&
            this.socket?.readyState === WebSocket.OPEN
        ) {
            const message = this.sendQueue.shift();

            this.sendRaw(
                message.data,
                message.type,
                this.socket,
            );
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer !== null || this.manualClose) {
            return;
        }

        const delay = Math.min(
            this.reconnectDelay * 2 ** this.reconnectAttempts,
            this.maxReconnectDelay,
        );

        this.reconnectAttempts++;

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    disconnect() {
        this.manualClose = true;

        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.stopPinging();

        for (const timer of this.pendingTimers) {
            clearTimeout(timer);
        }

        this.pendingTimers.clear();
        this.sendQueue = [];

        if (this.socket) {
            const socket = this.socket;
            this.socket = null;

            socket.close(1000, "Client disconnected");
        }
    }
}
