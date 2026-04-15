#!/usr/bin/env node
import { spawn } from "node:child_process";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: "inherit",
      shell: false,
    });
    proc.on("error", (err) => {
      console.error(`[build] error: ${err.message}`);
      reject(err);
    });
    proc.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Command '${cmd} ${args.join(" ")}' exited with code ${code}`));
      else resolve();
    });
  });
}

async function main() {
  try {
    console.log("[build] Building packages...");
    await run("pnpm", ["run", "--filter", "./packages/*", "build"]);
    
    console.log("[build] Building apps...");
    await run("pnpm", ["run", "--filter", "./apps/*", "build"]);
    
    console.log("[build] Done.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
