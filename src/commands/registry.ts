export type CommandGroup = "Core" | "Setup" | "Workspace" | "Agent" | "Interactive";

export interface CommandEntry {
  id: string;
  group: CommandGroup;
  description: string;
  cli?: string[];
  slash?: string[];
  topLevel?: string[];
}

export const commandRegistry: CommandEntry[] = [
  {
    id: "start",
    group: "Core",
    description: "Start the interactive Ella coding agent.",
    cli: ["ella"],
  },
  {
    id: "ask",
    group: "Core",
    description: "Run one prompt and save it as a continuable session.",
    cli: ["ella <prompt>", "ella ask <prompt>", "ella run <prompt>"],
    topLevel: ["ask", "run"],
  },
  {
    id: "help",
    group: "Core",
    description: "Show commands.",
    cli: ["ella commands", "ella help"],
    slash: ["/commands", "/help"],
    topLevel: ["commands", "help", "--help", "-h"],
  },
  {
    id: "status",
    group: "Core",
    description: "Show active provider, model, thinking mode, approval mode, and key status.",
    cli: ["ella status", "ella doctor", "ella quickstart"],
    slash: ["/status"],
    topLevel: ["status", "doctor", "quickstart", "ready"],
  },
  {
    id: "sessions",
    group: "Core",
    description: "List, continue, and resume saved sessions.",
    cli: ["ella sessions", "ella continue [prompt]", "ella resume [session-id]"],
    slash: ["/sessions", "/continue [prompt]", "/resume [session-id]", "/new"],
    topLevel: ["sessions", "continue", "resume"],
  },
  {
    id: "setup",
    group: "Setup",
    description: "Run the first-run wizard for provider, API key, model, thinking, and approvals.",
    cli: ["ella setup"],
    slash: ["/setup"],
    topLevel: ["setup"],
  },
  {
    id: "keys",
    group: "Setup",
    description: "Paste, check, or delete remembered API keys.",
    cli: ["ella key status", "ella key set [provider]", "ella key delete [provider]"],
    slash: ["/key status", "/key set [provider]", "/key delete [provider]"],
    topLevel: ["key"],
  },
  {
    id: "model",
    group: "Setup",
    description: "Switch provider, model, thinking mode, approval mode, or custom base URL.",
    cli: [
      "ella provider [provider]",
      "ella model [name-or-number]",
      "ella models [provider]",
      "ella think <fast|balanced|deep|max>",
      "ella approval <ask|auto-edit|full-auto|read-only>",
      "ella base-url <provider> <url>",
    ],
    slash: [
      "/provider [provider]",
      "/model [name-or-number]",
      "/models [provider]",
      "/think <fast|balanced|deep|max>",
      "/approval <mode>",
      "/base-url <provider> <url>",
    ],
    topLevel: ["provider", "model", "models", "think", "approval", "base-url"],
  },
  {
    id: "accessibility",
    group: "Setup",
    description: "Configure color, motion, contrast, and screen-reader-friendly output.",
    cli: ["ella accessibility show", "ella accessibility set <setting> <on|off>"],
    slash: ["/accessibility", "/accessibility <setting> <on|off>"],
    topLevel: ["accessibility"],
  },
  {
    id: "config",
    group: "Setup",
    description: "Show or edit raw Ella config values.",
    cli: [
      "ella config show",
      "ella config set-key <provider> [key]",
      "ella config delete-key <provider>",
      "ella config set-base-url <provider> <url>",
      "ella config set-provider <provider>",
      "ella config set-model <model>",
      "ella config set-thinking <fast|balanced|deep|max>",
      "ella config set-approval <ask|auto-edit|full-auto|read-only>",
    ],
    slash: ["/config"],
    topLevel: ["config"],
  },
  {
    id: "project",
    group: "Workspace",
    description: "Initialize project instructions and local Ella metadata.",
    cli: ["ella init"],
    topLevel: ["init"],
  },
  {
    id: "memory",
    group: "Workspace",
    description: "Store project memory and todo context that Ella injects into future prompts.",
    cli: ["ella memory <show|add|clear>", "ella todo <list|add|done|clear>"],
    slash: ["/memory show|add|clear", "/todo list|add|done|clear"],
    topLevel: ["memory", "todo"],
  },
  {
    id: "history",
    group: "Workspace",
    description: "Inspect or revert Ella file edits.",
    cli: ["ella history", "ella undo", "ella redo"],
    slash: ["/history", "/undo", "/redo"],
    topLevel: ["history", "undo", "redo"],
  },
  {
    id: "graph",
    group: "Workspace",
    description: "Build and query the lightweight repository graph.",
    cli: ["ella graph <build|stats|search|impact>"],
    slash: ["/graph build|stats|search|impact"],
    topLevel: ["graph"],
  },
  {
    id: "tools",
    group: "Workspace",
    description: "Show local model tools.",
    cli: ["ella tools"],
    slash: ["/tools"],
    topLevel: ["tools"],
  },
  {
    id: "mcp",
    group: "Workspace",
    description: "Manage MCP server entries.",
    cli: ["ella mcp <list|add|remove|enable|disable>"],
    slash: ["/mcp <list|add|remove|enable|disable>"],
    topLevel: ["mcp"],
  },
  {
    id: "skills",
    group: "Workspace",
    description: "Manage agent skills.",
    cli: ["ella skills <list|install|link|uninstall|enable|disable>"],
    slash: ["/skills <list|install|link|uninstall|enable|disable>"],
    topLevel: ["skills", "skill"],
  },
  {
    id: "hooks",
    group: "Workspace",
    description: "Manage local hook commands.",
    cli: ["ella hooks <list|add|remove|enable|disable>"],
    slash: ["/hooks <list|add|remove|enable|disable>"],
    topLevel: ["hooks", "hook"],
  },
  {
    id: "extensions",
    group: "Workspace",
    description: "Manage local extensions.",
    cli: ["ella extensions <list|install|link|uninstall|enable|disable>"],
    slash: ["/extensions <list|install|link|uninstall|enable|disable>"],
    topLevel: ["extensions", "extension"],
  },
  {
    id: "plan",
    group: "Agent",
    description: "Ask Ella for an implementation plan.",
    cli: ["ella plan <task>"],
    slash: ["/plan <task>"],
    topLevel: ["plan"],
  },
  {
    id: "review",
    group: "Agent",
    description: "Review the repo or diff for bugs, regressions, missing tests, and risks.",
    cli: ["ella review [focus]"],
    slash: ["/review [focus]"],
    topLevel: ["review"],
  },
  {
    id: "fix",
    group: "Agent",
    description: "Debug and fix a concrete problem end to end.",
    cli: ["ella fix <problem>"],
    slash: ["/fix <problem>"],
    topLevel: ["fix"],
  },
  {
    id: "explain",
    group: "Agent",
    description: "Explain code or behavior using repo context.",
    cli: ["ella explain <topic>"],
    slash: ["/explain <topic>"],
    topLevel: ["explain"],
  },
  {
    id: "swarm",
    group: "Agent",
    description: "Run a multi-role planner/explorer/coder/reviewer/tester workflow.",
    cli: ["ella agents", "ella swarm <task>"],
    slash: ["/agents", "/swarm <task>"],
    topLevel: ["agents", "swarm"],
  },
  {
    id: "exit",
    group: "Interactive",
    description: "Quit interactive mode.",
    slash: ["/exit", "/quit"],
  },
];

export function slashCommands(): CommandEntry[] {
  return commandRegistry.filter((command) => command.slash?.length);
}

export function cliCommands(): CommandEntry[] {
  return commandRegistry.filter((command) => command.cli?.length);
}

export function topLevelCommands(): string[] {
  return [...new Set(commandRegistry.flatMap((command) => command.topLevel || []))].sort();
}

function distance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i]![0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

export function suggestTopLevelCommand(input: string): string | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized || normalized.includes(" ")) return null;
  const candidates = topLevelCommands();
  if (candidates.includes(normalized)) return null;
  const ranked = candidates
    .map((candidate) => ({ candidate, score: distance(normalized, candidate) }))
    .sort((a, b) => a.score - b.score);
  const best = ranked[0];
  if (!best) return null;
  const threshold = normalized.length <= 4 ? 1 : 2;
  return best.score <= threshold ? best.candidate : null;
}
