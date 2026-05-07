import type { ProviderName, ThinkingMode } from "./types.js";

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: "gpt-5.1",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-3-pro-preview",
  openrouter: "openai/gpt-5.1",
};

export const MODEL_CATALOG: Record<ProviderName, string[]> = {
  openai: ["gpt-5.1", "gpt-5.1-codex", "gpt-5.1-mini", "gpt-4.1"],
  anthropic: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
  gemini: ["gemini-3-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash"],
  openrouter: [
    "openai/gpt-5.1",
    "anthropic/claude-sonnet-4.5",
    "google/gemini-3-pro-preview",
  ],
};

export const THINKING_MODES: ThinkingMode[] = ["fast", "balanced", "deep", "max"];

export function maxOutputTokensForThinking(mode: ThinkingMode): number {
  switch (mode) {
    case "fast":
      return 2048;
    case "balanced":
      return 4096;
    case "deep":
      return 8192;
    case "max":
      return 12000;
  }
}

export function providerFromString(value: string): ProviderName | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "openai" ||
    normalized === "anthropic" ||
    normalized === "gemini" ||
    normalized === "openrouter"
  ) {
    return normalized;
  }
  return null;
}

export function thinkingModeFromString(value: string): ThinkingMode | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "fast" ||
    normalized === "balanced" ||
    normalized === "deep" ||
    normalized === "max"
  ) {
    return normalized;
  }
  return null;
}
