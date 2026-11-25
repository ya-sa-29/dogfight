import {
    encodeClientMessage,
    decodeServerFrame,
} from "./wire.js";

/**
 * Return the payload size in bytes for byte accounting. Handles the JSON string
 * path and the M4 binary ArrayBuffer path.
 */
function payloadBytes(data) {
    if (typeof data === "string") {
        return new TextEncoder().encode(data).length;
    }
    if (data instanceof ArrayBuffer) {
        return data.byteLength;
    }
    if (ArrayBuffer.isView(data)) {
        return data.byteLength;
    }
    return 0;
}

/**
 * Build the WebSocket URL from the configured endpoint and the current page.
 *
 * The page's query string (for example `?latency=100`) is forwarded to the
 * WebSocket URL so server-side configuration such as the latency injector can
 * read it. The page query is only appended when the endpoint itself carries no
 * query of its own, which prevents duplicated parameters and keeps a plain
 * `/ws` connection byte-for-byte identical to before.
 *
 * @param {string} baseUrl  Configured endpoint (e.g. "/ws" or "/ws?latency=100").
 * @param {string} pageUrl  Current page URL (window.location.href).
 * @param {string} protocol WebSocket protocol ("ws:" or "wss:").
 * @returns {URL}
 */
export function buildSocketUrl(baseUrl, pageUrl, protocol) {
    const socketUrl = new URL(baseUrl, pageUrl);
    socketUrl.protocol = protocol;

    // Forward the page's query string only if the endpoint does not already
    // define its own. new URL("/ws", page) drops the page query, so without
    // this step latency parameters would never reach the server.
    if (!socketUrl.search) {
        const pageSearch = new URL(pageUrl).search;
        if (pageSearch) {
            socketUrl.search = pageSearch;
        }
    }

    return socketUrl;
}

export class Connection extends EventTarget {
    constructor({
        url = "/ws",
        reconnectDelay = 500,
        maxReconnectDelay = 30000,
        codec = "json",
    } = {}) {
        super();

        this.url = url;
        this.reconnectDelay = reconnectDelay;
        this.maxReconnectDelay = maxReconnectDelay;
        // M4: data-plane transport codec ("json" | "binary"). Control-plane
        // messages always travel as JSON; only `input` is binary-encoded.
        this.codec = codec === "binary" ? "binary" : "json";

        this.socket = null;
        this.sendQueue = [];
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.manualClose = false;
        this.permanentClose = false;

        // RTT measurement
        this.pingInterval = null;
        this.pendingPing = null; // { timestamp, seq }
        this.pingSeq = 0;
        this.currentRtt = null;
        this.lastRttUpdate = 0;

        // Byte counters (payload bytes, UTF-8)
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.bytesSentLastSecond = 0;
        this.bytesReceivedLastSecond = 0;
        this.lastByteCountReset = performance.now();
    }

