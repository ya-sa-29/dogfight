const port = Number(process.env.PORT ?? 3000);
const logDir = process.env.LOG_DIR ?? './logs';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

if (!logDir.trim()) {
    throw new Error('LOG_DIR cannot be empty');
}

export const config = Object.freeze({
    port,
    logDir,
});