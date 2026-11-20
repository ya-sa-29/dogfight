import { Match } from './match.js';

export class RoomManager {
    constructor() {
        this.matches = new Map();
    }

    createMatch(id, roomConfig) {
        if (this.matches.has(id)) {
            return null;
        }

        const match = new Match(id, roomConfig);

        match.on('empty', () => {
            this.deleteMatch(id);
        });

        this.matches.set(id, match);

        return match;
    }

    getMatch(id) {
        return this.matches.get(id) ?? null;
    }

    deleteMatch(id) {
        const match = this.matches.get(id);

        if (!match || match.players.size > 0) {
            return false;
        }

        this.matches.delete(id);

        return true;
    }

    getAllMatches() {
        return Array.from(this.matches.values());
    }
}

export const roomManager = new RoomManager();