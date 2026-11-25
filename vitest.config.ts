import { defineConfig } from "vitest/config";
import path from "node:path";

const sharedSrc = path
    .resolve(__dirname, "shared/index.ts")
    .replace(/\\/g, "/");

export default defineConfig({
    test: {
        include: [
            "shared/test/**/*.test.ts",
            "server/test/**/*.test.ts",
            "client/test/**/*.test.ts",
        ],
        exclude: ["client/test/e2e/**"],
        coverage: {
            enabled: true,
            reporter: ["text", "json"],
            include: [
                "shared/sim/**/*.ts",
                "shared/codec/**/*.ts",
                "shared/protocol/schemas.ts",
                "shared/rng/mulberry32.ts",
            ],
            exclude: [
                "shared/sim/**/*.js",
                "shared/codec/**/*.js",
                "shared/protocol/schemas.js",
                "shared/rng/mulberry32.js",
                "shared/dist/**",
                "shared/index.ts",
                "shared/index.js",
            ],
            all: false,
        },
    },
    resolve: {
        alias: {
            "@dogfight/shared": sharedSrc,
        },
        extensions: [".ts", ".mjs", ".js", ".json"],
    },
});
