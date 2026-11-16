import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';

import { getMimeType } from './mimeTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIST_DIR = path.resolve(__dirname, '../../client/dist');

export async function resolveStaticFile(urlPath) {
    let decodedPath;

    try {
        decodedPath = decodeURIComponent(urlPath);
    } catch {
        return null;
    }

    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.slice(1);

    const filePath = path.resolve(DIST_DIR, relativePath);

    if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) {
        return null;
    }

    try {
        const fileInfo = await stat(filePath);

        if (!fileInfo.isFile()) {
            return null;
        }

        return {
            filePath,
            contentType: getMimeType(path.extname(filePath).toLowerCase()),
        };
    } catch {
        return null;
    }
}