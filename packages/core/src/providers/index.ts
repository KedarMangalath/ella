export { AnthropicProvider } from "./anthropic.js";
export { OpenAIProvider } from "./openai.js";
export { GeminiProvider } from "./gemini.js";
export { OpenRouterProvider } from "./openrouter.js";

import type { EllaConfig, ModelProvider, ProviderName } from "../types.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { GeminiProvider } from "./gemini.js";
import { OpenRouterProvider } from "./openrouter.js";

const ENV_KEYS: Record<ProviderName, string> = {
  anthropic:  "ANTHROPIC_API_KEY",
  openai:     "OPENAI_API_KEY",
  gemini:     "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export function createProvider(config: EllaConfig, provider: ProviderName): ModelProvider {
  const settings = config.providers[provider] ?? {};
  const key = settings.apiKey ?? process.env[ENV_KEYS[provider]] ?? "";

  switch (provider) {
    case "anthropic":  return new AnthropicProvider(key, settings.baseUrl);
    case "openai":     return new OpenAIProvider(key, settings.baseUrl);
    case "gemini":     return new GeminiProvider(key, settings.baseUrl);
    case "openrouter": return new OpenRouterProvider(key, settings.baseUrl);
  }
}
