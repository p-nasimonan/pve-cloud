import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcrypt";
import { ProxmoxClient } from "../proxmox/client.js";
import type { AppState } from "../state.js";

const setupSchema = z.object({
  proxmox: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(8006),
    tokenId: z.string().min(1),
    tokenSecret: z.string().min(1),
    allowInsecure: z.boolean().default(false),
  }),
  admin: z.object({
    username: z.string().min(1).max(64),
    password: z.string().min(8),
  }),
});

export function setupRoutes(state: AppState) {
  const app = new Hono();

  /** Check if initial setup is needed */
  app.get("/status", (c) => {
    return c.json({
      status: state.proxmoxClient ? "configured" : "unconfigured",
      hasAdmin: state.adminUsername !== null,
      proxmoxConnected: state.proxmoxClient !== null,
    });
  });

  /** Perform initial setup: connect to Proxmox + create admin */
  app.post(
    "/initialize",
    zValidator("json", setupSchema),
    async (c) => {
      // Block if already configured
      if (state.proxmoxClient && state.adminUsername) {
        return c.json({ error: "Already configured" }, 409);
      }

      const body = c.req.valid("json");

      // Test Proxmox connection
      const client = new ProxmoxClient(body.proxmox);
      try {
        const version = await client.getVersion();
        state.proxmoxClient = client;
        state.proxmoxConfig = body.proxmox;
        state.proxmoxVersion = version;
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Unknown connection error";
        return c.json({ error: `Proxmox connection failed: ${message}` }, 400);
      }

      // Create admin account
      const passwordHash = await bcrypt.hash(body.admin.password, 12);
      state.adminUsername = body.admin.username;
      state.adminPasswordHash = passwordHash;

      return c.json({
        status: "configured",
        proxmoxVersion: state.proxmoxVersion,
      });
    },
  );

  return app;
}
