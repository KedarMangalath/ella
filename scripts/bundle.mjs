#!/usr/bin/env node
/**
 * Bundle ELLA into a single self-contained JS file using esbuild.
 * Usage: node scripts/bundle.mjs
 * Output: dist/ella.js (run with: node dist/ella.js)
 *
 * For a true single binary (no node required):
 *   npx pkg dist/ella.js --target node22 --output dist/ella-win.exe
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "dist");

mkdirSync(OUT, { recursive: true });

console.log("\x1b[35m▶ bundling ella CLI\x1b[0m");

try {
  execSync(
    [
      "npx esbuild",
      "packages/cli/src/main.tsx",
      "--bundle",
      "--platform=node",
      "--target=node22",
      "--format=esm",
      "--outfile=dist/ella.js",
      "--banner:js=#!/usr/bin/env node",
      // Externalize native modules that can't be bundled
      "--external:fsevents",
      "--external:cpu-features",
      "--external:canvas",
      // Keep these external too since they're large and optional
      "--external:@anthropic-ai/sdk",
      "--external:openai",
      "--external:@google/generative-ai",
    ].join(" "),
    { cwd: ROOT, stdio: "inherit" },
  );
  console.log("\x1b[32m✓ bundled to dist/ella.js\x1b[0m");
  console.log("Run: node dist/ella.js");
  console.log("\nFor a standalone binary (requires pkg):");
  console.log("  npx pkg dist/ella.js --target node22 --output dist/ella");
} catch (err) {
  console.error("\x1b[31m✖ bundle failed — install esbuild first:\x1b[0m");
  console.error("  npm install --save-dev esbuild");
  process.exit(1);
}
