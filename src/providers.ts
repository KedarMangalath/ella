import type {
  ChatMessage,
  CompletionOptions,
  EllaConfig,
  ModelProvider,
  ProviderName,
  ThinkingMode,
} from "./types.js";
import { apiKeyForProvider } from "./config.js";

class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

function ensureKey(config: EllaConfig, provider: ProviderName): string {
  const key = apiKeyForProvider(config, provider);
  if (!key) {
    throw new ProviderError(
      `Missing API key for ${provider}. Run: ella setup or ella config set-key ${provider}`,
    );
  }
  return key;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const detail = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new ProviderError(`${response.status} ${response.statusText}: ${detail.slice(0, 1200)}`);
  }

  return parsed;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function extractOpenAIText(payload: unknown): string {
  const data = asRecord(payload);
  if (typeof data.output_text === "string") return data.output_text;

  const output = Array.isArray(data.output) ? data.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const record = asRecord(item);
    const content = Array.isArray(record.content) ? record.content : [];
    for (const part of content) {
      const partRecord = asRecord(part);
      if (typeof partRecord.text === "string") chunks.push(partRecord.text);
      if (typeof partRecord.output_text === "string") chunks.push(partRecord.output_text);
    }
  }
  return chunks.join("\n").trim();
}

function reasoningEffort(mode: ThinkingMode): "minimal" | "low" | "medium" | "high" {
  switch (mode) {
    case "fast":
      return "low";
    case "balanced":
      return "medium";
    case "deep":
    case "max":
      return "high";
  }
}

class OpenAIProvider implements ModelProvider {
  readonly name = "openai" as const;

  constructor(private readonly config: EllaConfig) {}

  async complete(messages: ChatMessage[], options: CompletionOptions): Promise<string> {
    const apiKey = ensureKey(this.config, "openai");
    const baseUrl = this.config.providers.openai.baseUrl || "https://api.openai.com/v1";
    const input = messages.map((message) => ({
      role: message.role === "system" ? "developer" : message.role,
      content: message.content,
    }));

    const payload = await postJson(
      `${baseUrl.replace(/\/$/, "")}/responses`,
      { authorization: `Bearer ${apiKey}` },
      {
        model: options.model,
        input,
        max_output_tokens: options.maxOutputTokens,
        reasoning: { effort: reasoningEffort(options.thinkingMode) },
      },
    );

    const text = extractOpenAIText(payload);
    if (!text) throw new ProviderError("OpenAI response had no text output.");
    return text;
  }
}

class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic" as const;

  constructor(private readonly config: EllaConfig) {}

  async complete(messages: ChatMessage[], options: CompletionOptions): Promise<string> {
    const apiKey = ensureKey(this.config, "anthropic");
    const baseUrl = this.config.providers.anthropic.baseUrl || "https://api.anthropic.com/v1";
    const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const chat = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));

    const payload = await postJson(
      `${baseUrl.replace(/\/$/, "")}/messages`,
      {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      {
        model: options.model,
        system,
        messages: chat,
        max_tokens: options.maxOutputTokens,
      },
    );

    const content = Array.isArray(asRecord(payload).content) ? asRecord(payload).content as unknown[] : [];
    const text = content
      .map((part) => asRecord(part))
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
    if (!text) throw new ProviderError("Anthropic response had no text output.");
    return text;
  }
}

class GeminiProvider implements ModelProvider {
  readonly name = "gemini" as const;

  constructor(private readonly config: EllaConfig) {}

  async complete(messages: ChatMessage[], options: CompletionOptions): Promise<string> {
    const apiKey = ensureKey(this.config, "gemini");
    const baseUrl = this.config.providers.gemini.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
    const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));

    const payload = await postJson(
      `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {},
      {
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: {
          maxOutputTokens: options.maxOutputTokens,
        },
      },
    );

    const candidates = Array.isArray(asRecord(payload).candidates) ? asRecord(payload).candidates as unknown[] : [];
    const first = asRecord(candidates[0]);
    const content = asRecord(first.content);
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const text = parts
      .map((part) => asRecord(part))
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
    if (!text) throw new ProviderError("Gemini response had no text output.");
    return text;
  }
}

class OpenRouterProvider implements ModelProvider {
  readonly name = "openrouter" as const;

  constructor(private readonly config: EllaConfig) {}

  async complete(messages: ChatMessage[], options: CompletionOptions): Promise<string> {
    const apiKey = ensureKey(this.config, "openrouter");
    const baseUrl = this.config.providers.openrouter.baseUrl || "https://openrouter.ai/api/v1";
    const payload = await postJson(
      `${baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://ella.local",
        "X-Title": "Ella CLI",
      },
      {
        model: options.model,
        messages,
        max_tokens: options.maxOutputTokens,
      },
    );

    const choices = Array.isArray(asRecord(payload).choices) ? asRecord(payload).choices as unknown[] : [];
    const first = asRecord(choices[0]);
    const message = asRecord(first.message);
    const text = typeof message.content === "string" ? message.content : "";
    if (!text) throw new ProviderError("OpenRouter response had no text output.");
    return text;
  }
}

export function createProvider(config: EllaConfig, provider: ProviderName): ModelProvider {
  switch (provider) {
    case "openai":
      return new OpenAIProvider(config);
    case "anthropic":
      return new AnthropicProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "openrouter":
      return new OpenRouterProvider(config);
  }
}
