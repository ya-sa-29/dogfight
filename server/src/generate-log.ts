import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';

const TARGET_SIZE = 200 * 1024 * 1024;
const LINE_SIZE = 1024;

async function main(): Promise<void> {
    const directory = path.resolve(config.logDir);
    await mkdir(directory, { recursive: true });

    const filePath = path.join(
        directory,
        `synthetic-${Date.now()}.ndjson`,
    );

    const base = JSON.stringify({
        t: new Date().toISOString(),
        type: 'synthetic',
        message: '',
    }) + '\n';

    const line = Buffer.from(
        JSON.stringify({
            t: new Date().toISOString(),
            type: 'synthetic',
            message: 'x'.repeat(LINE_SIZE - Buffer.byteLength(base)),
        }) + '\n',
    );

    if (line.length !== LINE_SIZE) {
        throw new Error('Invalid line size');
    }

    async function* generate(): AsyncGenerator<Buffer, void, unknown> {
        const count = TARGET_SIZE / LINE_SIZE;

        for (let i = 0; i < count; i++) {
            yield line;
        }
    }

    await pipeline(
        Readable.from(generate()),
        createWriteStream(filePath),
    );

    console.log(`Generated: ${filePath}`);
    console.log(`Size: ${TARGET_SIZE / 1024 / 1024} MiB`);
}

main().catch(console.error);