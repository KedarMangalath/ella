#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App, type AppHandlers } from "@ella/tui";
import type { PairEntry, TreeNode } from "@ella/tui";
import {
  EllaAgent,
  EvalRunner,
  PairRunner,
  UndoJournal,
  PluginManager,
  checkForUpdate,
  fetchGraphContext,
  fetchGraphContextForPrompt,
  loadConfig,
  saveConfig,
  createProvider,
  createSession,
  saveSession,
  appendPair,
  loadSession,
  listSessions,
  latestSession,
  formatSessionList,
  forkSession,
  getSessionTree,
  topTouchedFiles,
  touchFile,
  loadSkills,
  skillsPromptBlock,
  exportPlan,
  ellaInit,
  readMemory,
  addMemory,
  providerFromString,
  thinkingModeFromString,
  approvalModeFromString,
  formatCost,
  type StreamEvent,
  type EllaConfig,
  type ProviderName,
  type SessionRecord,
} from "@ella/core";
import { Coordinator, type BridgeConfig, type AgentId } from "@ella/bridge";
import { McpManager } from "@ella/mcp";
import { theme } from "@ella/shared";
import { stdout } from "node:process";
import { printBanner, bannerString } from "./banner.js";
import type { ChatEntry, BridgeColumnEntry } from "@ella/tui";

import { execSync } from "node:child_process";

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(`--${name}`) || args.includes(`-${name[0]}`);
}

function flagValue(name: string): string | undefined {
  const idx = args.findIndex((a) => a === `--${name}` || a === `-${name[0]}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

// ── Git context ───────────────────────────────────────────────────────────────
async function getGitContext(cwd: string): Promise<string | null> {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const status = execSync("git status --short", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const log = execSync("git log --oneline -5", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const parts: string[] = [`## Git context\nBranch: ${branch}`];
    if (status) parts.push(`Changed files:\n${status}`);
    if (log) parts.push(`Recent commits:\n${log}`);
    return parts.join("\n");
  } catch {
    return null;
  }
}

// ── ella init ─────────────────────────────────────────────────────────────────
async function runInit(): Promise<void> {
  const result = await ellaInit(process.cwd());
  stdout.write("ella init\n\n");
  for (const line of result.lines) stdout.write(`${line}\n`);
  process.exit(0);
}

// ── ella mcp ──────────────────────────────────────────────────────────────────
async function runMcp(subArgs: string[]): Promise<void> {
  const [sub, name, command, ...rest] = subArgs;
  const config = await loadConfig();

  if (sub === "list") {
    const servers = config.mcpServers ?? [];
    if (!servers.length) { stdout.write("No MCP servers configured.\n"); }
    else { for (const s of servers) stdout.write(`  ${s.name}  ${s.command} ${(s.args ?? []).join(" ")}\n`); }
    process.exit(0);
  }

  if (sub === "add") {
    if (!name || !command) {
      stdout.write("Usage: ella mcp add <name> <command> [args...]\n");
      stdout.write("Example: ella mcp add filesystem npx @modelcontextprotocol/server-filesystem /workspace\n");
      process.exit(1);
    }
    if (!config.mcpServers) config.mcpServers = [];
    const existing = config.mcpServers.findIndex((s) => s.name === name);
    const entry = { name, command, args: rest.length ? rest : undefined };
    if (existing >= 0) { config.mcpServers[existing] = entry; stdout.write(`Updated MCP server: ${name}\n`); }
    else { config.mcpServers.push(entry); stdout.write(`Added MCP server: ${name}\n`); }
    await saveConfig(config);
    process.exit(0);
  }

  if (sub === "remove" || sub === "rm") {
    if (!name) { stdout.write("Usage: ella mcp remove <name>\n"); process.exit(1); }
    config.mcpServers = (config.mcpServers ?? []).filter((s) => s.name !== name);
    await saveConfig(config);
    stdout.write(`Removed MCP server: ${name}\n`);
    process.exit(0);
  }

  stdout.write("ella mcp <list|add|remove>\n");
  process.exit(1);
}

