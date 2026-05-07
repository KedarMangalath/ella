import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ApprovalMode, EllaConfig, ProviderName } from "./types.js";
import { DEFAULT_MODELS } from "./models.js";

const CONFIG_VERSION = 1;

export function ellaHome(): string {
  return process.env.ELLA_HOME || path.join(homedir(), ".ella");
}

export function configPath(): string {
  return path.join(ellaHome(), "config.json");
}

export function defaultConfig(): EllaConfig {
  return {
    defaultProvider: "openai",
    defaultModel: DEFAULT_MODELS.openai,
    thinkingMode: "balanced",
    approvalMode: "ask",
    providers: {
      openai: { defaultModel: DEFAULT_MODELS.openai },
      anthropic: { defaultModel: DEFAULT_MODELS.anthropic },
      gemini: { defaultModel: DEFAULT_MODELS.gemini },
      openrouter: { defaultModel: DEFAULT_MODELS.openrouter },
    },
  };
}

export async function loadConfig(): Promise<EllaConfig> {
  try {
    const raw = await readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<EllaConfig> & { version?: number };
    const base = defaultConfig();
    return {
      ...base,
      ...parsed,
      providers: {
        ...base.providers,
        ...(parsed.providers || {}),
      },
    };
  } catch {
    return defaultConfig();
  }
}

export async function saveConfig(config: EllaConfig): Promise<void> {
  await mkdir(ellaHome(), { recursive: true });
  const payload = {
    version: CONFIG_VERSION,
    ...config,
  };
  await writeFile(configPath(), JSON.stringify(payload, null, 2), { mode: 0o600 });
}

export function maskedConfig(config: EllaConfig): EllaConfig {
  const copy = structuredClone(config);
  for (const provider of Object.keys(copy.providers) as ProviderName[]) {
    const key = copy.providers[provider].apiKey;
    if (key) {
      copy.providers[provider].apiKey = `${key.slice(0, 4)}...${key.slice(-4)}`;
    }
  }
  return copy;
}

export function envKeyForProvider(provider: ProviderName): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "gemini":
      return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    case "openrouter":
      return process.env.OPENROUTER_API_KEY;
  }
}

export function apiKeyForProvider(config: EllaConfig, provider: ProviderName): string | undefined {
  return envKeyForProvider(provider) || config.providers[provider]?.apiKey;
}

export function approvalModeFromString(value: string): ApprovalMode | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "ask" ||
    normalized === "auto-edit" ||
    normalized === "full-auto" ||
    normalized === "read-only"
  ) {
    return normalized;
  }
  return null;
}
