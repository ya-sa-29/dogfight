
export class Connection extends EventTarget {
    constructor({ url = "/ws", reconnectDelay = 500, maxReconnectDelay = 30000 } = {}) {
        super();

        this.url = url;
        this.reconnectDelay = reconnectDelay;
        this.maxReconnectDelay = maxReconnectDelay;

        this.socket = null;
        this.sendQueue = [];
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.manualClose = false;
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

        this.socket = new WebSocket(socketUrl);

        this.socket.addEventListener("open", () => {
            this.reconnectAttempts = 0;

            this.dispatchEvent(new Event("open"));

            this.flushQueue();
        });

        this.socket.addEventListener("message", (event) => {
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

        this.socket.addEventListener("error", (event) => {
            this.dispatchEvent(
                new CustomEvent("error", {
                    detail: { event },
                }),
            );
        });
    }

    send(message) {
        const data = JSON.stringify(message);

        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(data);
            return;
        }

        this.sendQueue.push(data);

        if (
            !this.manualClose &&
            (!this.socket ||
                this.socket.readyState === WebSocket.CLOSED)
        ) {
            this.connect();
        }
    }

    flushQueue() {
        while (
            this.sendQueue.length > 0 &&
            this.socket?.readyState === WebSocket.OPEN
        ) {
            this.socket.send(this.sendQueue.shift());
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

        this.sendQueue = [];

        if (this.socket) {
            this.socket.close(1000, "Client disconnected");
            this.socket = null;
        }
    }
}
