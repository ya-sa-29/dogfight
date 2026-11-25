import type { WebSocket } from "ws";
import { Match } from './match.js';

export class RoomManager {
    matches: Map<string, Match>;

    constructor() {
        this.matches = new Map();
    }

    createMatch(id: string, roomConfig: RoomConfig, options: { sendFn?: (socket: WebSocket, message: unknown) => void } = {}): Match | null {
        if (this.matches.has(id)) {
            return null;
        }

        const match = new Match(id, roomConfig, options);

        match.on('empty', () => {
            this.deleteMatch(id);
        });

        this.matches.set(id, match);

        return match;
    }

    getMatch(id: string): Match | null {
        return this.matches.get(id) ?? null;
    }

    deleteMatch(id: string): boolean {
        const match = this.matches.get(id);

        if (!match || match.players.size > 0) {
            return false;
        }

        this.matches.delete(id);

        return true;
    }

    getAllMatches(): Match[] {
        return Array.from(this.matches.values());
    }
}

export const roomManager = new RoomManager();

interface RoomConfig {
    width: number;
    height: number;
    asteroidCount: number;
}