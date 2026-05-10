import type { ChatMessage, CompletionOptions, ModelProvider, StreamEvent } from "../types.js";
import { estimateCost } from "../cost.js";

export class OpenAIProvider implements ModelProvider {
  readonly name = "openai" as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
  ) {}

  private reasoningEffort(mode: string): "low" | "medium" | "high" {
    if (mode === "fast") return "low";
    if (mode === "deep" || mode === "max") return "high";
    return "medium";
  }

  async *stream(messages: ChatMessage[], options: CompletionOptions): AsyncGenerator<StreamEvent> {
    const input = messages.map((m) => ({
      role: m.role === "system" ? "developer" : m.role,
      content: m.content,
    }));

    let resp: Response;
    try {
      resp = await fetch(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          input,
          max_output_tokens: options.maxOutputTokens,
          reasoning: { effort: this.reasoningEffort(options.thinkingMode) },
          stream: true,
        }),
      });
    } catch (err) {
      yield { kind: "error", errorMessage: `Network error: ${String(err)}` };
      return;
    }

    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      yield { kind: "error", errorMessage: `OpenAI ${resp.status}: ${text.slice(0, 400)}` };
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
        let evt: Record<string, unknown>;
        try { evt = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }

        const type = evt["type"] as string | undefined;

        if (type === "response.output_text.delta") {
          const text = evt["delta"] as string | undefined;
          if (text) yield { kind: "token", text };
        }

        if (type === "response.reasoning_summary_text.delta") {
          const text = evt["delta"] as string | undefined;
          if (text) yield { kind: "thinking", text };
        }

        if (type === "response.completed") {
          const r = evt["response"] as Record<string, unknown> | undefined;
          const usage = r?.["usage"] as Record<string, unknown> | undefined;
          if (usage) {
            inputTokens = (usage["input_tokens"] as number) || 0;
            outputTokens = (usage["output_tokens"] as number) || 0;
          }
        }
      }
    }

    yield { kind: "cost", inputTokens, outputTokens };
    yield { kind: "done" };
  }
}
