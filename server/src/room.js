
import { EventEmitter } from "node:events";
import { createMatchLog } from "./matchlog.js";
import { Match } from "./match.js";

export class Room extends EventEmitter {
    constructor(id, config) {
        super();

        this.id = id;
        this.config = config;
        this.players = new Map();
        this.matchLog = createMatchLog(id);
        this.match = new Match(this);

        this.on("event", (event) => {
            this.matchLog.write(event);
        });
    }

    join(player) {
        if (this.players.has(player.id)) {
            return false;
        }

        this.players.set(player.id, player);
        this.match.addPlayer(player);

        this.emit("join", player);
        this.emit("event", {
            type: "join",
            playerId: player.id,
            playerName: player.name,
        });

        return true;
    }

    leave(playerId) {
        const player = this.players.get(playerId);

        if (!player) {
            return false;
        }

        this.players.delete(playerId);
        this.match.removePlayer(playerId);

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

    chat(playerId, message) {
        const player = this.players.get(playerId);

        if (!player) {
            return false;
        }

        const chatMessage = {
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