// ── ella config ───────────────────────────────────────────────────────────────
async function runConfig(subArgs: string[]): Promise<void> {
  const [sub, key, value] = subArgs;
  const config = await loadConfig();

  if (sub === "show") {
    stdout.write(JSON.stringify(config, null, 2) + "\n");
    process.exit(0);
  }

  if (sub === "set" && key && value) {
    const parts = key.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let obj: any = config;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]!] ??= {};
    obj[parts[parts.length - 1]!] = value;
    await saveConfig(config);
    stdout.write(`Set ${key} = ${value}\n`);
    process.exit(0);
  }

  stdout.write("ella config <show|set <key> <value>>\n");
  stdout.write("Examples:\n");
  stdout.write("  ella config set defaultProvider openai\n");
  stdout.write("  ella config set providers.anthropic.apiKey sk-ant-...\n");
  process.exit(1);
}

// ── Non-interactive ───────────────────────────────────────────────────────────
async function runHeadless(config: EllaConfig, prompt: string): Promise<void> {
  const provider = createProvider(config, config.defaultProvider);
  const agent = new EllaAgent(provider, config);
  const cwd = process.cwd();

  const skills = await loadSkills(cwd);
  const memory = await readMemory(cwd);
  const extraContext = [
    skillsPromptBlock(skills),
    memory ? `## Project memory\n${memory}` : "",
  ].filter(Boolean).join("\n\n") || undefined;

  const result = await agent.run({
    cwd,
    prompt,
    extraContext,
    onEvent: (evt: StreamEvent) => {
      if (evt.kind === "token" && evt.text) stdout.write(evt.text);
      if (evt.kind === "tool_start") stdout.write(`\n${theme.tool(`[${evt.toolName}]`)}\n`);
      if (evt.kind === "error") stdout.write(`\nError: ${evt.errorMessage}\n`);
      if (evt.kind === "budget_warn") stdout.write(`\n⚠ ${evt.text}\n`);
    },
  });

  stdout.write(`\n\nTokens: ↑${result.inputTokens} ↓${result.outputTokens}\n`);
  process.exit(0);
}

// ── Bridge mode ───────────────────────────────────────────────────────────────
async function runBridge(prompt: string): Promise<void> {
  const modeArg = flagValue("bridge-mode") ?? "race";
  const agentsArg = flagValue("bridge-agents") ?? "opencode,gemini,codex";
  const agents = agentsArg.split(",").map((s) => s.trim()) as AgentId[];

  const bridgeConfig: BridgeConfig = { mode: modeArg as BridgeConfig["mode"], agents };
  const coordinator = new Coordinator(bridgeConfig);
  await coordinator.start(process.cwd());

  stdout.write(theme.header(`Bridge mode: ${modeArg} — agents: ${coordinator.availableAgents().join(", ") || "none"}\n\n`));

  const result = await coordinator.run(prompt, (evt) => {
    if (evt.kind === "token" && evt.text) stdout.write(`${theme.muted(`[${evt.agentId}]`)} ${evt.text}`);
  });

  stdout.write(`\n\n${theme.header("Final result")}\n${result.finalText}\n`);
  if (result.winner) stdout.write(theme.success(`Winner: ${result.winner}\n`));

  await coordinator.stop();
  process.exit(0);
}

