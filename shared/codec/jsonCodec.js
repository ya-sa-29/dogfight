export function encode(message) {
    return JSON.stringify(message);
}

export function decode(data) {
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}
