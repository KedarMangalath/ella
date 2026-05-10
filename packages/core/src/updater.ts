import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import { ellaHome } from "./config.js";

const PACKAGE_NAME = "ella";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

interface UpdateCache {
  checkedAt: string;
  latestVersion: string;
  currentVersion: string;
}

function cachePath(): string {
  return path.join(ellaHome(), "update-cache.json");
}

function fetchLatestVersion(packageName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${packageName}/latest`;
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => {
        try {
          const data = JSON.parse(body) as { version?: string };
          resolve(data.version ?? "0.0.0");
        } catch {
          reject(new Error("Failed to parse npm registry response"));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function parseVersion(v: string): [number, number, number] {
  const parts = v.replace(/^v/, "").split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isNewer(a: string, b: string): boolean {
  const [aMaj, aMin, aPatch] = parseVersion(a);
  const [bMaj, bMin, bPatch] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPatch > bPatch;
}

async function currentVersion(): Promise<string> {
  try {
    // Look for package.json in the CLI package
    const pkgPath = new URL("../../package.json", import.meta.url);
    const raw = await readFile(pkgPath, "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function checkForUpdate(): Promise<string | null> {
  try {
    // Rate-limit: only check once per 24h
    let cache: UpdateCache | null = null;
    try {
      const raw = await readFile(cachePath(), "utf8");
      cache = JSON.parse(raw) as UpdateCache;
    } catch { /* no cache */ }

    const now = Date.now();
    if (cache && now - new Date(cache.checkedAt).getTime() < CHECK_INTERVAL_MS) {
      const curr = await currentVersion();
      if (isNewer(cache.latestVersion, curr)) {
        return `Update available: ${curr} → ${cache.latestVersion}  (npm install -g ${PACKAGE_NAME})`;
      }
      return null;
    }

    const [latest, curr] = await Promise.all([
      fetchLatestVersion(PACKAGE_NAME),
      currentVersion(),
    ]);

    // Write cache
    await mkdir(ellaHome(), { recursive: true });
    await writeFile(cachePath(), JSON.stringify({
      checkedAt: new Date().toISOString(),
      latestVersion: latest,
      currentVersion: curr,
    }), "utf8");

    if (isNewer(latest, curr)) {
      return `Update available: ${curr} → ${latest}  (npm install -g ${PACKAGE_NAME})`;
    }
    return null;
  } catch {
    return null; // Never crash on update check failure
  }
}