// ── TUI ───────────────────────────────────────────────────────────────────────
async function runTui(config: EllaConfig): Promise<void> {
  const cwd = process.cwd();
  const provider = createProvider(config, config.defaultProvider);
  const agent = new EllaAgent(provider, config);
  const mcpManager = new McpManager();
  const pluginManager = new PluginManager();

  // Load MCP servers + plugins in parallel
  await Promise.all([
    ...((config.mcpServers ?? []).map((srv) =>
      mcpManager.addServer({ name: srv.name, command: srv.command, args: srv.args, env: srv.env })
    )),
    pluginManager.loadAll(cwd),
  ]);

  // Load skills for extra context
  const skills = await loadSkills(cwd);
  const memory = await readMemory(cwd);

  // Git context — inject current branch, status, recent commits
  const gitCtx = await getGitContext(cwd);

  // Knowledge-graph context (best-effort, from code-review-graph MCP if connected)
  const graphCtx = await fetchGraphContext(mcpManager, cwd);

  const extraContext = [
    skillsPromptBlock(skills),
    memory ? `## Project memory\n${memory}` : "",
    gitCtx ?? "",
    graphCtx ?? "",
  ].filter(Boolean).join("\n\n") || undefined;

  let session: SessionRecord | null = null;
  const sessionFlag = flagValue("session") ?? flagValue("resume");
  if (sessionFlag) {
    const exactId = sessionFlag === "last" ? null : sessionFlag;
    if (exactId) {
      try { session = await loadSession(exactId); } catch { /* new session */ }
    }
  }
  // Auto-resume last session when --resume or --resume last is given
  if (!session && (flag("resume") || sessionFlag === "last")) {
    try { session = await latestSession(); } catch { /* no sessions yet */ }
  }
  if (!session) session = await createSession(config, cwd);

  // Undo journal per session
  const undoJournal = new UndoJournal(session.id);
  await undoJournal.load();

  let turnIndex = Math.floor(session.messages.filter((m) => m.role === "user").length);
  let handlers: AppHandlers | null = null;

  async function refreshTree(): Promise<void> {
    if (!handlers || !session) return;
    const roots = await getSessionTree();
    const treeNodes = mapTreeNodes(roots as Array<{ session: SessionRecord; children: unknown[] }>);
    handlers.setSessionTree(treeNodes, session.id);
  }

  const handlePrompt = async (prompt: string): Promise<void> => {
    if (!session) return;

    if (prompt.startsWith("/bridge ")) {
      await runBridgeInline(prompt.slice(8).trim(), handlers);
      return;
    }

    if (prompt.startsWith("/")) {
      await handleSlashCommand(prompt, config, session, handlers, provider, cwd, refreshTree, undoJournal, turnIndex, pluginManager, mcpManager);
      return;
    }

    // Run beforePrompt plugins
    const finalPrompt = await pluginManager.runBeforePrompt(prompt, cwd);
    const currentTurn = turnIndex;
    handlers?.setMascot("think", "thinking…");

    // Enrich context with graph semantic search for this specific prompt
    const promptGraphCtx = await fetchGraphContextForPrompt(mcpManager, finalPrompt);
    const promptExtraContext = [extraContext, promptGraphCtx].filter(Boolean).join("\n\n") || undefined;

    const result = await agent.run({
      cwd,
      prompt: finalPrompt,
      messages: session.messages.length ? session.messages : undefined,
      budgetUsd: session.budgetUsd,
      extraContext: promptExtraContext,
      undoJournal,
      mcpManager,
      askApproval: (reason, preview, risk) =>
        new Promise<boolean>((resolve) => {
          handlers?.requestApproval(
            { reason, preview, risk: risk ?? "shell" },
            resolve,
          );
        }),
      onFileTouch: (filePath) => {
        touchFile(session!, filePath);
        handlers?.setHeatmap(topTouchedFiles(session!));
      },
      onEvent: (evt: StreamEvent) => {
        if (evt.kind === "token" && evt.text) {
          handlers?.dispatch({ type: "stream", text: evt.text });
        }
        if (evt.kind === "thinking") handlers?.setMascot("think", "reasoning…");
        if (evt.kind === "tool_start") {
          handlers?.setMascot("tool", evt.toolName ?? "tool");
          handlers?.dispatch({ type: "add", entry: {
            id: `tool-${Date.now()}`,
            role: "tool",
            text: `Running ${evt.toolName}…`,
            toolName: evt.toolName,
            timestamp: Date.now(),
          }});
        }
        if (evt.kind === "file_written" && evt.filePath) {
          handlers?.dispatch({ type: "add", entry: {
            id: `fw-${Date.now()}`,
            role: "tool",
            text: `Wrote ${evt.filePath}`,
            toolName: "write_file",
            diff: evt.diff,
            timestamp: Date.now(),
          }});
        }
        if (evt.kind === "lsp_diagnostic" && evt.text) {
          handlers?.dispatch({ type: "add", entry: {
            id: `lsp-${Date.now()}`,
            role: "error",
            text: `TypeScript: ${evt.text.slice(0, 600)}`,
            timestamp: Date.now(),
          }});
        }
        if (evt.kind === "cost") {
          handlers?.setTokens(evt.inputTokens ?? 0, evt.outputTokens ?? 0, 0);
          session!.totalInputTokens += evt.inputTokens ?? 0;
          session!.totalOutputTokens += evt.outputTokens ?? 0;
        }
        if (evt.kind === "budget_warn" && evt.text) {
          handlers?.setBudgetWarning(evt.text);
        }
      },
      signal: undefined,
    });

    await pluginManager.runAfterPrompt(finalPrompt, result.text, cwd);
    appendPair(session, finalPrompt, result.text);
    session.costUsd += result.costUsd;
    turnIndex++;
    await saveSession(session);
    await refreshTree();
  };

  const appConfig = {
    provider: config.defaultProvider,
    model: config.defaultModel,
    thinkingMode: config.thinkingMode,
    cwd,
    sessionId: session.id,
  };

  // Build initial entries synchronously — part of first render, no re-paint needed
  const now = Date.now();
  const initialEntries: ChatEntry[] = [
    { id: "welcome-banner", role: "banner", text: bannerString(), timestamp: now },
  ];
  const notices: string[] = [];
  if (skills.length) notices.push(`${skills.length} skill(s): ${skills.map((s) => s.name).join(", ")}`);
  if (mcpManager.toolCount()) notices.push(`${mcpManager.serverCount()} MCP server(s), ${mcpManager.toolCount()} tool(s)`);
  if (pluginManager.list().length) notices.push(`plugins: ${pluginManager.list().join(", ")}`);
  if (notices.length) {
    initialEntries.push({ id: "startup-notice", role: "system", text: notices.join("  |  "), timestamp: now + 1 });
  }
  if (gitCtx) {
    // Show compact git info (just branch + changed file count)
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const statusLines = execSync("git status --short", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").filter(Boolean);
      const gitLine = `git: ${branch}${statusLines.length ? `  ${statusLines.length} changed` : "  clean"}`;
      initialEntries.push({ id: "git-ctx", role: "system", text: gitLine, timestamp: now + 2 });
    } catch { /* not a git repo — skip */ }
  }

  // Clear the terminal before Ink takes ownership — prevents artifact stacking on Windows
  if (stdout.isTTY) stdout.write("\x1b[2J\x1b[H");

  const { waitUntilExit } = render(
    <App
      config={appConfig}
      onPrompt={handlePrompt}
      initialEntries={initialEntries}
      onReady={(h) => {
        handlers = h;
        void refreshTree();
        // Check for updates in background (this is the only post-render dispatch)
        void checkForUpdate().then((notice) => {
          if (notice) h.dispatch({ type: "add", entry: {
            id: "update-notice",
            role: "system",
            text: `✦ ${notice}`,
            timestamp: Date.now(),
          }});
        });
      }}
    />,
    { exitOnCtrlC: true },
  );

  await waitUntilExit();
  await mcpManager.disconnectAll();
}

