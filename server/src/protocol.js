
export const MAX_MESSAGE_SIZE = 16 * 1024;

export class ProtocolError extends Error {
    constructor(message, closeCode = 1008) {
        super(message);
        this.name = 'ProtocolError';
        this.closeCode = closeCode;
    }
}

export function parseClientMessage(data) {
    const buffer = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);

    if (buffer.length > MAX_MESSAGE_SIZE) {
        throw new ProtocolError('Message too large', 1009);
    }

    let message;

    try {
        message = JSON.parse(buffer.toString('utf-8'));
    } catch {
        throw new ProtocolError('Invalid JSON');
    }

    if (
        !message ||
        typeof message !== 'object' ||
        Array.isArray(message) ||
        typeof message.type !== 'string'
    ) {
        throw new ProtocolError('Invalid message structure');
    }

    switch (message.type) {
        case 'join':
            if (
                typeof message.roomId !== 'string' ||
                !message.roomId.trim() ||
                message.roomId.length > 64 ||
                typeof message.playerName !== 'string' ||
                !message.playerName.trim() ||
                message.playerName.length > 32
            ) {
                throw new ProtocolError('Invalid join message');
            }

            // Optional transport codec negotiation (M4). Defaults to JSON so
            // older clients keep working unchanged.
            let codec = 'json';
            if (message.codec !== undefined) {
                if (message.codec !== 'json' && message.codec !== 'binary') {
                    throw new ProtocolError('Invalid codec');
                }
                codec = message.codec;
            }

            return {
                type: 'join',
                roomId: message.roomId.trim(),
                playerName: message.playerName.trim(),
                codec,
            };

        case 'chat':
            if (
                typeof message.message !== 'string' ||
                !message.message.trim() ||
                message.message.length > 1000
            ) {
                throw new ProtocolError('Invalid chat message');
            }

            return {
                type: 'chat',
                message: message.message.trim(),
            };

        case 'leave':
            return { type: 'leave' };

        case 'ping':
            if (
                typeof message.timestamp !== 'number' ||
                !Number.isFinite(message.timestamp) ||
                message.timestamp < 0 ||
                typeof message.seq !== 'number' ||
                !Number.isInteger(message.seq) ||
                message.seq < 0
            ) {
                throw new ProtocolError('Invalid ping message');
            }

            return {
                type: 'ping',
                timestamp: message.timestamp,
                seq: message.seq,
            };

        case 'input':
            if (
                typeof message.seq !== 'number' ||
                !Number.isInteger(message.seq) ||
                message.seq < 0
            ) {
                throw new ProtocolError('Invalid input seq');
            }

            return {
                type: 'input',
                seq: message.seq,
                tick: message.tick,
                thrust: message.thrust,
                turnLeft: message.turnLeft,
                turnRight: message.turnRight,
                fire: message.fire,
                switchWeapon: message.switchWeapon,
                clientBulletId: message.clientBulletId,
            };

        default:
            throw new ProtocolError('Unknown message type');
    }
}
