import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOMS_FILE = path.resolve(__dirname, '../data/rooms.json');

export async function getRooms() {
    const content = await readFile(ROOMS_FILE, 'utf-8');
    const data = JSON.parse(content);

    return data.rooms;
}

export async function saveRooms(rooms) {
    const content = JSON.stringify({ rooms }, null, 2);

    await writeFile(ROOMS_FILE, content, 'utf-8');
}