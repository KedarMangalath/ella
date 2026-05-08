import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ProviderName } from "./types.js";

// Adapted from OpenCode's auth store pattern: provider-keyed auth.json, normalized IDs, 0600 writes.
export interface ApiAuth {
  type: "api";
  key: string;
  metadata?: Record<string, string>;
}

export type AuthInfo = ApiAuth;
export type AuthStore = Record<string, AuthInfo>;

function ellaHome(): string {
  return process.env.ELLA_HOME || path.join(homedir(), ".ella");
}

export function authPath(): string {
  return path.join(ellaHome(), "auth.json");
}

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase().replace(/\/+$/, "");
}

function isAuthInfo(value: unknown): value is AuthInfo {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "api" &&
      typeof (value as { key?: unknown }).key === "string",
  );
}

export async function readAuthStore(): Promise<AuthStore> {
  try {
    const raw = await readFile(authPath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const store: AuthStore = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isAuthInfo(value)) store[normalizeProvider(key)] = value;
    }
    return store;
  } catch {
    return {};
  }
}

async function writeAuthStore(store: AuthStore): Promise<void> {
  await mkdir(ellaHome(), { recursive: true });
  await writeFile(authPath(), JSON.stringify(store, null, 2), { mode: 0o600 });
}

export async function getAuth(provider: ProviderName): Promise<AuthInfo | undefined> {
  const store = await readAuthStore();
  return store[normalizeProvider(provider)];
}

export async function setApiKey(provider: ProviderName, key: string, metadata?: Record<string, string>): Promise<void> {
  const normalized = normalizeProvider(provider);
  const store = await readAuthStore();
  delete store[`${normalized}/`];
  store[normalized] = { type: "api", key, metadata };
  await writeAuthStore(store);
}

export async function removeAuth(provider: ProviderName): Promise<void> {
  const normalized = normalizeProvider(provider);
  const store = await readAuthStore();
  delete store[provider];
  delete store[normalized];
  delete store[`${normalized}/`];
  await writeAuthStore(store);
}

export async function allAuth(): Promise<AuthStore> {
  return readAuthStore();
}
