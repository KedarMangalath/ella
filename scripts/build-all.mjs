#!/usr/bin/env node
/**
 * Build all workspace packages in dependency order.
 * Usage: node scripts/build-all.mjs
 */
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ORDER = ["shared", "core", "mcp", "bridge", "tui", "cli"];

function build(pkg) {
  console.log(`\n\x1b[35m▶ building ${pkg}\x1b[0m`);
  execSync("npx tsc -p tsconfig.json", {
    cwd: resolve(ROOT, "packages", pkg),
    stdio: "inherit",
  });
  console.log(`\x1b[32m✓ ${pkg}\x1b[0m`);
}

for (const pkg of ORDER) {
  build(pkg);
}

console.log("\n\x1b[32m✦ All packages built\x1b[0m");
console.log(`Run: node packages/cli/dist/main.js`);
