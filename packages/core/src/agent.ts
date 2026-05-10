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

const MAX_TURNS = 12;

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

export class EllaAgent {
  constructor(
    private readonly provider: ModelProvider,
    private readonly config: EllaConfig,
  ) {}

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    // Build MCP tool description list for the system prompt
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

      let responseText = "";
      let thinkingText = "";

      const completeOptions = {
        provider: this.config.defaultProvider,
        model: this.config.defaultModel,
        thinkingMode: this.config.thinkingMode,
        maxOutputTokens: maxOutputTokens(this.config.thinkingMode),
      };

      for await (const event of this.provider.stream(messages, completeOptions)) {
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
        content: `Tool results:\n\n${results.join("\n\n")}\n\nContinue. If task is complete, give a concise final answer.`,
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
