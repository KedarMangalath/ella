import type { ChatMessage, EllaConfig, EvalResult, EvalTurn, ModelProvider, SessionRecord } from "./types.js";
import { systemPrompt } from "./prompts.js";
import { maxOutputTokens } from "./models.js";

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  let matches = 0;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let i = 0;
  let j = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) { matches++; i++; j++; }
    else { j++; }
  }
  return matches / maxLen;
}

export class EvalRunner {
  constructor(
    private readonly provider: ModelProvider,
    private readonly config: EllaConfig,
  ) {}

  async run(
    session: SessionRecord,
    onProgress?: (turn: number, total: number) => void,
  ): Promise<EvalResult> {
    const conversationMessages = session.messages.filter((m) => m.role !== "system");
    const turns: EvalTurn[] = [];

    // Replay each user→assistant pair
    let runningHistory: ChatMessage[] = [
      { role: "system", content: systemPrompt(this.config.thinkingMode) },
    ];

    const opts = {
      provider: this.config.defaultProvider,
      model: this.config.defaultModel,
      thinkingMode: this.config.thinkingMode,
      maxOutputTokens: maxOutputTokens(this.config.thinkingMode),
    };

    let turnIdx = 0;
    for (let i = 0; i < conversationMessages.length - 1; i += 2) {
      const userMsg = conversationMessages[i];
      const assistantMsg = conversationMessages[i + 1];
      if (!userMsg || userMsg.role !== "user") continue;
      if (!assistantMsg || assistantMsg.role !== "assistant") continue;

      onProgress?.(turnIdx, Math.floor(conversationMessages.length / 2));

      const messagesForTurn = [...runningHistory, userMsg];
      let newResponse = "";
      for await (const evt of this.provider.stream(messagesForTurn, opts)) {
        if (evt.kind === "token" && evt.text) newResponse += evt.text;
      }

      const sim = similarity(assistantMsg.content, newResponse);
      turns.push({
        turnIndex: turnIdx,
        prompt: userMsg.content,
        originalResponse: assistantMsg.content,
        newResponse,
        similarity: sim,
      });

      runningHistory = [...runningHistory, userMsg, assistantMsg];
      turnIdx++;
    }

    const avgSimilarity = turns.length
      ? turns.reduce((s, t) => s + t.similarity, 0) / turns.length
      : 1;

    return {
      sessionId: session.id,
      model: this.config.defaultModel,
      turns,
      avgSimilarity,
      driftScore: 1 - avgSimilarity,
    };
  }
}
