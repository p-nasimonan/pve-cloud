#!/usr/bin/env node
import { spawn } from "node:child_process";

function run(cmd, args) {
  // shell: false avoids escaping issues and cross-platform inconsistencies
  const proc = spawn(cmd, args, {
    stdio: "inherit",
    shell: false,
  });
  proc.on("error", (err) => console.error(`[dev] process error: ${err.message}`));
  return proc;
}

console.log("[dev] Starting applications...");
const proc = run("pnpm", ["run", "--parallel", "--filter", "./apps/*", "dev"]);

// Forward termination signals to the child process
process.on("SIGINT", () => {
    try { proc.kill("SIGINT"); } catch {}
    process.exit(0);
});
process.on("SIGTERM", () => {
    try { proc.kill("SIGTERM"); } catch {}
    process.exit(0);
});
