import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMessage, ProtocolError } from '../src/protocol.js';

describe('parseClientMessage - join', () => {
    test('valid join is parsed', () => {
        const result = parseClientMessage(JSON.stringify({
            type: 'join',
            roomId: 'arena1',
            playerName: 'Alice',
        }));
        assert.deepEqual(result, {
            type: 'join',
            roomId: 'arena1',
            playerName: 'Alice',
            codec: 'json',
        });
    });

    test('join with binary codec is negotiated', () => {
        const result = parseClientMessage(JSON.stringify({
            type: 'join',
            roomId: 'arena1',
            playerName: 'Alice',
            codec: 'binary',
        }));
        assert.equal(result.codec, 'binary');
    });

    test('join with invalid codec is rejected', () => {
        assert.throws(
            () =>
                parseClientMessage(
                    JSON.stringify({
                        type: 'join',
                        roomId: 'arena1',
                        playerName: 'Alice',
                        codec: 'xml',
                    }),
                ),
            ProtocolError,
        );
    });

    test('join with missing roomId is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'join', playerName: 'Alice' })),
            ProtocolError,
        );
    });

    test('join with missing playerName is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'join', roomId: 'arena1' })),
            ProtocolError,
        );
    });
});

describe('parseClientMessage - chat', () => {
    test('valid chat is parsed', () => {
        const result = parseClientMessage(JSON.stringify({
            type: 'chat',
            message: 'Hello world',
        }));
        assert.deepEqual(result, {
            type: 'chat',
            message: 'Hello world',
        });
    });

    test('chat with empty message is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'chat', message: '   ' })),
            ProtocolError,
        );
    });

    test('chat with missing message is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'chat' })),
            ProtocolError,
        );
    });
});

describe('parseClientMessage - leave', () => {
    test('valid leave is parsed', () => {
        const result = parseClientMessage(JSON.stringify({ type: 'leave' }));
        assert.deepEqual(result, { type: 'leave' });
    });
});

describe('parseClientMessage - ping', () => {
    test('valid ping is parsed', () => {
        const result = parseClientMessage(JSON.stringify({
            type: 'ping',
            timestamp: 1234.56,
            seq: 1,
        }));
        assert.deepEqual(result, {
            type: 'ping',
            timestamp: 1234.56,
            seq: 1,
        });
    });

    test('ping with seq 0 is parsed', () => {
        const result = parseClientMessage(JSON.stringify({
            type: 'ping',
            timestamp: 0,
            seq: 0,
        }));
        assert.deepEqual(result, {
            type: 'ping',
            timestamp: 0,
            seq: 0,
        });
    });

    test('ping with missing timestamp is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'ping', seq: 1 })),
            ProtocolError,
        );
    });

    test('ping with missing seq is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'ping', timestamp: 100 })),
            ProtocolError,
        );
    });

    test('ping with negative timestamp is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'ping', timestamp: -1, seq: 1 })),
            ProtocolError,
        );
    });

    test('ping with non-integer seq is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'ping', timestamp: 100, seq: 1.5 })),
            ProtocolError,
        );
    });

    test('ping with negative seq is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'ping', timestamp: 100, seq: -1 })),
            ProtocolError,
        );
    });

    test('ping with string timestamp is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'ping', timestamp: 'abc', seq: 1 })),
            ProtocolError,
        );
    });

    test('ping with Infinity timestamp is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'ping', timestamp: null, seq: 1 })),
            ProtocolError,
        );
    });
});

describe('parseClientMessage - input', () => {
    test('valid input is parsed', () => {
        const result = parseClientMessage(JSON.stringify({
            type: 'input',
            seq: 5,
            tick: 100,
            thrust: true,
            turnLeft: false,
            turnRight: true,
            fire: false,
            switchWeapon: false,
        }));
        assert.deepEqual(result, {
            type: 'input',
            seq: 5,
            tick: 100,
            thrust: true,
            turnLeft: false,
            turnRight: true,
            fire: false,
            switchWeapon: false,
            clientBulletId: undefined,
        });
    });

    test('input with seq 0 is parsed', () => {
        const result = parseClientMessage(JSON.stringify({
            type: 'input',
            seq: 0,
            tick: 0,
            thrust: false,
            turnLeft: false,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        }));
        assert.equal(result.type, 'input');
        assert.equal(result.seq, 0);
    });

    test('input with missing seq is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({
                type: 'input',
                tick: 100,
                thrust: true,
            })),
            ProtocolError,
        );
    });

    test('input with negative seq is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({
                type: 'input',
                seq: -1,
                tick: 100,
                thrust: true,
            })),
            ProtocolError,
        );
    });

    test('input with non-integer seq is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({
                type: 'input',
                seq: 1.5,
                tick: 100,
                thrust: true,
            })),
            ProtocolError,
        );
    });

    test('input with string seq is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({
                type: 'input',
                seq: 'abc',
                tick: 100,
                thrust: true,
            })),
            ProtocolError,
        );
    });
});

describe('parseClientMessage - unknown types', () => {
    test('unknown message type is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 'unknown' })),
            ProtocolError,
        );
    });

    test('missing type field is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ seq: 1 })),
            ProtocolError,
        );
    });

    test('non-string type is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify({ type: 123 })),
            ProtocolError,
        );
    });
});

describe('parseClientMessage - JSON safety', () => {
    test('invalid JSON is rejected', () => {
        assert.throws(
            () => parseClientMessage('not json'),
            ProtocolError,
        );
    });

    test('empty string is rejected', () => {
        assert.throws(
            () => parseClientMessage(''),
            ProtocolError,
        );
    });

    test('array is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify([1, 2, 3])),
            ProtocolError,
        );
    });

    test('null is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify(null)),
            ProtocolError,
        );
    });

    test('non-object is rejected', () => {
        assert.throws(
            () => parseClientMessage(JSON.stringify(42)),
            ProtocolError,
        );
    });
});

describe('parseClientMessage - Buffer input', () => {
    test('parses from Buffer', () => {
        const buf = Buffer.from(JSON.stringify({ type: 'leave' }));
        const result = parseClientMessage(buf);
        assert.deepEqual(result, { type: 'leave' });
    });

    test('parses ping from Buffer', () => {
        const buf = Buffer.from(JSON.stringify({
            type: 'ping',
            timestamp: 500,
            seq: 2,
        }));
        const result = parseClientMessage(buf);
        assert.deepEqual(result, {
            type: 'ping',
            timestamp: 500,
            seq: 2,
        });
    });

    test('parses input from Buffer', () => {
        const buf = Buffer.from(JSON.stringify({
            type: 'input',
            seq: 3,
            tick: 50,
            thrust: false,
            turnLeft: true,
            turnRight: false,
            fire: false,
            switchWeapon: false,
        }));
        const result = parseClientMessage(buf);
        assert.equal(result.type, 'input');
        assert.equal(result.seq, 3);
    });
});

describe('parseClientMessage - message size limit', () => {
    test('message exceeding MAX_MESSAGE_SIZE is rejected', () => {
        const largePayload = 'x'.repeat(16 * 1024 + 1);
        assert.throws(
            () => parseClientMessage(largePayload),
            (err) => err instanceof ProtocolError && err.closeCode === 1009,
        );
    });
});