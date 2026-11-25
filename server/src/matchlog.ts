import { PassThrough, Transform } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';

export interface MatchLog {
    write(event: Record<string, unknown>): void;
    close(): Promise<void>;
}

export function createMatchLog(roomId: string): MatchLog {
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

        transform(event: Record<string, unknown>, _encoding: BufferEncoding, callback: (error?: Error | null, data?: string) => void) {
            callback(null, JSON.stringify(event) + '\n');
        },
    });

    const destination = createWriteStream(filePath);

    const ready = mkdir(directory, { recursive: true })
        .then(() => pipeline(source, formatter, destination))
        .catch((error: Error) => {
            console.error('Match log pipeline error:', error);
        });

    return {
        write(event: Record<string, unknown>) {
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