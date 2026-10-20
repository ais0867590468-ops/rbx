#!/usr/bin/env node
/**
 * Cross-platform runner: `node scripts/run-mode.mjs <store|admin|full> <command> [args…]`
 * Sets APP_MODE, then runs the command through scripts/with-app-env.mjs.
 * Resolves binaries from node_modules/.bin so it works on Windows without PATH tweaks.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [rawMode, command, ...args] = process.argv.slice(2);
// "auto" = use the APP_MODE env var (store|admin), defaulting to store.
const mode =
  rawMode === "auto"
    ? ["store", "admin", "full"].includes(process.env.APP_MODE ?? "")
      ? process.env.APP_MODE
      : "store"
    : rawMode;
if (!["store", "admin", "full"].includes(mode) || !command) {
  console.error("usage: node scripts/run-mode.mjs <store|admin|full> <command> [args…]");
  process.exit(2);
}

const env = { ...process.env, APP_MODE: mode };
let bin = command;
let binArgs = args;
if (command === "vite") {
  bin = process.execPath;
  binArgs = [join(root, "node_modules", "vite", "bin", "vite.js"), ...args];
} else if (command === "tsc") {
  bin = process.execPath;
  binArgs = [join(root, "node_modules", "typescript", "bin", "tsc"), ...args];
}
if (command !== "vite" && command !== "tsc" && existsSync(join(root, "node_modules", ".bin", command))) {
  bin = join(root, "node_modules", ".bin", command);
}

const child = spawn(process.execPath, [join(root, "scripts", "with-app-env.mjs"), bin, ...binArgs], {
  stdio: "inherit",
  env,
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 1));
