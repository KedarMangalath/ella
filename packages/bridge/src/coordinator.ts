import { execSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import type {
  AgentAdapter,
  AgentId,
  AgentResult,
  AgentStreamEvent,
  BridgeConfig,
  CoordinatorResult,
} from "./types.js";
import { OpenCodeAdapter } from "./adapters/opencode.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { CodexAdapter } from "./adapters/codex.js";

function isGitRepo(cwd: string): boolean {
  try { execSync("git rev-parse --git-dir", { cwd, stdio: "ignore" }); return true; } catch { return false; }
}

function createWorktree(repoRoot: string, agentId: AgentId): string {
  const base = path.join(repoRoot, ".git", "ella-bridge-worktrees");
  mkdirSync(base, { recursive: true });
  const worktreeDir = path.join(base, agentId);
  if (existsSync(worktreeDir)) {
    try { execSync(`git worktree remove --force "${worktreeDir}"`, { cwd: repoRoot, stdio: "ignore" }); } catch { /* stale ref — ignore */ }
  }
  const branch = `ella-bridge-${agentId}-${Date.now()}`;
  execSync(`git worktree add "${worktreeDir}" -b "${branch}"`, { cwd: repoRoot });
  return worktreeDir;
}

function removeWorktree(repoRoot: string, worktreeDir: string): void {
  try { execSync(`git worktree remove --force "${worktreeDir}"`, { cwd: repoRoot, stdio: "ignore" }); } catch { /* ignore */ }
  try { execSync("git worktree prune", { cwd: repoRoot, stdio: "ignore" }); } catch { /* ignore */ }
}

export class Coordinator {
  private adapters: Map<AgentId, AgentAdapter> = new Map();
  private config: BridgeConfig;
  private worktrees: Map<AgentId, { repoRoot: string; dir: string }> = new Map();

  constructor(config: BridgeConfig) {
    this.config = config;

    for (const id of config.agents) {
      switch (id) {
        case "opencode": this.adapters.set(id, new OpenCodeAdapter(config.opencodePort)); break;
        case "gemini":   this.adapters.set(id, new GeminiAdapter()); break;
        case "codex":    this.adapters.set(id, new CodexAdapter()); break;
      }
    }
  }

  async start(cwd: string): Promise<void> {
    const useWorktrees = isGitRepo(cwd);

    await Promise.allSettled(
      [...this.adapters.entries()].map(async ([id, adapter]) => {
        let agentCwd = cwd;
        if (useWorktrees) {
          try {
            const dir = createWorktree(cwd, id);
            this.worktrees.set(id, { repoRoot: cwd, dir });
            agentCwd = dir;
          } catch { /* worktree creation failed — fall back to shared cwd */ }
        }
        await adapter.start(agentCwd);
      }),
    );
  }

  async stop(): Promise<void> {
    await Promise.allSettled(
      [...this.adapters.values()].map((a) => a.stop()),
    );
    for (const [, { repoRoot, dir }] of this.worktrees) {
      removeWorktree(repoRoot, dir);
    }
    this.worktrees.clear();
  }

  availableAgents(): AgentId[] {
    return [...this.adapters.entries()]
      .filter(([, a]) => a.isRunning())
      .map(([id]) => id);
  }

  async run(
    prompt: string,
    onEvent?: (event: AgentStreamEvent) => void,
  ): Promise<CoordinatorResult> {
    const available = this.availableAgents();
    if (!available.length) {
      return {
        mode: this.config.mode,
        results: [],
        finalText: "No external agents available. Install and start opencode, gemini-cli, or codex.",
      };
    }

    switch (this.config.mode) {
      case "race":    return this.raceMode(prompt, available, onEvent);
      case "debate":  return this.debateMode(prompt, available, onEvent);
      default:        return this.routeMode(prompt, available, onEvent);
    }
  }

  private async raceMode(
    prompt: string,
    agents: AgentId[],
    onEvent?: (event: AgentStreamEvent) => void,
  ): Promise<CoordinatorResult> {
    const timeout = this.config.timeout ?? 120_000;

    const run = async (id: AgentId): Promise<AgentResult> => {
      const adapter = this.adapters.get(id)!;
      const start = Date.now();
      let text = "";
      try {
        await adapter.send(prompt);
        const timer = setTimeout(() => adapter.cancel(), timeout);
        for await (const evt of adapter.stream()) {
          onEvent?.(evt);
          if (evt.kind === "token" && evt.text) text += evt.text;
          if (evt.kind === "done" || evt.kind === "error") break;
        }
        clearTimeout(timer);
        return { agentId: id, text, success: true, durationMs: Date.now() - start };
      } catch (err) {
        return { agentId: id, text, success: false, durationMs: Date.now() - start, error: String(err) };
      }
    };

    const results = await Promise.all(agents.map(run));
    const winner = results
      .filter((r) => r.success)
      .sort((a, b) => b.text.length - a.text.length)[0];

    return {
      mode: "race",
      results,
      finalText: winner?.text ?? results[0]?.text ?? "No result.",
      winner: winner?.agentId,
    };
  }

  private async routeMode(
    prompt: string,
    agents: AgentId[],
    onEvent?: (event: AgentStreamEvent) => void,
  ): Promise<CoordinatorResult> {
    // Pick best agent by matching prompt keywords to strengths
    const scored = agents.map((id) => {
      const a = this.adapters.get(id)!;
      let score = 0;
      const lp = prompt.toLowerCase();
      if (lp.includes("refactor") || lp.includes("context") || lp.includes("large"))
        score += a.strengths.longContext;
      if (lp.includes("shell") || lp.includes("run") || lp.includes("command"))
        score += a.strengths.shellOps;
      if (lp.includes("generate") || lp.includes("write") || lp.includes("create"))
        score += a.strengths.codeGeneration;
      if (lp.includes("reason") || lp.includes("analyze") || lp.includes("explain"))
        score += a.strengths.reasoning;
      score += a.strengths.multiFile * 0.5; // baseline
      return { id, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const chosen = scored[0]!.id;
    const adapter = this.adapters.get(chosen)!;

    let text = "";
    const start = Date.now();
    try {
      await adapter.send(prompt);
      for await (const evt of adapter.stream()) {
        onEvent?.(evt);
        if (evt.kind === "token" && evt.text) text += evt.text;
        if (evt.kind === "done" || evt.kind === "error") break;
      }
    } catch (err) {
      return {
        mode: "route",
        results: [{ agentId: chosen, text, success: false, durationMs: Date.now() - start, error: String(err) }],
        finalText: text || "Agent failed.",
        winner: chosen,
      };
    }

    return {
      mode: "route",
      results: [{ agentId: chosen, text, success: true, durationMs: Date.now() - start }],
      finalText: text,
      winner: chosen,
    };
  }

  private async debateMode(
    prompt: string,
    agents: AgentId[],
    onEvent?: (event: AgentStreamEvent) => void,
  ): Promise<CoordinatorResult> {
    // Round 1: all agents answer the prompt
    const round1 = await this.raceMode(prompt, agents, onEvent);

    // Round 2: each agent critiques the others (simplified: each gets the best answer)
    const best = round1.finalText;
    const critiquePrompt = `Review this solution and identify flaws or improvements:\n\n${best.slice(0, 2000)}`;

    const critiques: string[] = [];
    for (const id of agents) {
      if (id === round1.winner) continue;
      const adapter = this.adapters.get(id);
      if (!adapter?.isRunning()) continue;
      let text = "";
      try {
        await adapter.send(critiquePrompt);
        for await (const evt of adapter.stream()) {
          if (evt.kind === "token" && evt.text) text += evt.text;
          if (evt.kind === "done" || evt.kind === "error") break;
        }
        critiques.push(`[${id}]: ${text.slice(0, 600)}`);
      } catch { /* skip */ }
    }

    const synthesis = critiques.length
      ? `${best}\n\n---\nCritiques:\n${critiques.join("\n\n")}`
      : best;

    return {
      mode: "debate",
      results: round1.results,
      finalText: synthesis,
      winner: round1.winner,
    };
  }
}
