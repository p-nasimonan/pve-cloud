import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import bcrypt from "bcrypt";
import { loadConfig } from "@pve-cloud/config-loader";
import { ProxmoxClient } from "./proxmox/client.js";
import { ConfigStore } from "./store/config-store.js";
import { createAppState } from "./state.js";
import { requireAuth, requireSetup } from "./middleware/auth.js";
import { setupRoutes } from "./routes/setup.js";
import { authRoutes } from "./routes/auth.js";
import { flavorRoutes } from "./routes/flavors.js";
import { templateRoutes } from "./routes/templates.js";
import { instanceRoutes } from "./routes/instances.js";

const config = loadConfig();
const state = createAppState();

// Initialize config store
state.configStore = new ConfigStore(config.configPath);

// If .env has Proxmox config, pre-initialize
if (config.proxmox) {
  const client = new ProxmoxClient(config.proxmox);
  try {
    const version = await client.getVersion();
    state.proxmoxClient = client;
    state.proxmoxConfig = config.proxmox;
    state.proxmoxVersion = version;
    console.log(`Connected to Proxmox VE ${version.version} (${version.release})`);
  } catch (e) {
    console.warn(
      "PVE_HOST is set but connection failed. Setup wizard will be shown.",
      e instanceof Error ? e.message : e,
    );
  }
}

// Pre-set admin credentials from env
if (config.admin.username) {
  const plainPassword = process.env["ADMIN_PASSWORD"];
  const hash =
    config.admin.passwordHash ??
    (plainPassword ? await bcrypt.hash(plainPassword, 10) : null);
  if (hash) {
    state.adminUsername = config.admin.username;
    state.adminPasswordHash = hash;
  }
}

const app = new Hono();

app.use("*", logger());
app.use("*", cors({ origin: config.server.corsOrigins, credentials: true }));
app.use("*", requireSetup(state));
app.use("*", requireAuth(state));

app.get("/api/health", (c) =>
  c.json({ ok: true, version: state.proxmoxVersion }),
);

app.route("/api/setup", setupRoutes(state));
app.route("/api/auth", authRoutes(state));
app.route("/api/flavors", flavorRoutes(state));
app.route("/api/templates", templateRoutes(state));
app.route("/api/instances", instanceRoutes(state));

const port = config.server.port;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`pve-cloud API running at http://localhost:${info.port}`);
});
