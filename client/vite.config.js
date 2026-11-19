
import { defineConfig } from "vite";

export default defineConfig({
    server: {
        host: "localhost",
        port: 5173,
        proxy: {
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
            "/ws": {
                target: "ws://localhost:3000",
                ws: true,
            },
            "/health": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
            "/replays": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
        },
    },
});
