import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcrypt";
import { ProxmoxClient } from "../proxmox/client.js";
import { getSession } from "../middleware/auth.js";
import type { AppState } from "../state.js";

const SESSION_COOKIE = "pve-cloud-session";
const COOKIE_OPTS = "Path=/; HttpOnly; SameSite=Strict; Max-Age=86400";

const adminSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8),
});

const proxmoxSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(8006),
  tokenId: z.string().min(1),
  tokenSecret: z.string().min(1),
  allowInsecure: z.boolean().default(false),
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

  /** Perform initial setup step 1: create admin */
  app.post(
    "/admin",
    zValidator("json", adminSchema),
    async (c) => {
      // Block if already configured
      if (state.adminUsername) {
        return c.json({ error: "Admin already configured" }, 409);
      }

      const body = c.req.valid("json");

      // Create admin account
      const passwordHash = await bcrypt.hash(body.password, 12);
      state.adminUsername = body.username;
      state.adminPasswordHash = passwordHash;

      // Log the user in automatically for SPA flow
      const token = crypto.randomUUID();
      state.sessions.set(token, { username: body.username, role: "admin", createdAt: Date.now() });
      c.header("Set-Cookie", `${SESSION_COOKIE}=${token}; ${COOKIE_OPTS}`);

      return c.json({
        ok: true,
        token,
        username: body.username,
        role: "admin",
      });
    },
  );

  /** Perform initial setup step 2: connect to Proxmox */
  app.post(
    "/proxmox",
    zValidator("json", proxmoxSchema),
    async (c) => {
      // Block if already configured
      if (state.proxmoxClient) {
        return c.json({ error: "Proxmox connection already configured" }, 409);
      }

      // Check auth manually because /api/setup bypasses standard middleware
      const session = getSession(c, state);
      if (!session || session.role !== "admin") {
        return c.json({ error: "Unauthorized. Please log in as admin." }, 401);
      }

      const body = c.req.valid("json");

      // Test Proxmox connection
      const client = new ProxmoxClient(body);
      try {
        const version = await client.getVersion();
        state.proxmoxClient = client;
        state.proxmoxConfig = body;
        state.proxmoxVersion = version;
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Unknown connection error";
        return c.json({ error: `Proxmox connection failed: ${message}` }, 400);
      }

      return c.json({
        status: "configured",
        proxmoxVersion: state.proxmoxVersion,
      });
    },
  );

  return app;
}
