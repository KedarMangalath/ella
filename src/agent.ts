import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ChatMessage, EllaConfig, ModelProvider } from "./types.js";
import { maxOutputTokensForThinking } from "./models.js";
import { systemPrompt } from "./prompts.js";
import { parseToolCalls, runToolCall } from "./tools.js";
import { theme } from "./theme.js";
import { withEllaAnimation } from "./animation.js";

export interface AgentRunOptions {
  cwd: string;
  prompt: string;
  interactive?: boolean;
  messages?: ChatMessage[];
}

export interface AgentRunResult {
  text: string;
  messages: ChatMessage[];
}

function visibleAssistantText(text: string): string {
  return text.replace(/<ella_tool\s+name="[^"]+">\s*[\s\S]*?\s*<\/ella_tool>/g, "").trim();
}

async function askApproval(reason: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${theme.prompt(reason)} ${theme.muted("[y/N]")} `);
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
    const messages: ChatMessage[] = options.messages?.length
      ? [...options.messages]
      : [{ role: "system", content: systemPrompt(this.config.thinkingMode) }];
    if (!messages.some((message) => message.role === "system")) {
      messages.unshift({ role: "system", content: systemPrompt(this.config.thinkingMode) });
    }
    messages.push({ role: "user", content: options.prompt });

    let lastVisible = "";
    const maxTurns = 8;

    for (let turn = 0; turn < maxTurns; turn += 1) {
      const response = await withEllaAnimation(
        `thinking with ${this.provider.name}/${this.config.defaultModel}`,
        "think",
        () => this.provider.complete(messages, {
          provider: this.provider.name,
          model: this.config.defaultModel,
          thinkingMode: this.config.thinkingMode,
          maxOutputTokens: maxOutputTokensForThinking(this.config.thinkingMode),
        }),
      );

      messages.push({ role: "assistant", content: response });
      const visible = visibleAssistantText(response);
      if (visible) {
        lastVisible = visible;
        output.write(`\n${visible}\n`);
      }

      const calls = parseToolCalls(response);
      if (!calls.length) return { text: lastVisible || response, messages };

      const toolResults: string[] = [];
      for (const call of calls) {
        output.write(`\n${theme.tool("[tool]")} ${theme.accent(call.name)}\n`);
        const result = await withEllaAnimation(
          `running ${call.name}`,
          "tool",
          () => runToolCall(call, {
            cwd: options.cwd,
            approvalMode: this.config.approvalMode,
            permissions: this.config.permissions,
            askApproval,
          }),
        );
        output.write(`${theme.muted(result.slice(0, 1200))}${result.length > 1200 ? `\n${theme.muted("[truncated]")}` : ""}\n`);
        toolResults.push(`<ella_tool_result name="${call.name}">\n${result}\n</ella_tool_result>`);
      }

      messages.push({
        role: "user",
        content: `Tool results:\n\n${toolResults.join("\n\n")}\n\nContinue. If task is done, give final concise answer.`,
      });
    }

    return { text: lastVisible || "Stopped after maximum tool turns.", messages };
  }
}
