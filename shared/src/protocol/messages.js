export const CLIENT_MESSAGE_TYPES = Object.freeze({
    JOIN: "join",
    CHAT: "chat",
    INPUT: "input",
    PING: "ping",
    LEAVE: "leave",
});

export const SERVER_MESSAGE_TYPES = Object.freeze({
    JOINED: "joined",
    SNAPSHOT: "snapshot",
    PONG: "pong",
    CHAT: "chat",
    ROSTER: "roster",
});