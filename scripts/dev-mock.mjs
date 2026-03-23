#!/usr/bin/env node
/**
 * Development script: starts mock Proxmox server, waits for it to be ready,
 * then starts API + Web in parallel.
 *
 * Usage: node scripts/dev-mock.mjs
 *        (called via `pnpm dev:mock` from root)
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENV_MOCK_PATH = resolve(ROOT, ".env.mock");

// ── Load .env.mock ────────────────────────────────────────────────────────────

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf8");
  return Object.fromEntries(
    content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      }),
  );
}

const mockEnv = loadEnvFile(ENV_MOCK_PATH);
const MOCK_PORT = mockEnv.MOCK_PVE_PORT ?? "18006";

// ── Process management ────────────────────────────────────────────────────────

const children = [];

function run(cmd, args, extraEnv = {}) {
  const proc = spawn(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...mockEnv, ...extraEnv },
    shell: false,
  });
  proc.on("error", (err) =>
    console.error(`[dev-mock] process error: ${err.message}`),
  );
  children.push(proc);
  return proc;
}

function killAll(signal = "SIGTERM") {
  for (const proc of children) {
    try {
      proc.kill(signal);
    } catch {
      // already dead
    }
  }
}

process.on("SIGINT", () => {
  console.log("\n[dev-mock] Shutting down...");
  killAll("SIGTERM");
  setTimeout(() => process.exit(0), 500);
});
process.on("SIGTERM", () => {
  killAll("SIGTERM");
  process.exit(0);
});

// ── Wait for mock server ──────────────────────────────────────────────────────

async function waitForMock(maxAttempts = 30, intervalMs = 300) {
  const url = `http://localhost:${MOCK_PORT}/api2/json/version`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `[dev-mock] Mock server did not respond on port ${MOCK_PORT} after ${(maxAttempts * intervalMs) / 1000}s`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`[dev-mock] Starting mock Proxmox VE on port ${MOCK_PORT}...`);
run("pnpm", ["--filter", "@pve-cloud/api", "mock"], {
  MOCK_PVE_PORT: MOCK_PORT,
});

await waitForMock();
console.log("[dev-mock] Mock ready. Starting API and Web...");

run("pnpm", ["--filter", "@pve-cloud/api", "dev"], {
  PVE_HOST: "localhost",
  PVE_PORT: MOCK_PORT,
  PVE_ALLOW_INSECURE: "true",
});

run("pnpm", ["--filter", "@pve-cloud/web", "dev"]);
