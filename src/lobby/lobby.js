
export class Lobby extends EventTarget {
    constructor({ refreshInterval = 5000 } = {}) {
        super();

        this.refreshInterval = refreshInterval;
        this.rooms = [];
        this.playerName = "";
        this.selectedRoomId = null;

        this.controller = null;
        this.refreshTimer = null;
    }

    async loadRooms(signal) {
        const response = await fetch("/api/rooms.json", {
            signal,
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to load rooms: HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data.rooms)) {
            throw new Error("Invalid rooms response");
        }

        this.rooms = data.rooms;

        if (!this.rooms.some((room) => room.id === this.selectedRoomId)) {
            this.selectedRoomId = this.rooms[0]?.id ?? null;
        }

        this.dispatchEvent(
            new CustomEvent("rooms-updated", {
                detail: { rooms: this.rooms },
            }),
        );

        return this.rooms;
    }

    async enter() {
        this.leave();

        this.controller = new AbortController();

        try {
            await this.loadRooms(this.controller.signal);
            this.startRefreshing();
        } catch (error) {
            if (error.name !== "AbortError") {
                this.dispatchEvent(
                    new CustomEvent("error", { detail: { error } }),
                );
            }
        }
    }

    startRefreshing() {
        this.refreshTimer = setInterval(async () => {
            if (!this.controller || this.controller.signal.aborted) return;

            try {
                await this.loadRooms(
                    AbortSignal.any([
                        this.controller.signal,
                        AbortSignal.timeout(3000),
                    ]),
                );
            } catch (error) {
                if (error.name !== "AbortError" && error.name !== "TimeoutError") {
                    this.dispatchEvent(
                        new CustomEvent("error", { detail: { error } }),
                    );
                }
            }
        }, this.refreshInterval);
    }

    join(playerName, roomId) {
        const name = playerName.trim();
        const room = this.rooms.find((item) => item.id === roomId);

        if (!name) throw new Error("Enter your player name");
        if (!room) throw new Error("Select a valid room");

        this.playerName = name;
        this.selectedRoomId = roomId;

        this.dispatchEvent(
            new CustomEvent("join", {
                detail: {
                    playerName: name,
                    room,
                },
            }),
        );
    }

    leave() {
        if (this.refreshTimer !== null) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        this.controller?.abort();
        this.controller = null;
    }
}
