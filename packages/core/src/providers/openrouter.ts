import type { ChatMessage, CompletionOptions, ModelProvider, StreamEvent } from "../types.js";

export class OpenRouterProvider implements ModelProvider {
  readonly name = "openrouter" as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://openrouter.ai/api/v1",
  ) {}

  async *stream(messages: ChatMessage[], options: CompletionOptions): AsyncGenerator<StreamEvent> {
    let resp: Response;
    try {
      resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "HTTP-Referer": "https://ella.local",
          "X-Title": "Ella CLI",
        },
        body: JSON.stringify({
          model: options.model,
          messages,
          max_tokens: options.maxOutputTokens,
          stream: true,
        }),
      });
    } catch (err) {
      yield { kind: "error", errorMessage: `Network error: ${String(err)}` };
      return;
    }

    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      yield { kind: "error", errorMessage: `OpenRouter ${resp.status}: ${text.slice(0, 400)}` };
      return;
    }

    const decoder = new TextDecoder();
    let buf = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of resp.body as unknown as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        let item: Record<string, unknown>;
        try { item = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }

        const choices = item["choices"] as unknown[] | undefined;
        if (choices?.length) {
          const choice = choices[0] as Record<string, unknown>;
          const delta = choice["delta"] as Record<string, unknown> | undefined;
          const text = delta?.["content"] as string | undefined;
          if (text) yield { kind: "token", text };
        }

        const usage = item["usage"] as Record<string, unknown> | undefined;
        if (usage) {
          inputTokens = (usage["prompt_tokens"] as number) || inputTokens;
          outputTokens = (usage["completion_tokens"] as number) || outputTokens;
        }
      }
    }

    yield { kind: "cost", inputTokens, outputTokens };
    yield { kind: "done" };
  }
}
