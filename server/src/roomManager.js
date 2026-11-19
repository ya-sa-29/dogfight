
import { Room } from "./room.js";

export class RoomManager {
    constructor(roomConfigs = []) {
        this.rooms = new Map();
        this.roomConfigs = new Map(
            roomConfigs.map((config) => [config.id, config]),
        );
    }
    
    setRoomConfigs(roomConfigs = []) {
    this.roomConfigs = new Map(
        roomConfigs.map((config) => [config.id, config]),
    );
}

    addRoomConfig(config) {
        if (
            !config ||
            typeof config.id !== "string" ||
            !config.id.trim() ||
            this.roomConfigs.has(config.id)
        ) {
            return false;
        }

        this.roomConfigs.set(config.id, config);
        return true;
    }

    createRoom(id) {
        if (this.rooms.has(id)) {
            return null;
        }

        const config = this.roomConfigs.get(id);

        if (!config) {
            return null;
        }

        const room = new Room(id, config);

        room.on("empty", () => {
            this.deleteRoom(id);
        });

        this.rooms.set(id, room);

        return room;
    }

    getRoom(id) {
        return this.rooms.get(id) ?? null;
    }

    deleteRoom(id) {
        const room = this.rooms.get(id);

        if (!room || room.players.size > 0) {
            return false;
        }

        this.rooms.delete(id);
        return true;
    }
}
