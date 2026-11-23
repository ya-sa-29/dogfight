import { IncomingMessage } from "http";

export function readJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];

        const MAX_BODY_SIZE = 16 * 1024;
        let receivedSize = 0;
        let tooLarge = false;

        req.on('data', (chunk: Buffer) => {
            if (tooLarge) return;

            receivedSize += chunk.length;

            if (receivedSize > MAX_BODY_SIZE) {
                tooLarge = true;
                reject(new Error('Request body too large'));
                return;
            }

            chunks.push(chunk);
        });

        req.on('end', () => {
            if (tooLarge) return;

            try {
                const body = Buffer.concat(chunks).toString('utf-8');
                resolve(JSON.parse(body));
            } catch {
                reject(new Error('Invalid JSON'));
            }
        });

        req.on('error', (error: Error) => {
            reject(error);
        });
    });
}