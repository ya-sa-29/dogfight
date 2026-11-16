
import { PassThrough, Transform } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';

export function createMatchLog(roomId) {
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();

    const directory = path.resolve(config.logDir);
    const filePath = path.join(
        directory,
        `${safeRoomId}-${timestamp}.ndjson`,
    );

    const source = new PassThrough({ objectMode: true });

    const formatter = new Transform({
        writableObjectMode: true,

        transform(event, encoding, callback) {
            callback(null, JSON.stringify(event) + '\n');
        },
    });

    const destination = createWriteStream(filePath);

    const ready = mkdir(directory, { recursive: true })
        .then(() => pipeline(source, formatter, destination))
        .catch((error) => {
            console.error('Match log pipeline error:', error);
        });

    return {
        write(event) {
            source.write({
                t: new Date().toISOString(),
                ...event,
            });
        },

        async close() {
            source.end();
            await ready;
        },
    };
}
