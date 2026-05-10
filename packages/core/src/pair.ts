import type {
  ChatMessage,
  EllaConfig,
  ModelProvider,
  PairResult,
  ProviderName,
  StreamEvent,
} from "./types.js";
import { maxOutputTokens } from "./models.js";
import { systemPrompt } from "./prompts.js";
import { estimateCost } from "./cost.js";

export class PairRunner {
  constructor(
    private readonly providerA: ModelProvider,
    private readonly providerB: ModelProvider,
    private readonly config: EllaConfig,
    private readonly modelB: string,
  ) {}

  async run(
    prompt: string,
    cwd: string,
    onEventA?: (e: StreamEvent) => void,
    onEventB?: (e: StreamEvent) => void,
  ): Promise<PairResult> {
    const started = Date.now();
    const sys: ChatMessage = { role: "system", content: systemPrompt(this.config.thinkingMode) };
    const user: ChatMessage = { role: "user", content: prompt };
    const messages: ChatMessage[] = [sys, user];

    const opts = {
      provider: this.config.defaultProvider,
      model: this.config.defaultModel,
      thinkingMode: this.config.thinkingMode,
      maxOutputTokens: maxOutputTokens(this.config.thinkingMode),
    };
    const optsB = { ...opts, provider: this.providerB.name, model: this.modelB };

    async function collect(
      gen: AsyncGenerator<StreamEvent>,
      onEvent?: (e: StreamEvent) => void,
    ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
      let text = "";
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const evt of gen) {
        onEvent?.(evt);
        if (evt.kind === "token" && evt.text) text += evt.text;
        if (evt.kind === "cost") {
          inputTokens += evt.inputTokens ?? 0;
          outputTokens += evt.outputTokens ?? 0;
        }
      }
      return { text, inputTokens, outputTokens };
    }

    const [resultA, resultB] = await Promise.all([
      collect(this.providerA.stream(messages, opts), onEventA),
      collect(this.providerB.stream(messages, optsB), onEventB),
    ]);

    const costA = estimateCost(opts.model, resultA.inputTokens, resultA.outputTokens);
    const costB = estimateCost(this.modelB, resultB.inputTokens, resultB.outputTokens);

    return {
      providerA: this.providerA.name as ProviderName,
      providerB: this.providerB.name as ProviderName,
      modelA: opts.model,
      modelB: this.modelB,
      textA: resultA.text || "(no response)",
      textB: resultB.text || "(no response)",
      inputTokens: resultA.inputTokens + resultB.inputTokens,
      outputTokensA: resultA.outputTokens,
      outputTokensB: resultB.outputTokens,
      costUsd: costA + costB,
      elapsedMs: Date.now() - started,
    };
  }
}
