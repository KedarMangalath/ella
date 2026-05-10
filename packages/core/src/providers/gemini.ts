import type { ChatMessage, CompletionOptions, ModelProvider, StreamEvent } from "../types.js";
import { estimateCost } from "../cost.js";

export class GeminiProvider implements ModelProvider {
  readonly name = "gemini" as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta",
  ) {}

  async *stream(messages: ChatMessage[], options: CompletionOptions): AsyncGenerator<StreamEvent> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const url = `${this.baseUrl}/models/${encodeURIComponent(options.model)}:streamGenerateContent?key=${encodeURIComponent(this.apiKey)}&alt=sse`;

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents,
          generationConfig: { maxOutputTokens: options.maxOutputTokens },
        }),
      });
    } catch (err) {
      yield { kind: "error", errorMessage: `Network error: ${String(err)}` };
      return;
    }

    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      yield { kind: "error", errorMessage: `Gemini ${resp.status}: ${text.slice(0, 400)}` };
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
        let item: Record<string, unknown>;
        try { item = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }

        const candidates = item["candidates"] as unknown[] | undefined;
        for (const cand of candidates ?? []) {
          const c = cand as Record<string, unknown>;
          const content = c["content"] as Record<string, unknown> | undefined;
          const parts = content?.["parts"] as unknown[] | undefined;
          for (const part of parts ?? []) {
            const text = (part as Record<string, unknown>)["text"] as string | undefined;
            if (text) yield { kind: "token", text };
          }
        }

        const usageMeta = item["usageMetadata"] as Record<string, unknown> | undefined;
        if (usageMeta) {
          inputTokens = (usageMeta["promptTokenCount"] as number) || inputTokens;
          outputTokens = (usageMeta["candidatesTokenCount"] as number) || outputTokens;
        }
      }
    }

    yield { kind: "cost", inputTokens, outputTokens };
    yield { kind: "done" };
  }
}
