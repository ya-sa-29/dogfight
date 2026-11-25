import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

async function importConfig(): Promise<typeof import("../src/config.js")> {
    return import("../src/config.js");
}

describe("ServerConfig defaults", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("loads sensible defaults when env vars are not set", async () => {
        const { config } = await importConfig();

        expect(typeof config.port).toBe("number");
        expect(config.port).toBe(3000);
        expect(typeof config.nodeEnv).toBe("string");
        expect(["development", "production", "test"]).toContain(
            config.nodeEnv,
        );
        expect(config.logLevel).toBe("info");
        expect(config.logDir).toBe("./logs");
        expect(config.allowedOrigins).toBe("*");
        expect(config.maxConnectionsPerIp).toBe(50);
        expect(config.maxRooms).toBe(100);
        expect(config.maxPlayersPerRoom).toBe(8);
    });
});

describe("ServerConfig custom environment values", () => {
    beforeEach(() => {
        vi.resetModules();
        process.env["PORT"] = "4000";
        process.env["NODE_ENV"] = "production";
        process.env["LOG_LEVEL"] = "debug";
        process.env["LOG_DIR"] = "/var/log/dogfight";
        process.env["ALLOWED_ORIGINS"] =
            "https://dogfight.example.com,https://app.dogfight.example.com";
        process.env["MAX_CONNECTIONS_PER_IP"] = "25";
        process.env["MAX_ROOMS"] = "50";
        process.env["MAX_PLAYERS_PER_ROOM"] = "4";
    });

    afterEach(() => {
        delete process.env["PORT"];
        delete process.env["NODE_ENV"];
        delete process.env["LOG_LEVEL"];
        delete process.env["LOG_DIR"];
        delete process.env["ALLOWED_ORIGINS"];
        delete process.env["MAX_CONNECTIONS_PER_IP"];
        delete process.env["MAX_ROOMS"];
        delete process.env["MAX_PLAYERS_PER_ROOM"];
    });

    test("applies custom environment values", async () => {
        const { config } = await importConfig();

        expect(config.port).toBe(4000);
        expect(config.nodeEnv).toBe("production");
        expect(config.logLevel).toBe("debug");
        expect(config.logDir).toBe("/var/log/dogfight");
        expect(config.allowedOrigins).toBe(
            "https://dogfight.example.com,https://app.dogfight.example.com",
        );
        expect(config.maxConnectionsPerIp).toBe(25);
        expect(config.maxRooms).toBe(50);
        expect(config.maxPlayersPerRoom).toBe(4);
    });
});

describe("ServerConfig validation rejects invalid values", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("rejects invalid port values", async () => {
        const originalPort = process.env["PORT"];

        const invalidPorts = ["0", "70000", "-1", "not-a-number"];

        for (const port of invalidPorts) {
            process.env["PORT"] = port;
            vi.resetModules();

            await expect(importConfig()).rejects.toThrow();

            if (originalPort === undefined) {
                delete process.env["PORT"];
            } else {
                process.env["PORT"] = originalPort;
            }
        }
    });

    test("rejects invalid log level", async () => {
        const originalLogLevel = process.env["LOG_LEVEL"];

        process.env["LOG_LEVEL"] = "verbose";
        vi.resetModules();

        await expect(importConfig()).rejects.toThrow();

        if (originalLogLevel === undefined) {
            delete process.env["LOG_LEVEL"];
        } else {
            process.env["LOG_LEVEL"] = originalLogLevel;
        }
    });

    test("rejects invalid nodeEnv", async () => {
        const originalNodeEnv = process.env["NODE_ENV"];

        process.env["NODE_ENV"] = "staging";
        vi.resetModules();

        await expect(importConfig()).rejects.toThrow();

        if (originalNodeEnv === undefined) {
            delete process.env["NODE_ENV"];
        } else {
            process.env["NODE_ENV"] = originalNodeEnv;
        }
    });
});

describe("parseAllowedOrigins", () => {
    beforeEach(() => {
        vi.resetModules();
        process.env["NODE_ENV"] = "test";
    });

    test("splits comma-separated origins and trims whitespace", async () => {
        const { parseAllowedOrigins } = await importConfig();

        const result = parseAllowedOrigins(
            "https://a.example.com, https://b.example.com ",
        );
        expect(result).toEqual([
            "https://a.example.com",
            "https://b.example.com",
        ]);
    });

    test("returns empty list for empty string", async () => {
        const { parseAllowedOrigins } = await importConfig();

        expect(parseAllowedOrigins("")).toEqual([]);
    });

    test("returns single-item list for single origin", async () => {
        const { parseAllowedOrigins } = await importConfig();

        expect(parseAllowedOrigins("https://example.com")).toEqual([
            "https://example.com",
        ]);
    });
});

describe("isOriginAllowed", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("allows all origins when ALLOWED_ORIGINS is *", async () => {
        process.env["ALLOWED_ORIGINS"] = "*";
        vi.resetModules();

        const { isOriginAllowed } = await importConfig();

        expect(isOriginAllowed("https://evil.example.com")).toBe(true);
        expect(isOriginAllowed(null)).toBe(true);
    });

    test("allows only listed origins when specific origins are configured", async () => {
        process.env["ALLOWED_ORIGINS"] =
            "https://dogfight.example.com,https://app.dogfight.example.com";
        vi.resetModules();

        const { isOriginAllowed } = await importConfig();

        expect(isOriginAllowed("https://dogfight.example.com")).toBe(true);
        expect(isOriginAllowed("https://app.dogfight.example.com")).toBe(true);
        expect(isOriginAllowed("https://evil.example.com")).toBe(false);
        expect(isOriginAllowed(null)).toBe(false);
    });

    test("rejects all origins when ALLOWED_ORIGINS is empty", async () => {
        process.env["ALLOWED_ORIGINS"] = "";
        vi.resetModules();

        const { isOriginAllowed } = await importConfig();

        expect(isOriginAllowed("https://any.example.com")).toBe(false);
        expect(isOriginAllowed(null)).toBe(false);
    });
});
