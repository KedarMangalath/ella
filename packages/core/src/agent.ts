import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type {
  AgentRunOptions,
  AgentRunResult,
  ChatMessage,
  EllaConfig,
  ModelProvider,
  StreamEvent,
  ToolContext,
} from "./types.js";
import { maxOutputTokens } from "./models.js";
import { systemPrompt } from "./prompts.js";
import { parseToolCalls, runToolCall } from "./tools/index.js";
import { estimateCost } from "./cost.js";
import { theme } from "@ella/shared";

const MAX_TURNS = 20;

// Rough token estimator: 1 token ≈ 4 chars
const CHARS_PER_TOKEN = 4;
// Leave headroom for output tokens
const MAX_CONTEXT_CHARS = 180_000 * CHARS_PER_TOKEN;

async function cliAskApproval(reason: string, preview?: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const previewText = preview ? `\n${theme.muted(preview.slice(0, 600))}` : "";
    const answer = await rl.question(
      `${theme.prompt(reason)}${previewText}\n${theme.muted("[y/N]")} `,
    );
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

function totalChars(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0);
}

/**
 * When context grows too large, drop the oldest non-system user/assistant pairs
 * while preserving the system prompt and the last N turns.
 */
function trimContext(messages: ChatMessage[], keepLastN = 6): ChatMessage[] {
  if (totalChars(messages) <= MAX_CONTEXT_CHARS) return messages;

  const system = messages.filter((m) => m.role === "system");
  const conv = messages.filter((m) => m.role !== "system");

  // Always keep last keepLastN messages
  const keep = conv.slice(-keepLastN);
  const candidates = conv.slice(0, -keepLastN);

  // Drop candidates from oldest until under budget
  let dropped = 0;
  while (
    dropped < candidates.length &&
    totalChars([...system, ...candidates.slice(dropped), ...keep]) > MAX_CONTEXT_CHARS
  ) {
    dropped++;
  }

  const trimmedCount = dropped;
  const result = [...system, ...candidates.slice(dropped), ...keep];

  if (trimmedCount > 0) {
    // Insert a marker so the model knows context was trimmed
    result.splice(system.length, 0, {
      role: "system",
      content: `[${trimmedCount} earlier messages omitted to fit context window]`,
    });
  }

  return result;
}

export class EllaAgent {
  constructor(
    private readonly provider: ModelProvider,
    private readonly config: EllaConfig,
  ) {}

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const mcpToolDescs = options.mcpManager?.allTools().map(
      (t) => `${t.name} [${t.serverName}]${t.description ? `: ${t.description}` : ""}`,
    );

    const sysPrompt = systemPrompt(this.config.thinkingMode, options.extraContext, mcpToolDescs);
    const messages: ChatMessage[] = options.messages?.length
      ? [...options.messages]
      : [{ role: "system", content: sysPrompt }];

    if (!messages.some((m) => m.role === "system")) {
      messages.unshift({ role: "system", content: sysPrompt });
    }
    messages.push({ role: "user", content: options.prompt });

    let totalInput = 0;
    let totalOutput = 0;
    let lastText = "";

    const toolContext: ToolContext = {
      cwd: options.cwd,
      approvalMode: this.config.approvalMode,
      permissions: this.config.permissions,
      askApproval: options.askApproval ?? cliAskApproval,
      onEvent: options.onEvent,
      onFileTouch: options.onFileTouch,
      undoJournal: options.undoJournal,
      mcpManager: options.mcpManager,
    };

    const budget = options.budgetUsd ?? 0;
    let warnedBudget = false;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (options.signal?.aborted) break;

      // Trim context before sending to avoid hitting provider limits
      const trimmed = trimContext(messages);

      let responseText = "";
      let thinkingText = "";

      const completeOptions = {
        provider: this.config.defaultProvider,
        model: this.config.defaultModel,
        thinkingMode: this.config.thinkingMode,
        maxOutputTokens: maxOutputTokens(this.config.thinkingMode),
      };

      for await (const event of this.provider.stream(trimmed, completeOptions)) {
        if (options.signal?.aborted) break;
        options.onEvent?.(event);

        if (event.kind === "token" && event.text) responseText += event.text;
        if (event.kind === "thinking" && event.text) thinkingText += event.text;
        if (event.kind === "cost") {
          totalInput += event.inputTokens ?? 0;
          totalOutput += event.outputTokens ?? 0;

          if (budget > 0) {
            const runCost = estimateCost(this.config.defaultModel, totalInput, totalOutput);
            if (!warnedBudget && runCost >= budget * 0.8) {
              warnedBudget = true;
              options.onEvent?.({ kind: "budget_warn", text: `80% of $${budget.toFixed(3)} budget used` });
            }
            if (runCost >= budget) {
              options.onEvent?.({ kind: "budget_exceeded", text: `Budget $${budget.toFixed(3)} exceeded` });
              throw new Error(`Cost budget $${budget.toFixed(3)} exceeded — run aborted.`);
            }
          }
        }
        if (event.kind === "error") throw new Error(event.errorMessage ?? "Provider error");
      }

      if (!responseText && thinkingText) responseText = thinkingText;

      messages.push({ role: "assistant", content: responseText });
      lastText = responseText;

      const calls = parseToolCalls(responseText);
      if (!calls.length) break;

      const results: string[] = [];
      for (const call of calls) {
        if (options.signal?.aborted) break;
        options.onEvent?.({ kind: "tool_start", toolName: call.name, toolInput: call.input });
        const result = await runToolCall(call, toolContext);
        options.onEvent?.({ kind: "tool_end", toolName: call.name, toolResult: result });
        results.push(`<ella_tool_result name="${call.name}">\n${result}\n</ella_tool_result>`);
      }

      messages.push({
        role: "user",
        content: `Tool results:\n\n${results.join("\n\n")}\n\nContinue. If the task is complete, give a concise final answer.`,
      });
    }

    const costUsd = estimateCost(this.config.defaultModel, totalInput, totalOutput);

    return {
      text: lastText || "Done.",
      messages,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      costUsd,
    };
  }
}
