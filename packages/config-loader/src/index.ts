import type { ProxmoxConnectionConfig } from "@pve-cloud/types";

export interface AppConfig {
  proxmox: ProxmoxConnectionConfig | null;
  admin: {
    username: string | null;
    passwordHash: string | null;
  };
  server: {
    port: number;
    host: string;
    corsOrigins: string[];
  };
  configPath: string;
}

/**
 * Load config from environment variables.
 * Returns null for proxmox connection if not configured yet (setup wizard needed).
 */
export function loadConfig(): AppConfig {
  const proxmoxHost = process.env["PVE_HOST"];
  const tokenId = process.env["PVE_TOKEN_ID"];
  const tokenSecret = process.env["PVE_TOKEN_SECRET"];

  const proxmox: ProxmoxConnectionConfig | null =
    proxmoxHost && tokenId && tokenSecret
      ? {
          host: proxmoxHost,
          port: Number(process.env["PVE_PORT"] ?? 8006),
          tokenId,
          tokenSecret,
          allowInsecure: process.env["PVE_ALLOW_INSECURE"] === "true",
        }
      : null;

  const corsOrigin = process.env["CORS_ORIGIN"];

  return {
    proxmox,
    admin: {
      username: process.env["ADMIN_USERNAME"] ?? null,
      passwordHash: process.env["ADMIN_PASSWORD_HASH"] ?? null,
    },
    server: {
      port: Number(process.env["PORT"] ?? 3001),
      host: process.env["HOST"] ?? "0.0.0.0",
      corsOrigins: corsOrigin
        ? corsOrigin.split(",").map((s) => s.trim())
        : ["http://localhost:4321"],
    },
    configPath: process.env["CONFIG_PATH"] ?? "./pve-cloud.config.json",
  };
}
