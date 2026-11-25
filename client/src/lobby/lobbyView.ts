import { Lobby } from "./lobby.js";

export class LobbyView {
    private readonly lobby: Lobby;
    public readonly element: HTMLDivElement;
    private readonly nameInput: HTMLInputElement | null;
    private readonly roomSelect: HTMLSelectElement | null;
    private readonly description: HTMLElement | null;
    private readonly error: HTMLElement | null;
    private readonly joinButton: HTMLButtonElement | null;
    private readonly versionEl: HTMLElement | null;

    private readonly onRoomsUpdated: (
        event: CustomEvent<{ rooms: Lobby["rooms"] }>,
    ) => void;
    private readonly onError: (event: CustomEvent<{ error: Error }>) => void;

    constructor(lobby: Lobby) {
        this.lobby = lobby;
        this.element = document.createElement("div");

        this.element.innerHTML = `
            <div class="lobby-panel">
                <h1>Dogfight Arena</h1>
                <p>Choose your arena and join the battle.</p>

                <label for="player-name">Player name</label>
                <input
                    id="player-name"
                    type="text"
                    maxlength="20"
                    placeholder="Enter your name"
                    autocomplete="off"
                />

                <label for="room-select">Arena</label>
                <select id="room-select"></select>

                <p id="room-description"></p>
                <p id="lobby-error" role="alert"></p>

                <button id="join-button" type="button">Join</button>
                <p id="lobby-version" style="font-size: 11px; color: #888; margin-top: 8px;"></p>
            </div>
        `;

        this.nameInput = this.element.querySelector("#player-name");
        this.roomSelect = this.element.querySelector("#room-select");
        this.description = this.element.querySelector("#room-description");
        this.error = this.element.querySelector("#lobby-error");
        this.joinButton = this.element.querySelector("#join-button");
        this.versionEl = this.element.querySelector("#lobby-version");

        this.onRoomsUpdated = (event) => {
            this.renderRooms(event.detail.rooms);
        };

        this.onError = (event) => {
            this.showError(event.detail.error.message);
        };

        this.lobby.on("rooms-updated", this.onRoomsUpdated);
        this.lobby.on("error", this.onError);

        this.roomSelect?.addEventListener("change", () => {
            this.lobby.selectedRoomId = this.roomSelect?.value ?? null;
            this.updateDescription();
        });

        this.joinButton?.addEventListener("click", () => {
            console.log("1. JOIN BUTTON CLICKED");

            try {
                console.log("2. CALLING LOBBY.JOIN");

                this.lobby.join(
                    this.nameInput?.value ?? "",
                    this.roomSelect?.value ?? "",
                );

                console.log("3. LOBBY.JOIN COMPLETED");
                this.showError("");
            } catch (error) {
                console.error("JOIN ERROR:", error);
                this.showError(
                    error instanceof Error ? error.message : String(error),
                );
            }
        });
    }

    private renderRooms(rooms: Lobby["rooms"]): void {
        const selectedRoomId = this.lobby.selectedRoomId;

        this.roomSelect?.replaceChildren();

        for (const room of rooms) {
            const option = document.createElement("option");
            option.value = room.id;
            option.textContent = room.name;
            this.roomSelect?.append(option);
        }

        this.roomSelect!.value = selectedRoomId ?? "";
        this.updateDescription();
    }

    private updateDescription(): void {
        const room = this.lobby.rooms.find(
            (item) => item.id === this.roomSelect?.value,
        );

        if (this.description) {
            this.description.textContent = room
                ? `${room.description} (${room.width} × ${room.height}, ${room.asteroidCount} asteroids)`
                : "";
        }
    }

    private showError(message: string): void {
        if (this.error) {
            this.error.textContent = message;
        }
    }

    setVersion(version: string): void {
        if (this.versionEl) {
            this.versionEl.textContent = `Version: ${version}`;
        }
    }

    show(): void {
        document.body.append(this.element);
    }

    hide(): void {
        this.element.remove();
    }

    destroy(): void {
        this.lobby.off("rooms-updated", this.onRoomsUpdated);
        this.lobby.off("error", this.onError);
        this.hide();
    }
}
