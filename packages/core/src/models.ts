import type { ProviderName, ThinkingMode } from "./types.js";

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic:  "claude-sonnet-4-6",
  openai:     "o4-mini",
  gemini:     "gemini-2.5-flash",
  openrouter: "anthropic/claude-sonnet-4-6",
};

export const MODEL_CATALOG: Record<ProviderName, string[]> = {
  anthropic:  ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai:     ["o3", "o4-mini", "gpt-4o"],
  gemini:     ["gemini-2.5-pro", "gemini-2.5-flash"],
  openrouter: ["anthropic/claude-sonnet-4-6", "openai/gpt-4o", "google/gemini-2.5-flash"],
};

export function maxOutputTokens(mode: ThinkingMode): number {
  switch (mode) {
    case "fast":     return 4096;
    case "balanced": return 8192;
    case "deep":     return 16000;
    case "max":      return 32000;
  }
}

export function providerFromString(s: string): ProviderName {
  if (["anthropic", "openai", "gemini", "openrouter"].includes(s)) return s as ProviderName;
  throw new Error(`Unknown provider: ${s}. Use anthropic, openai, gemini, openrouter.`);
}

export function thinkingModeFromString(s: string): ThinkingMode {
  if (["fast", "balanced", "deep", "max"].includes(s)) return s as ThinkingMode;
  throw new Error(`Unknown thinking mode: ${s}. Use fast, balanced, deep, max.`);
}
