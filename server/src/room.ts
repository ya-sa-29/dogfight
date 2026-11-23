import { EventEmitter } from "node:events";
import { createMatchLog, MatchLog } from "./matchlog.js";

interface Player {
    id: string;
    name: string;
}

interface ChatMessage {
    playerId: string;
    playerName: string;
    message: string;
    timestamp: string;
}

/** Event payload map for Room typed events. */
interface RoomEvents {
    join: [player: Player];
    leave: [player: Player];
    chat: [message: ChatMessage];
    event: [event: Record<string, unknown>];
    empty: [];
}

/**
 * Room manages a collection of players and emits typed lifecycle events.
 * Extends EventEmitter with a statically typed event map.
 */
export class Room extends EventEmitter<RoomEvents> {
    id: string;
    players: Map<string, Player>;
    matchLog: MatchLog;

    constructor(id: string) {
        super();

        this.id = id;
        this.players = new Map();
        this.matchLog = createMatchLog(id);

        this.on("event", (event: Record<string, unknown>) => {
            this.matchLog.write(event);
        });
    }

    join(player: Player): boolean {
        if (this.players.has(player.id)) {
            return false;
        }

        this.players.set(player.id, player);

        this.emit("join", player);
        this.emit("event", {
            type: "join",
            playerId: player.id,
            playerName: player.name,
        });

        return true;
    }

    leave(playerId: string): boolean {
        const player = this.players.get(playerId);

        if (!player) {
            return false;
        }

        this.players.delete(playerId);

        this.emit("leave", player);
        this.emit("event", {
            type: "leave",
            playerId: player.id,
            playerName: player.name,
        });

        if (this.players.size === 0) {
            this.emit("empty");
            this.matchLog.close();
        }

        return true;
    }

    chat(playerId: string, message: string): ChatMessage | false {
        const player = this.players.get(playerId);

        if (!player) {
            return false;
        }

        const chatMessage: ChatMessage = {
            playerId: player.id,
            playerName: player.name,
            message,
            timestamp: new Date().toISOString(),
        };

        this.emit("chat", chatMessage);
        this.emit("event", {
            type: "chat",
            ...chatMessage,
        });

        return chatMessage;
    }
}