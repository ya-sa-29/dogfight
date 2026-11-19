export function encodeJsonMessage(message) {
    return JSON.stringify(message);
}

export function decodeJsonMessage(data) {
    if (typeof data !== "string") {
        throw new TypeError("JSON message must be a string");
    }

    try {
        return JSON.parse(data);
    } catch {
        throw new Error("Invalid JSON");
    }
}