// ── Bridge inline ─────────────────────────────────────────────────────────────
async function runBridgeInline(prompt: string, handlers: AppHandlers | null): Promise<void> {
  const modeArg = "race";
  const agents: AgentId[] = ["opencode", "gemini", "codex"];
  const coordinator = new Coordinator({ mode: modeArg, agents });
  await coordinator.start(process.cwd());

  const available = coordinator.availableAgents();

  // Initialize bridge panel columns (one per available agent)
  const initialColumns: BridgeColumnEntry[] = available.map((id) => ({
    agentId: id,
    text: "",
    done: false,
  }));
  handlers?.setBridgeColumns?.(initialColumns, modeArg);
  handlers?.setBridgeActive?.(true);
  handlers?.setView("bridge");

  if (!available.length) {
    handlers?.dispatch({ type: "add", entry: {
      id: `bridge-err-${Date.now()}`,
      role: "error",
      text: "No external agents running. Start opencode, gemini-cli, or codex first.",
      timestamp: Date.now(),
    }});
    handlers?.setView("chat");
    return;
  }

  handlers?.setMascot("tool", "orchestrating…");

  const startTimes: Record<string, number> = {};
  for (const id of available) startTimes[id] = Date.now();

  // Track accumulated text per agent so we can update via updateBridgeColumn
  const colText: Record<string, string> = {};

  const result = await coordinator.run(prompt, (evt) => {
    if (evt.kind === "token" && evt.text) {
      colText[evt.agentId] = (colText[evt.agentId] ?? "") + evt.text;
      handlers?.updateBridgeColumn?.(evt.agentId, { text: colText[evt.agentId] });
    }
    if (evt.kind === "done" || evt.kind === "error") {
      handlers?.updateBridgeColumn?.(evt.agentId, {
        done: true,
        durationMs: Date.now() - (startTimes[evt.agentId] ?? Date.now()),
      });
    }
  });

  // Mark winner
  if (result.winner) {
    handlers?.updateBridgeColumn?.(result.winner, { winner: true });
  }

  // Post final result to chat as well
  handlers?.dispatch({ type: "add", entry: {
    id: `bridge-result-${Date.now()}`,
    role: "assistant",
    text: result.finalText,
    timestamp: Date.now(),
  }});

  handlers?.setMascot("celebrate", "bridge done!");
  setTimeout(() => handlers?.setMascot("idle", "ready"), 2000);

  await coordinator.stop();
}

