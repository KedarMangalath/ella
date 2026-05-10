import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ApprovalMode, EllaConfig, ProviderName, ThinkingMode } from "./types.js";
import { DEFAULT_MODELS } from "./models.js";

export function ellaHome(): string {
  return process.env.ELLA_HOME ?? path.join(homedir(), ".ella");
}

export function configPath(): string {
  return path.join(ellaHome(), "config.json");
}

export function defaultConfig(): EllaConfig {
  return {
    defaultProvider: "anthropic",
    defaultModel: DEFAULT_MODELS.anthropic,
    thinkingMode: "balanced",
    approvalMode: "ask",
    permissions: [],
    accessibility: { noColor: false, reducedMotion: false, highContrast: false, screenReader: false },
    providers: {
      openai:     { defaultModel: DEFAULT_MODELS.openai },
      anthropic:  { defaultModel: DEFAULT_MODELS.anthropic },
      gemini:     { defaultModel: DEFAULT_MODELS.gemini },
      openrouter: { defaultModel: DEFAULT_MODELS.openrouter },
    },
  };
}

export async function loadConfig(): Promise<EllaConfig> {
  const base = defaultConfig();
  try {
    const raw = await readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<EllaConfig>;
    return {
      ...base,
      ...parsed,
      accessibility: { ...base.accessibility, ...(parsed.accessibility ?? {}) },
      permissions: parsed.permissions ?? [],
      providers: { ...base.providers, ...(parsed.providers ?? {}) },
    };
  } catch {
    return base;
  }
}

export async function saveConfig(config: EllaConfig): Promise<void> {
  await mkdir(ellaHome(), { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
}

export function maskedConfig(config: EllaConfig): EllaConfig {
  const masked = { ...config, providers: { ...config.providers } };
  for (const p of Object.keys(masked.providers) as ProviderName[]) {
    const settings = masked.providers[p];
    if (settings.apiKey) {
      masked.providers[p] = { ...settings, apiKey: `${settings.apiKey.slice(0, 6)}***` };
    }
  }
  return masked;
}

export function apiKeyForProvider(config: EllaConfig, provider: ProviderName): string | undefined {
  return config.providers[provider]?.apiKey ?? process.env[envKeyForProvider(provider)];
}

export function envKeyForProvider(provider: ProviderName): string {
  const map: Record<ProviderName, string> = {
    anthropic:  "ANTHROPIC_API_KEY",
    openai:     "OPENAI_API_KEY",
    gemini:     "GEMINI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };
  return map[provider];
}

export function approvalModeFromString(s: string): ApprovalMode {
  if (["ask", "auto-edit", "full-auto", "read-only"].includes(s)) return s as ApprovalMode;
  throw new Error(`Unknown approval mode: ${s}`);
}
