import {
    encodeClientMessage,
    decodeServerFrame,
    normalizeClientCodec,
    ClientCodec,
} from "./wire.js";

/**
 * Return the payload size in bytes for byte accounting. Handles the JSON string
 * path and the M4 binary ArrayBuffer path.
 */
function payloadBytes(data: string | ArrayBuffer | Uint8Array | Blob): number {
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
 * @param baseUrl - Configured endpoint (e.g. "/ws" or "/ws?latency=100")
 * @param pageUrl - Current page URL (window.location.href)
 * @param protocol - WebSocket protocol ("ws:" or "wss:")
 * @returns URL object for the WebSocket connection
 */
export function buildSocketUrl(
    baseUrl: string,
    pageUrl: string,
    protocol: string,
): URL {
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

interface PendingPing {
    readonly timestamp: number;
    readonly seq: number;
}

interface ConnectionConfig {
    readonly url?: string;
    readonly reconnectDelay?: number;
    readonly maxReconnectDelay?: number;
    readonly codec?: string;
}

/**
 * WebSocket connection manager with automatic reconnection, RTT measurement,
 * byte counting, and M4 codec negotiation.
 * Extends EventTarget to use the standard DOM event API.
 */
export class Connection extends EventTarget {
    public readonly url: string;
    public readonly reconnectDelay: number;
    public readonly maxReconnectDelay: number;
    public readonly codec: ClientCodec;

    private socket: WebSocket | null = null;
    private readonly sendQueue: (string | ArrayBuffer)[] = [];
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private manualClose = false;
    private permanentClose = false;

    // RTT measurement
    private pingInterval: ReturnType<typeof setInterval> | null = null;
    private pendingPing: PendingPing | null = null;
    private pingSeq = 0;
    private currentRtt: number | null = null;
    private lastRttUpdate = 0;

    // Byte counters (payload bytes, UTF-8)
    private bytesSent = 0;
    private bytesReceived = 0;
    private bytesSentLastSecond = 0;
    private bytesReceivedLastSecond = 0;
    private lastByteCountReset = performance.now();

    constructor(config: ConnectionConfig = {}) {
        super();

        this.url = config.url ?? "/ws";
        this.reconnectDelay = config.reconnectDelay ?? 500;
        this.maxReconnectDelay = config.maxReconnectDelay ?? 30000;
        // M4: data-plane transport codec ("json" | "binary"). Control-plane
        // messages always travel as JSON; only `input` is binary-encoded.
        this.codec = normalizeClientCodec(config.codec ?? "json");
    }

    connect(): void {
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

        this.socket.addEventListener("message", (event: MessageEvent) => {
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

            let message: unknown;

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

            if (!message || typeof message !== "object") {
                return;
            }

            const msg = message as Record<string, unknown>;
            const msgType = msg["type"];

            if (typeof msgType !== "string") {
                return;
            }

            // Handle pong for RTT measurement
            if (msgType === "pong") {
                this.handlePong(msg as { seq: number; timestamp?: number });
                return; // Don't dispatch pong as game event
            }

            this.dispatchEvent(
                new CustomEvent(msgType, {
                    detail: msg,
                }),
            );

            this.dispatchEvent(
                new CustomEvent("message", {
                    detail: msg,
                }),
            );
        });

        this.socket.addEventListener("close", (event: CloseEvent) => {
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

        this.socket.addEventListener("error", (event: Event) => {
            this.dispatchEvent(
                new CustomEvent("error", {
                    detail: { event },
                }),
            );
        });
    }

    send(message: unknown): boolean {
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

    flushQueue(): void {
        while (
            this.sendQueue.length > 0 &&
            this.socket?.readyState === WebSocket.OPEN
        ) {
            const data = this.sendQueue.shift();
            if (!data) continue;
            const sentBytes = payloadBytes(data);
            this.bytesSent += sentBytes;
            this.bytesSentLastSecond += sentBytes;
            this.socket.send(data);
        }
    }

    startPingInterval(): void {
        if (this.pingInterval !== null) return;

        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, 1000); // Send ping every second
    }

    stopPingInterval(): void {
        if (this.pingInterval !== null) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.pendingPing = null;
    }

    sendPing(): void {
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

    handlePong(message: { seq: number; timestamp?: number }): void {
        if (!this.pendingPing) return;
        if (message.seq !== this.pendingPing.seq) return; // Stale pong

        const now = performance.now();
        const rtt = now - this.pendingPing.timestamp;

        this.currentRtt = rtt;
        this.lastRttUpdate = now;
        this.pendingPing = null;
    }

    getRtt(): number | null {
        // Return null if RTT is stale (no update for 5 seconds)
        if (this.currentRtt === null) return null;
        if (performance.now() - this.lastRttUpdate > 5000) return null;
        return this.currentRtt;
    }

    getBytesPerSecond(): { sent: number; received: number } {
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

    getTotalBytes(): { sent: number; received: number } {
        return {
            sent: this.bytesSent,
            received: this.bytesReceived,
        };
    }

    scheduleReconnect(): void {
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

    disconnect(): void {
        this.manualClose = true;
        this.stopPingInterval();

        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.sendQueue.length = 0;

        if (this.socket) {
            this.socket.close(1000, "Client disconnected");
            this.socket = null;
        }
    }

    // Type-safe event listener helpers (wrappers around EventTarget methods)
    on<K extends string>(
        type: K,
        listener: (event: Event) => void,
        options?: boolean | AddEventListenerOptions,
    ): void {
        this.addEventListener(type, listener as EventListener, options);
    }

    off<K extends string>(
        type: K,
        listener: (event: Event) => void,
        options?: boolean | EventListenerOptions,
    ): void {
        this.removeEventListener(type, listener as EventListener, options);
    }
}