// ── Tree node mapping ─────────────────────────────────────────────────────────
function mapTreeNodes(roots: Array<{ session: SessionRecord; children: unknown[] }>): TreeNode[] {
  function map(node: { session: SessionRecord; children: unknown[] }): TreeNode {
    return {
      id: node.session.id,
      title: node.session.title,
      updatedAt: node.session.updatedAt,
      costUsd: node.session.costUsd,
      forkOf: node.session.forkOf,
      forkTurn: node.session.forkTurn,
      children: (node.children as Array<{ session: SessionRecord; children: unknown[] }>).map(map),
    };
  }
  return roots.map(map);
}

// ── Slash commands ────────────────────────────────────────────────────────────
async function handleSlashCommand(
  input: string,
  config: EllaConfig,
  session: SessionRecord,
  handlers: AppHandlers | null,
  provider: ReturnType<typeof createProvider>,
  cwd: string,
  refreshTree: () => Promise<void>,
  undoJournal: UndoJournal,
  currentTurn: number,
  pluginManager?: PluginManager,
  mcpManager?: McpManager,
): Promise<void> {
  const [cmd, ...rest] = input.slice(1).split(" ");
  const arg = rest.join(" ").trim();

  const push = (text: string, role: "system" | "error" = "system") => {
    handlers?.dispatch({ type: "add", entry: {
      id: `sys-${Date.now()}`,
      role,
      text,
      timestamp: Date.now(),
    }});
  };

  switch (cmd?.toLowerCase()) {
    case "help":
      push([
        "/help              — this message",
        "/clear             — clear chat",
        "/session list      — list sessions",
        "/session new       — start fresh",
        "/model <name>      — switch model",
        "/provider <n>      — switch provider",
        "/mode <mode>       — thinking mode (fast/balanced/deep/max)",
        "/bridge <task>     — run bridge (opencode+gemini+codex)",
        "/fork [turn]       — fork session at turn",
        "/tree              — session fork tree  (Ctrl+3)",
        "/heatmap           — file touch heatmap  (Ctrl+2)",
        "/pair <prompt>     — two providers side-by-side  (Ctrl+4)",
        "/bridge <task>     — race bridge panel          (Ctrl+5)",
        "/eval              — replay session, score drift",
        "/budget <usd>      — set cost budget",
        "/undo              — undo last file write",
        "/redo              — redo last undone write",
        "/remember <text>   — add to project memory",
        "/memory            — show project memory",
        "/skills            — list loaded skills",
        "/plugins           — list loaded plugins",
        "/mcp               — list connected MCP servers + tools",
        "/diff [path]       — show git diff in viewer",
        "/plan              — export session as .ella-plan.yaml",
        "/cost              — show cost summary",
        "/tag <label>       — tag session",
        "/exit              — quit",
      ].join("\n"));
      break;

    case "clear":
      handlers?.dispatch({ type: "clear" });
      break;

    case "cost":
      push(`Session: ↑${session.totalInputTokens} ↓${session.totalOutputTokens} tokens  |  ${formatCost(session.costUsd)}${session.budgetUsd ? `  budget: ${formatCost(session.budgetUsd)}` : ""}`);
      break;

    case "exit":
    case "quit":
      process.exit(0);

    case "session":
      if (arg === "list") {
        const sessions = await listSessions();
        push(formatSessionList(sessions));
      } else if (arg === "new") {
        session.messages = [];
        push("Session cleared. Fresh context.");
      }
      break;

    case "model":
      if (arg) {
        config.defaultModel = arg;
        await saveConfig(config);
        push(`Model → ${arg}`);
      } else {
        push(`Current model: ${config.defaultModel}`);
      }
      break;

    case "provider":
      if (arg) {
        try {
          config.defaultProvider = providerFromString(arg) as ProviderName;
          config.defaultModel = config.providers[config.defaultProvider]?.defaultModel ?? config.defaultModel;
          await saveConfig(config);
          push(`Provider → ${arg} / ${config.defaultModel}`);
        } catch (e) { push(String(e), "error"); }
      }
      break;

    case "mode":
      if (arg) {
        try {
          config.thinkingMode = thinkingModeFromString(arg);
          await saveConfig(config);
          push(`Thinking mode → ${arg}`);
        } catch (e) { push(String(e), "error"); }
      }
      break;

    case "undo": {
      if (!undoJournal.canUndo()) { push("Nothing to undo."); break; }
      const record = await undoJournal.undo();
      if (record) push(`Undone: ${record.tool} on ${record.path}`);
      break;
    }

    case "redo": {
      if (!undoJournal.canRedo()) { push("Nothing to redo."); break; }
      const record = await undoJournal.redo();
      if (record) push(`Redone: ${record.tool} on ${record.path}`);
      break;
    }

    case "remember": {
      if (!arg) { push("Usage: /remember <text>", "error"); break; }
      await addMemory(cwd, arg, "user", { sessionId: session.id, turnIndex: currentTurn });
      push(`Remembered: ${arg}`);
      break;
    }

    case "memory": {
      const mem = await readMemory(cwd);
      push(mem || "No project memory yet. Use /remember <text> to add.");
      break;
    }

    case "skills": {
      const skills = await loadSkills(cwd);
      if (!skills.length) push("No skills loaded. Add .md files to .ella/skills/ or ~/.ella/skills/");
      else push(`Skills (${skills.length}):\n${skills.map((s) => `  ${s.name}${s.description ? ` — ${s.description}` : ""}${s.trigger ? ` [trigger: ${s.trigger}]` : ""}`).join("\n")}`);
      break;
    }

    case "plan": {
      const outPath = await exportPlan(session, cwd);
      push(`Plan exported: ${outPath}`);
      break;
    }

    case "fork": {
      const conversationMessages = session.messages.filter((m) => m.role !== "system");
      const totalTurns = Math.floor(conversationMessages.length / 2);
      if (totalTurns === 0) { push("No turns to fork from.", "error"); break; }
      const turnArg = arg ? parseInt(arg, 10) : totalTurns - 1;
      if (isNaN(turnArg) || turnArg < 0 || turnArg >= totalTurns) {
        push(`Invalid turn. Session has ${totalTurns} turn(s) (0-${totalTurns - 1}).`, "error");
        break;
      }
      const fork = await forkSession(session, turnArg);
      push(`Forked session at turn ${turnArg}. New ID: ${fork.id}\nResume with: ella --session ${fork.id}`);
      await refreshTree();
      handlers?.setView("tree");
      break;
    }

    case "tree":
      await refreshTree();
      handlers?.setView("tree");
      break;

    case "heatmap":
      handlers?.setHeatmap(topTouchedFiles(session));
      handlers?.setView("heatmap");
      break;

    case "pair": {
      if (!arg) { push("Usage: /pair <prompt>", "error"); break; }

      const providerBName = (config.defaultProvider === "anthropic" ? "openai" : "anthropic") as ProviderName;
      const modelB = config.providers[providerBName]?.defaultModel ?? "gpt-4o";
      const providerB = createProvider({ ...config, defaultProvider: providerBName, defaultModel: modelB }, providerBName);

      push(`Pair run: ${config.defaultProvider}/${config.defaultModel} vs ${providerBName}/${modelB}`);
      handlers?.setMascot("think", "pair mode…");
      handlers?.setView("pair");

      const runner = new PairRunner(provider, providerB, config, modelB);
      try {
        const result = await runner.run(arg, cwd);
        const entry: PairEntry = {
          id: `pair-${Date.now()}`,
          prompt: arg,
          providerA: result.providerA,
          modelA: result.modelA,
          textA: result.textA,
          providerB: result.providerB,
          modelB: result.modelB,
          textB: result.textB,
          costUsd: result.costUsd,
          elapsedMs: result.elapsedMs,
        };
        handlers?.addPairEntry(entry);
        handlers?.setTokens(result.inputTokens, result.outputTokensA + result.outputTokensB, result.costUsd);
        push(`Pair done in ${(result.elapsedMs / 1000).toFixed(1)}s — cost ${formatCost(result.costUsd)}`);
      } catch (e) {
        push(`Pair failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
      handlers?.setMascot("idle", "ready");
      break;
    }

    case "eval": {
      const userTurns = session.messages.filter((m) => m.role === "user").length;
      if (userTurns === 0) { push("No turns to replay.", "error"); break; }

      push(`Replaying ${userTurns} turn(s) for drift analysis…`);
      handlers?.setMascot("tool", "eval replay…");

      const evalRunner = new EvalRunner(provider, config);
      try {
        const result = await evalRunner.run(session, (turn, total) => push(`  turn ${turn + 1}/${total}…`));
        push([
          `Eval complete — model: ${result.model}`,
          `Avg similarity: ${(result.avgSimilarity * 100).toFixed(1)}%  |  Drift: ${(result.driftScore * 100).toFixed(1)}%`,
          "",
          ...result.turns.map((t) =>
            `  t${t.turnIndex}: sim=${(t.similarity * 100).toFixed(0)}%  "${t.prompt.slice(0, 50)}"`
          ),
        ].join("\n"));
      } catch (e) {
        push(`Eval failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
      handlers?.setMascot("idle", "ready");
      break;
    }

    case "budget": {
      if (!arg) {
        push(`Current budget: ${session.budgetUsd ? formatCost(session.budgetUsd) : "none"}`);
        break;
      }
      const amount = parseFloat(arg);
      if (isNaN(amount) || amount <= 0) { push("Usage: /budget <amount>  e.g. /budget 0.50", "error"); break; }
      session.budgetUsd = amount;
      await saveSession(session);
      push(`Budget set: ${formatCost(amount)} — warn at 80%, abort at 100%.`);
      break;
    }

    case "tag": {
      if (!arg) { push("Usage: /tag <label>", "error"); break; }
      if (!session.tags) session.tags = [];
      session.tags.push(arg);
      await saveSession(session);
      push(`Tagged: ${session.tags.join(", ")}`);
      break;
    }

    case "plugins": {
      const list = pluginManager?.list() ?? [];
      push(list.length ? `Plugins:\n${list.map((p) => `  ${p}`).join("\n")}` : "No plugins loaded. Add .js files to .ella/plugins/ or ~/.ella/plugins/");
      break;
    }

    case "mcp": {
      if (!mcpManager || !mcpManager.serverCount()) { push("No MCP servers connected."); break; }
      const tools = mcpManager.allTools();
      push(`MCP: ${mcpManager.serverCount()} server(s), ${tools.length} tool(s)\n${tools.map((t) => `  [${t.serverName}] ${t.name}${t.description ? ` — ${t.description}` : ""}`).join("\n")}`);
      break;
    }

    case "diff": {
      const { execSync } = await import("node:child_process");
      try {
        const diffOutput = execSync(`git diff${arg ? ` -- ${arg}` : ""}`, { cwd, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 }).trim();
        if (!diffOutput) { push("No diff."); break; }
        handlers?.dispatch({ type: "add", entry: {
          id: `diff-${Date.now()}`,
          role: "tool",
          text: `git diff${arg ? ` ${arg}` : ""}`,
          diff: diffOutput,
          toolName: "git_diff",
          timestamp: Date.now(),
        }});
      } catch (e) {
        push(`diff failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
      break;
    }

    default:
      push(`Unknown command: /${cmd ?? ""}. Type /help for commands.`, "error");
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Sub-commands (no config needed)
  const [firstArg] = args;

  if (firstArg === "init") { await runInit(); return; }
  if (firstArg === "mcp") { await runMcp(args.slice(1)); return; }
  if (firstArg === "config") { await runConfig(args.slice(1)); return; }

  const config = await loadConfig();

  const providerArg = flagValue("provider") ?? flagValue("p");
  if (providerArg) config.defaultProvider = providerFromString(providerArg) as ProviderName;

  const modelArg = flagValue("model") ?? flagValue("m");
  if (modelArg) config.defaultModel = modelArg;

  const modeArg = flagValue("mode");
  if (modeArg) config.thinkingMode = thinkingModeFromString(modeArg);

  const approvalArg = flagValue("approval");
  if (approvalArg) config.approvalMode = approvalModeFromString(approvalArg);

  if (flag("help") || flag("h") || firstArg === "help") {
    printBanner();
    stdout.write([
      "Usage:",
      "  ella [options] [prompt]",
      "  ella init                         set up .ella/ in current project",
      "  ella mcp list                     list configured MCP servers",
      "  ella mcp add <name> <cmd> [args]  add an MCP server",
      "  ella mcp remove <name>            remove an MCP server",
      "  ella config show                  show current config",
      "  ella config set <key> <value>     set a config value",
      "",
      "Options:",
      "  -p, --provider <name>    openai | anthropic | gemini | openrouter",
      "  -m, --model <name>       model name",
      "  --mode <mode>            fast | balanced | deep | max",
      "  --approval <mode>        ask | auto-edit | full-auto | read-only",
      "  --bridge <prompt>        orchestrate opencode+codex+gemini on a prompt",
      "  --bridge-mode <mode>     route | race | debate (default: race)",
      "  --bridge-agents <list>   comma-separated: opencode,gemini,codex",
      "  --session <id>           resume a session by ID",
      "  --resume [last]          resume the most recent session",
      "",
      "TUI panels (Ctrl+1-5):     Chat  Heatmap  Tree  Pair  Bridge",
      "",
      "Interactive slash commands:",
      "  /help /clear /session /model /provider /mode",
      "  /bridge /fork /tree /heatmap /pair /eval /budget",
      "  /undo /redo /remember /memory /skills /plan /tag /cost /exit",
      "",
    ].join("\n"));
    process.exit(0);
  }

  const bridgePrompt = flagValue("bridge");
  if (bridgePrompt) { await runBridge(bridgePrompt); return; }

  const promptArg = flagValue("prompt") ?? flagValue("q");
  const positional = args.filter((a) => !a.startsWith("-")).join(" ").trim();

  if (promptArg || (!stdout.isTTY && positional)) {
    await runHeadless(config, promptArg ?? positional);
    return;
  }

  await runTui(config);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
