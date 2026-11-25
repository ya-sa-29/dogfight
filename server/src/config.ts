import { z } from "zod";

/**
 * Server configuration schema with defaults.
 * Validated at startup; throws on invalid values.
 */
const ServerConfigSchema = z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    nodeEnv: z
        .enum(["development", "production", "test"])
        .default("development"),
    logLevel: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),
    logDir: z.string().min(1).default("./logs"),
    allowedOrigins: z.string().default("*"),
    maxConnectionsPerIp: z.coerce.number().int().min(1).default(50),
    maxRooms: z.coerce.number().int().min(1).default(100),
    maxPlayersPerRoom: z.coerce.number().int().min(1).default(8),
});

type ServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * Parse and validate server configuration from environment.
 * @returns Validated server configuration with defaults applied.
 */
function parseConfig(): ServerConfig {
    const raw = {
        port: process.env["PORT"],
        nodeEnv: process.env["NODE_ENV"],
        logLevel: process.env["LOG_LEVEL"],
        logDir: process.env["LOG_DIR"],
        allowedOrigins: process.env["ALLOWED_ORIGINS"],
        maxConnectionsPerIp: process.env["MAX_CONNECTIONS_PER_IP"],
        maxRooms: process.env["MAX_ROOMS"],
        maxPlayersPerRoom: process.env["MAX_PLAYERS_PER_ROOM"],
    };

    const result = ServerConfigSchema.safeParse(raw);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
        throw new Error(`Invalid server configuration: ${issues}`);
    }
    return result.data;
}

export const config = Object.freeze(parseConfig());

export type { ServerConfig };

export function parseAllowedOrigins(value: string): string[] {
    return value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
}

export function isOriginAllowed(origin: string | null): boolean {
    const allowed = parseAllowedOrigins(config.allowedOrigins);

    if (allowed.length === 0) {
        return false;
    }

    if (allowed.includes("*")) {
        return true;
    }

    if (origin === null) {
        return false;
    }

    return allowed.includes(origin);
}
