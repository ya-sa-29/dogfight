
export class LobbyView {
    constructor(lobby) {
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
            </div>
        `;

        this.nameInput = this.element.querySelector("#player-name");
        this.roomSelect = this.element.querySelector("#room-select");
        this.description = this.element.querySelector("#room-description");
        this.error = this.element.querySelector("#lobby-error");
        this.joinButton = this.element.querySelector("#join-button");

        this.onRoomsUpdated = (event) => {
            this.renderRooms(event.detail.rooms);
        };

        this.onError = (event) => {
            this.showError(event.detail.error.message);
        };

        this.lobby.addEventListener("rooms-updated", this.onRoomsUpdated);
        this.lobby.addEventListener("error", this.onError);

        this.roomSelect.addEventListener("change", () => {
            this.lobby.selectedRoomId = this.roomSelect.value;
            this.updateDescription();
        });

        this.joinButton.addEventListener("click", () => {
            console.log("1. JOIN BUTTON CLICKED");

            try {
                console.log("2. CALLING LOBBY.JOIN");

                this.lobby.join(
                    this.nameInput.value,
                    this.roomSelect.value,
                );

                console.log("3. LOBBY.JOIN COMPLETED");
                this.showError("");
            } catch (error) {
                console.error("JOIN ERROR:", error);
                this.showError(error.message);
            }
        });
    }

    renderRooms(rooms) {
        const selectedRoomId = this.lobby.selectedRoomId;

        this.roomSelect.replaceChildren();

        for (const room of rooms) {
            const option = document.createElement("option");
            option.value = room.id;
            option.textContent = room.name;
            this.roomSelect.append(option);
        }

        this.roomSelect.value = selectedRoomId ?? "";
        this.updateDescription();
    }

    updateDescription() {
        const room = this.lobby.rooms.find(
            (item) => item.id === this.roomSelect.value,
        );

        this.description.textContent = room
            ? `${room.description} (${room.width} × ${room.height}, ${room.asteroidCount} asteroids)`
            : "";
    }

    showError(message) {
        this.error.textContent = message;
    }

    show() {
        document.body.append(this.element);
    }

    hide() {
        this.element.remove();
    }

    destroy() {
        this.lobby.removeEventListener("rooms-updated", this.onRoomsUpdated);
        this.lobby.removeEventListener("error", this.onError);
        this.hide();
    }
}
