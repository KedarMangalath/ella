import type { ChatMessage, CompletionOptions, ModelProvider, StreamEvent } from "../types.js";
import { estimateCost } from "../cost.js";

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic" as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.anthropic.com/v1",
  ) {}

  async *stream(messages: ChatMessage[], options: CompletionOptions): AsyncGenerator<StreamEvent> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const chat = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const useThinking = options.thinkingMode === "deep" || options.thinkingMode === "max";
    const budgetTokens = useThinking ? (options.thinkingMode === "max" ? 16000 : 8000) : undefined;

    const body: Record<string, unknown> = {
      model: options.model,
      system: system || undefined,
      messages: chat,
      max_tokens: options.maxOutputTokens,
      stream: true,
    };

    if (useThinking && budgetTokens) {
      body["thinking"] = { type: "enabled", budget_tokens: budgetTokens };
    }

    let resp: Response;
    try {
      resp = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      yield { kind: "error", errorMessage: `Network error: ${String(err)}` };
      return;
    }

    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      yield { kind: "error", errorMessage: `Anthropic ${resp.status}: ${text.slice(0, 400)}` };
      return;
    }

    const decoder = new TextDecoder();
    let buf = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let inThinking = false;

    for await (const chunk of resp.body as unknown as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        let evt: Record<string, unknown>;
        try { evt = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }

        const type = evt["type"] as string | undefined;

        if (type === "content_block_start") {
          const block = evt["content_block"] as Record<string, unknown> | undefined;
          inThinking = block?.["type"] === "thinking";
        }
        if (type === "content_block_stop") { inThinking = false; }

        if (type === "content_block_delta") {
          const delta = evt["delta"] as Record<string, unknown> | undefined;
          const deltaType = delta?.["type"] as string | undefined;
          const text = (delta?.["text"] ?? delta?.["thinking"]) as string | undefined;
          if (text) {
            yield {
              kind: (deltaType === "thinking_delta" || inThinking) ? "thinking" : "token",
              text,
            };
          }
        }

        if (type === "message_start") {
          const msg = evt["message"] as Record<string, unknown> | undefined;
          const usage = msg?.["usage"] as Record<string, unknown> | undefined;
          if (typeof usage?.["input_tokens"] === "number") inputTokens = usage["input_tokens"] as number;
        }

        if (type === "message_delta") {
          const usage = evt["usage"] as Record<string, unknown> | undefined;
          if (typeof usage?.["output_tokens"] === "number") outputTokens = usage["output_tokens"] as number;
        }
      }
    }

    yield { kind: "cost", inputTokens, outputTokens };
    yield { kind: "done" };
  }
}
