import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVER_PORT = 3000;
const CLIENT_PORT = 4173;

let serverProcess = null;
let clientProcess = null;

function waitForPort(port, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tryConnect = () => {
            const req = createServer()
                .listen(port, "127.0.0.1")
                .once("listening", () => {
                    createServer().close();
                    resolve();
                })
                .once("error", () => {
                    if (Date.now() - start > timeoutMs) {
                        reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
                    } else {
                        setTimeout(tryConnect, 200);
                    }
                });
        };
        tryConnect();
    });
}

async function startServer() {
    const serverDist = path.join(ROOT, "server", "dist", "src", "index.js");
    serverProcess = spawn("node", [serverDist], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PORT: String(SERVER_PORT) },
    });

    serverProcess.stdout?.on("data", (data) => {
        process.stdout.write(`[server] ${data}`);
    });
    serverProcess.stderr?.on("data", (data) => {
        process.stderr.write(`[server-err] ${data}`);
    });

    await waitForPort(SERVER_PORT);
    console.log(`Server ready on port ${SERVER_PORT}`);
}

async function startClient() {
    clientProcess = spawn("npx", ["vite", "preview", "--port", String(CLIENT_PORT)], {
        cwd: path.join(ROOT, "client"),
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
    });

    clientProcess.stdout?.on("data", (data) => {
        process.stdout.write(`[client] ${data}`);
    });
    clientProcess.stderr?.on("data", (data) => {
        process.stderr.write(`[client-err] ${data}`);
    });

    await waitForPort(CLIENT_PORT);
    console.log(`Client ready on port ${CLIENT_PORT}`);
}

async function stopServers() {
    if (serverProcess) {
        serverProcess.kill("SIGTERM");
        serverProcess = null;
    }
    if (clientProcess) {
        clientProcess.kill("SIGTERM");
        clientProcess = null;
    }
}

async function main() {
    try {
        await startServer();
        await startClient();
        console.log("E2E servers ready");
    } catch (error) {
        await stopServers();
        console.error("Failed to start E2E servers:", error);
        process.exit(1);
    }

    process.on("SIGINT", async () => {
        await stopServers();
        process.exit(0);
    });
    process.on("SIGTERM", async () => {
        await stopServers();
        process.exit(0);
    });
}

main();
