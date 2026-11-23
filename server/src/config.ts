import { z } from "zod";

/**
 * Server configuration schema with defaults.
 * Validated at startup; throws on invalid values.
 */
const ServerConfigSchema = z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    logDir: z.string().min(1).default("./logs"),
});

type ServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * Parse and validate server configuration from environment.
 * @returns Validated server configuration with defaults applied.
 */
function parseConfig(): ServerConfig {
    const raw = {
        port: process.env["PORT"],
        logDir: process.env["LOG_DIR"],
    };

    const result = ServerConfigSchema.safeParse(raw);
    if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(`Invalid server configuration: ${issues}`);
    }
    return result.data;
}

export const config = Object.freeze(parseConfig());

export type { ServerConfig };