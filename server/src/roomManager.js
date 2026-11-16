
import { Room } from './room.js';

export class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    createRoom(id) {
        if (this.rooms.has(id)) {
            return null;
        }

        const room = new Room(id);

        room.on('empty', () => {
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