    connect() {
        if (this.permanentClose) {
            return;
        }

        if (
            this.socket &&
            (this.socket.readyState === WebSocket.OPEN ||
                this.socket.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        this.manualClose = false;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.bytesSentLastSecond = 0;
        this.bytesReceivedLastSecond = 0;
        this.lastByteCountReset = performance.now();

        const socketUrl = buildSocketUrl(
            this.url,
            window.location.href,
            window.location.protocol === "https:" ? "wss:" : "ws:",
        );

        this.socket = new WebSocket(socketUrl);

        // M4: in binary mode, request ArrayBuffer for binary frames so inbound
        // snapshots arrive as ArrayBuffer (decodeBinary). In JSON mode the
        // server only sends text frames, so the default binaryType is fine.
        if (this.codec === "binary") {
            this.socket.binaryType = "arraybuffer";
        }

        this.socket.addEventListener("open", () => {
            this.reconnectAttempts = 0;

            this.dispatchEvent(new Event("open"));

            this.flushQueue();
            this.startPingInterval();
        });

        this.socket.addEventListener("message", (event) => {
            // Count received bytes (payload only)
            let receivedBytes = 0;
            if (typeof event.data === "string") {
                receivedBytes = new TextEncoder().encode(event.data).length;
            } else if (event.data instanceof ArrayBuffer) {
                receivedBytes = event.data.byteLength;
            } else if (event.data instanceof Blob) {
                // Blob - we can't easily get size without reading, skip for now
                receivedBytes = 0;
            }
            this.bytesReceived += receivedBytes;
            this.bytesReceivedLastSecond += receivedBytes;

            let message;

            try {
                // M4: binary frames are snapshots (decodeBinary); text frames
                // are JSON control-plane messages (and JSON-mode snapshots).
                message = decodeServerFrame(event.data);
            } catch {
                this.dispatchEvent(
                    new CustomEvent("error", {
                        detail: { message: "Invalid server message" },
                    }),
                );
                return;
            }

            if (!message || typeof message.type !== "string") {
                return;
            }

            // Handle pong for RTT measurement
            if (message.type === "pong") {
                this.handlePong(message);
                return; // Don't dispatch pong as game event
            }

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
        });

        this.socket.addEventListener("close", (event) => {
            this.stopPingInterval();

            // 1008 is a permanent server-side policy rejection (room full,
            // invalid join, rate limit, ...). Reconnecting would only repeat
            // the rejection, so report it and stop retrying.
            const permanent = event.code === 1008;

            if (permanent) {
                this.permanentClose = true;
            }

            this.dispatchEvent(
                new CustomEvent("close", {
                    detail: {
                        code: event.code,
                        reason: event.reason,
                        permanent,
                    },
                }),
            );

            if (!this.manualClose && !permanent) {
                this.scheduleReconnect();
            }
        });

        this.socket.addEventListener("error", (event) => {
            this.dispatchEvent(
                new CustomEvent("error", {
                    detail: { event },
                }),
            );
        });
    }

    send(message) {
        // M4: encode for the negotiated codec. Only `input` is binary-encoded;
        // all other messages stay JSON.
        const data = encodeClientMessage(message, this.codec);

        // A message is only "accepted" when it either reaches the socket now or
        // is placed on a queue that will actually be flushed later. After a
        // manual disconnect or a permanent rejection the queue is never
        // flushed, so reporting success there would silently lose the message.
        if (this.manualClose || this.permanentClose) {
            return false;
        }

        // Count sent bytes (payload only).
        const sentBytes = payloadBytes(data);

        if (this.socket?.readyState === WebSocket.OPEN) {
            this.bytesSent += sentBytes;
            this.bytesSentLastSecond += sentBytes;
            this.socket.send(data);
            return true;
        }

        // Not open: the message is only useful if something will flush it.
        // A CLOSED/CLOSING socket is replaced by connect(); a CONNECTING or
        // missing socket is flushed by the pending "open" handler.
        const willFlush =
            !this.socket ||
            this.socket.readyState === WebSocket.CONNECTING ||
            this.socket.readyState === WebSocket.CLOSED;

        if (!willFlush) {
            return false;
        }

        // Queued messages are counted by flushQueue() when they are actually
        // written, so they are not counted here.
        this.sendQueue.push(data);

        if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
            this.connect();
        }

        return true;
    }

    flushQueue() {
        while (
            this.sendQueue.length > 0 &&
            this.socket?.readyState === WebSocket.OPEN
        ) {
            const data = this.sendQueue.shift();
            const sentBytes = payloadBytes(data);
            this.bytesSent += sentBytes;
            this.bytesSentLastSecond += sentBytes;
            this.socket.send(data);
        }
    }

    startPingInterval() {
        if (this.pingInterval !== null) return;

        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, 1000); // Send ping every second
    }

    stopPingInterval() {
        if (this.pingInterval !== null) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.pendingPing = null;
    }

    sendPing() {
        if (this.socket?.readyState !== WebSocket.OPEN) return;
        if (this.pendingPing !== null) return; // Wait for previous pong

        const timestamp = performance.now();
        const seq = ++this.pingSeq;

        this.pendingPing = { timestamp, seq };

        this.send({
            type: "ping",
            timestamp,
            seq,
        });
    }

    handlePong(message) {
        if (!this.pendingPing) return;
        if (message.seq !== this.pendingPing.seq) return; // Stale pong

        const now = performance.now();
        const rtt = now - this.pendingPing.timestamp;

        this.currentRtt = rtt;
        this.lastRttUpdate = now;
        this.pendingPing = null;
    }

    getRtt() {
        // Return null if RTT is stale (no update for 5 seconds)
        if (this.currentRtt === null) return null;
        if (performance.now() - this.lastRttUpdate > 5000) return null;
        return this.currentRtt;
    }

    getBytesPerSecond() {
        const now = performance.now();
        const elapsed = (now - this.lastByteCountReset) / 1000;

        if (elapsed >= 1) {
            // Reset counters
            this.bytesSentLastSecond = 0;
            this.bytesReceivedLastSecond = 0;
            this.lastByteCountReset = now;
        }

        return {
            sent: this.bytesSentLastSecond,
            received: this.bytesReceivedLastSecond,
        };
    }

    getTotalBytes() {
        return {
            sent: this.bytesSent,
            received: this.bytesReceived,
        };
    }

    scheduleReconnect() {
        if (
            this.reconnectTimer !== null ||
            this.manualClose ||
            this.permanentClose
        ) {
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
        this.stopPingInterval();

        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.sendQueue = [];

        if (this.socket) {
            this.socket.close(1000, "Client disconnected");
            this.socket = null;
        }
    }
}
