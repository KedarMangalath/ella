#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  apiKeyForProvider,
  approvalModeFromString,
  applyAccessibilityEnvironment,
  configPath,
  envKeyForProvider,
  loadConfig,
  maskedConfig,
  saveConfig,
} from "./config.js";
import { createProvider } from "./providers.js";
import { EllaAgent } from "./agent.js";
import { DEFAULT_MODELS, MODEL_CATALOG, providerFromString, thinkingModeFromString } from "./models.js";
import type { EllaConfig, ProviderName } from "./types.js";
import { initProject, readProjectInstructions } from "./project.js";
import { toolHelp } from "./tools.js";
import {
  addMemory,
  addTodo,
  clearMemory,
  clearTodos,
  completeTodo,
  formatTodos,
  readMemory,
  readTodos,
} from "./memory.js";
import {
  appendPair,
  createSession,
  formatSessionList,
  latestSession,
  listSessions,
  loadSession,
  saveSession,
} from "./session.js";
import { kv, slashCommandHelp, theme } from "./theme.js";
import { ellaStill } from "./animation.js";
import { redoLast, undoLast, undoStatus } from "./undo.js";
import { buildGraph, graphImpact, graphSearch, graphStats } from "./graph.js";
import { formatSubagents, swarmPrompt } from "./subagents.js";
import type { SessionRecord } from "./types.js";

const args = process.argv.slice(2);

function printHelp(): void {
  output.write(`${theme.brand("Ella CLI")}

${theme.header("Usage")}
  ${theme.command("ella")}
  ${theme.command("ella ask <prompt>")}
  ${theme.command("ella setup")}
  ${theme.command("ella commands")}
  ${theme.command("ella status")}
  ${theme.command("ella sessions")}
  ${theme.command("ella continue [prompt]")}
  ${theme.command("ella resume [session-id]")}
  ${theme.command("ella key <status|set|delete> [provider]")}
  ${theme.command("ella provider <provider>")}
  ${theme.command("ella model <name-or-number>")}
  ${theme.command("ella think <fast|balanced|deep|max>")}
  ${theme.command("ella approval <ask|auto-edit|full-auto|read-only>")}
  ${theme.command("ella base-url <provider> <url>")}
  ${theme.command("ella memory <show|add|clear>")}
  ${theme.command("ella todo <list|add|done|clear>")}
  ${theme.command("ella undo|redo|history")}
  ${theme.command("ella graph <build|stats|search|impact>")}
  ${theme.command("ella agents")}
  ${theme.command("ella swarm <task>")}
  ${theme.command("ella accessibility <show|set>")}
  ${theme.command("ella plan <task>")}
  ${theme.command("ella review [focus]")}
  ${theme.command("ella fix <problem>")}
  ${theme.command("ella explain <topic>")}
  ${theme.command("ella init")}
  ${theme.command("ella models [provider]")}
  ${theme.command("ella tools")}
  ${theme.command("ella doctor")}
  ${theme.command("ella config show")}
  ${theme.command("ella config set-key <provider> [key]")}
  ${theme.command("ella config delete-key <provider>")}
  ${theme.command("ella config set-base-url <provider> <url>")}
  ${theme.command("ella config set-provider <provider>")}
  ${theme.command("ella config set-model <model>")}
  ${theme.command("ella config set-thinking <fast|balanced|deep|max>")}
  ${theme.command("ella config set-approval <ask|auto-edit|full-auto|read-only>")}

${theme.header("Providers")} ${theme.accent("openai, anthropic, gemini, openrouter")}
${theme.muted("Tip: you can also type plain English, e.g. ella fix the failing tests")}
`);
}

async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(theme.prompt(question));
  } finally {
    rl.close();
  }
}

function boolFromString(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["true", "on", "yes", "1"].includes(normalized)) return true;
  if (["false", "off", "no", "0"].includes(normalized)) return false;
  return null;
}

function requireProvider(value: string): ProviderName {
  const provider = providerFromString(value);
  if (!provider) throw new Error(`Unknown provider: ${value}`);
  return provider;
}

function isInteractiveTerminal(): boolean {
  return Boolean(input.isTTY && output.isTTY);
}

function keyStatus(config: EllaConfig, provider: ProviderName): string {
  const envKey = envKeyForProvider(provider);
  const storedKey = config.providers[provider]?.apiKey;
  if (envKey && storedKey) return "env + stored";
  if (envKey) return "env";
  if (storedKey) return "stored";
  return "missing";
}

function renderModels(provider: ProviderName): string {
  return `${provider}:\n${MODEL_CATALOG[provider].map((model, index) => `${index + 1}. ${model}`).join("\n")}\n`;
}

function pickModel(provider: ProviderName, answer: string): string | null {
  const trimmed = answer.trim();
  if (!trimmed) return null;
  const asIndex = Number(trimmed);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= MODEL_CATALOG[provider].length) {
    return MODEL_CATALOG[provider][asIndex - 1] ?? null;
  }
  return trimmed;
}

async function readPipedInput(): Promise<string> {
  if (input.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function promptFromArgs(startIndex: number): Promise<string> {
  const typed = args.slice(startIndex).join(" ").trim();
  const piped = await readPipedInput();
  return [typed, piped].filter(Boolean).join("\n\n");
}

function statusText(config: EllaConfig): string {
  return `${kv("Provider", config.defaultProvider)}
${kv("Model", config.defaultModel)}
${kv("Thinking", config.thinkingMode)}
${kv("Approval", config.approvalMode)}
${kv("Key", keyStatus(config, config.defaultProvider))}
${kv("Config", configPath())}`;
}

function nextSteps(config: EllaConfig): string {
  if (keyStatus(config, config.defaultProvider) === "missing") {
    return `${theme.warning("Next:")} ${theme.command("ella setup")} ${theme.muted("or")} ${theme.command("ella key set")}`;
  }
  return `${theme.success("Ready.")} ${theme.command("ella \"fix the failing tests\"")} ${theme.muted("or")} ${theme.command("ella review")}`;
}

async function doctor(config: EllaConfig): Promise<void> {
  output.write(`${theme.header("Ella Doctor")}\n`);
  output.write(`${statusText(config)}\n`);
  output.write(`${kv("Node", process.version)}\n`);
  output.write(`${kv("CWD", process.cwd())}\n`);
  output.write(`${kv("Sessions", String((await listSessions()).length))}\n`);
  output.write(`${kv("Undo", await undoStatus(process.cwd()))}\n`);
  output.write(`${nextSteps(config)}\n`);
}

async function setupWizard(config: EllaConfig): Promise<void> {
  output.write(`\n${ellaStill("setup")}\n`);
  output.write(`${theme.brand("Ella setup")}\n`);
  output.write(`${theme.muted("Paste key here once. Ella remembers it in global config.")}\n\n`);

  output.write(`${theme.header("Providers")}\n${theme.command("1. openai")}\n${theme.command("2. anthropic")}\n${theme.command("3. gemini")}\n${theme.command("4. openrouter")}\n`);
  const providerAnswer = await promptLine(`Provider (${config.defaultProvider}): `);
  const providerByIndex: ProviderName[] = ["openai", "anthropic", "gemini", "openrouter"];
  const provider =
    providerAnswer.trim()
      ? providerByIndex[Number(providerAnswer.trim()) - 1] || requireProvider(providerAnswer)
      : config.defaultProvider;

  config.defaultProvider = provider;

  const currentKeyStatus = keyStatus(config, provider);
  const key = await promptLine(`API key for ${provider} [${currentKeyStatus}; Enter keep/skip]: `);
  if (key.trim()) {
    config.providers[provider] = { ...config.providers[provider], apiKey: key.trim() };
  }

  output.write(`\n${renderModels(provider)}`);
  const currentModel = config.providers[provider].defaultModel || DEFAULT_MODELS[provider];
  const modelAnswer = await promptLine(`Model name or number (${currentModel}): `);
  const selectedModel = pickModel(provider, modelAnswer) || currentModel;
  config.defaultModel = selectedModel;
  config.providers[provider].defaultModel = selectedModel;

  const thinkingAnswer = await promptLine(`Thinking mode (${config.thinkingMode}) [fast/balanced/deep/max]: `);
  if (thinkingAnswer.trim()) {
    const mode = thinkingModeFromString(thinkingAnswer);
    if (!mode) throw new Error("Invalid thinking mode.");
    config.thinkingMode = mode;
  }

  const approvalAnswer = await promptLine(`Approval mode (${config.approvalMode}) [ask/auto-edit/full-auto/read-only]: `);
  if (approvalAnswer.trim()) {
    const mode = approvalModeFromString(approvalAnswer);
    if (!mode) throw new Error("Invalid approval mode.");
    config.approvalMode = mode;
  }

  await saveConfig(config);
  output.write(`\n${theme.success("Saved.")} Active: ${theme.accent(`${config.defaultProvider}/${config.defaultModel}`)}, thinking=${theme.accent(config.thinkingMode)}, approval=${theme.accent(config.approvalMode)}\n\n`);
}

async function ensureConfigured(config: EllaConfig): Promise<void> {
  if (apiKeyForProvider(config, config.defaultProvider)) return;
  if (!isInteractiveTerminal()) {
    throw new Error(`Missing API key for ${config.defaultProvider}. Run: ella setup`);
  }
  await setupWizard(config);
  if (!apiKeyForProvider(config, config.defaultProvider)) {
    throw new Error(`Missing API key for ${config.defaultProvider}. Add one with /key set or ella config set-key.`);
  }
}

async function contextPrefix(cwd: string): Promise<string> {
  const [instructions, memory, todos] = await Promise.all([
    readProjectInstructions(cwd),
    readMemory(cwd),
    readTodos(cwd),
  ]);
  const parts: string[] = [];
  if (instructions) parts.push(`Project instructions:\n${instructions}`);
  if (memory) parts.push(`Project memory:\n${memory}`);
  const pendingTodos = todos.filter((todo) => todo.status !== "done");
  if (pendingTodos.length) parts.push(`Project todos:\n${formatTodos(pendingTodos)}`);
  return parts.join("\n\n");
}

async function runAsk(config: EllaConfig, prompt: string): Promise<void> {
  await ensureConfigured(config);
  const session = await createSession(config, process.cwd());
  await runSessionPrompt(config, session, prompt);
  output.write(`${theme.muted(`Session saved: ${session.id}. Continue with: ella continue "..."`)}\n`);
}

async function runSessionPrompt(config: EllaConfig, session: SessionRecord, prompt: string): Promise<SessionRecord> {
  await ensureConfigured(config);
  const prefix = await contextPrefix(process.cwd());
  const fullPrompt = prefix ? `${prefix}\n\nUser request:\n${prompt}` : prompt;
  const provider = createProvider(config, config.defaultProvider);
  const agent = new EllaAgent(provider, config);
  const result = await agent.run({
    cwd: process.cwd(),
    prompt: fullPrompt,
    messages: session.messages,
  });
  appendPair(session, prompt, result.messages);
  session.cwd = process.cwd();
  session.provider = config.defaultProvider;
  session.model = config.defaultModel;
  session.thinkingMode = config.thinkingMode;
  await saveSession(session);
  return session;
}

async function interactive(config: EllaConfig, resumeSessionId?: string): Promise<void> {
  applyAccessibilityEnvironment(config);
  if (!apiKeyForProvider(config, config.defaultProvider)) {
    await setupWizard(config);
  }

  let session = resumeSessionId
    ? await loadSession(resumeSessionId)
    : await createSession(config, process.cwd());
  session.provider = config.defaultProvider;
  session.model = config.defaultModel;
  session.thinkingMode = config.thinkingMode;
  await saveSession(session);

  output.write(`${ellaStill("ready")}\n`);
  output.write(`${theme.brand("Ella")} ${theme.accent(`${config.defaultProvider}/${config.defaultModel}`)} ${theme.muted(`thinking=${config.thinkingMode} approval=${config.approvalMode}`)}\n`);
  output.write(`${kv("Session", `${session.id} (${session.title})`)}\n`);
  output.write(`${theme.muted("Type naturally, or use /commands. /exit quits.")}\n`);
  output.write(`${theme.muted("Useful starts: /fix <problem>, /review, /plan <task>, /key set.")}\n\n`);

  while (true) {
    const line = await promptLine("ella> ");
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "/exit" || trimmed === "/quit") return;
    if (trimmed === "/help" || trimmed === "/commands") {
      output.write(slashCommandHelp());
      continue;
    }
    if (trimmed === "/setup") {
      await setupWizard(config);
      continue;
    }
    if (trimmed === "/status") {
      output.write(`${statusText(config)}\n${kv("Session", `${session.id} (${session.title})`)}\n${nextSteps(config)}\n`);
      continue;
    }
    if (trimmed === "/sessions") {
      output.write(`${formatSessionList(await listSessions())}\n`);
      continue;
    }
    if (trimmed === "/continue" || trimmed.startsWith("/continue ")) {
      const extra = trimmed.slice("/continue".length).trim();
      const target = (await latestSession())?.id;
      if (!target) {
        output.write(`${theme.warning("No session to continue.")}\n`);
        continue;
      }
      session = await loadSession(target);
      if (extra) {
        session = await runSessionPrompt(config, session, extra);
      } else {
        output.write(`${theme.success("Continuing")} ${theme.accent(session.id)}: ${session.title}\n`);
      }
      continue;
    }
    if (trimmed === "/resume" || trimmed.startsWith("/resume ")) {
      const requested = trimmed.slice("/resume".length).trim();
      const target = requested || (await latestSession())?.id;
      if (!target) {
        output.write("No session to resume.\n");
        continue;
      }
      session = await loadSession(target);
      output.write(`${theme.success("Resumed")} ${theme.accent(session.id)}: ${session.title}\n`);
      continue;
    }
    if (trimmed === "/new") {
      session = await createSession(config, process.cwd());
      output.write(`${theme.success("New session")} ${theme.accent(session.id)}\n`);
      continue;
    }
    if (trimmed === "/config") {
      output.write(`${JSON.stringify(maskedConfig(config), null, 2)}\n`);
      continue;
    }
    if (trimmed === "/tools") {
      output.write(`${toolHelp()}\n`);
      continue;
    }
    if (trimmed === "/models" || trimmed.startsWith("/models ")) {
      const requested = trimmed.slice("/models".length).trim();
      const provider = requested ? requireProvider(requested) : config.defaultProvider;
      output.write(renderModels(provider));
      continue;
    }
    if (trimmed.startsWith("/provider ")) {
      const provider = requireProvider(trimmed.slice("/provider ".length));
      config.defaultProvider = provider;
      config.defaultModel = config.providers[provider].defaultModel || DEFAULT_MODELS[provider];
      session.provider = config.defaultProvider;
      session.model = config.defaultModel;
      session.thinkingMode = config.thinkingMode;
      await saveSession(session);
      await saveConfig(config);
      output.write(`${theme.success("Provider set:")} ${theme.accent(provider)}. Model: ${theme.accent(config.defaultModel)}. Key: ${theme.accent(keyStatus(config, provider))}\n`);
      continue;
    }
    if (trimmed.startsWith("/model ")) {
      const selectedModel = pickModel(config.defaultProvider, trimmed.slice("/model ".length));
      if (!selectedModel) {
        output.write(renderModels(config.defaultProvider));
        continue;
      }
      config.defaultModel = selectedModel;
      config.providers[config.defaultProvider].defaultModel = selectedModel;
      session.model = selectedModel;
      await saveSession(session);
      await saveConfig(config);
      output.write(`${theme.success("Model set:")} ${theme.accent(config.defaultModel)}\n`);
      continue;
    }
    if (trimmed.startsWith("/think ")) {
      const mode = thinkingModeFromString(trimmed.slice("/think ".length));
      if (!mode) {
        output.write("Use: fast, balanced, deep, max\n");
        continue;
      }
      config.thinkingMode = mode;
      session.thinkingMode = mode;
      await saveSession(session);
      await saveConfig(config);
      output.write(`${theme.success("Thinking mode set:")} ${theme.accent(mode)}\n`);
      continue;
    }
    if (trimmed.startsWith("/approval ")) {
      const mode = approvalModeFromString(trimmed.slice("/approval ".length));
      if (!mode) {
        output.write("Use: ask, auto-edit, full-auto, read-only\n");
        continue;
      }
      config.approvalMode = mode;
      await saveConfig(config);
      output.write(`${theme.success("Approval mode set:")} ${theme.accent(mode)}\n`);
      continue;
    }
    if (trimmed === "/memory show") {
      output.write(`${await readMemory(process.cwd()) || "No memory."}\n`);
      continue;
    }
    if (trimmed === "/memory clear") {
      await clearMemory(process.cwd());
      output.write(`${theme.success("Memory cleared.")}\n`);
      continue;
    }
    if (trimmed.startsWith("/memory add ")) {
      await addMemory(process.cwd(), trimmed.slice("/memory add ".length));
      output.write(`${theme.success("Memory added.")}\n`);
      continue;
    }
    if (trimmed === "/memory" || trimmed === "/memory add") {
      const text = await promptLine("Memory: ");
      if (text.trim()) {
        await addMemory(process.cwd(), text);
        output.write(`${theme.success("Memory added.")}\n`);
      }
      continue;
    }
    if (trimmed === "/todo list" || trimmed === "/todo") {
      output.write(`${formatTodos(await readTodos(process.cwd()))}\n`);
      continue;
    }
    if (trimmed === "/todo clear") {
      await clearTodos(process.cwd());
      output.write(`${theme.success("Todos cleared.")}\n`);
      continue;
    }
    if (trimmed.startsWith("/todo add ")) {
      const todo = await addTodo(process.cwd(), trimmed.slice("/todo add ".length));
      output.write(`${theme.success("Todo added:")} ${theme.accent(todo.id)}\n`);
      continue;
    }
    if (trimmed.startsWith("/todo done ")) {
      const todo = await completeTodo(process.cwd(), trimmed.slice("/todo done ".length).trim());
      output.write(todo ? `${theme.success("Todo done:")} ${theme.accent(todo.id)}\n` : `${theme.warning("Todo not found.")}\n`);
      continue;
    }
    if (trimmed === "/todo add") {
      const text = await promptLine("Todo: ");
      if (text.trim()) {
        const todo = await addTodo(process.cwd(), text);
        output.write(`${theme.success("Todo added:")} ${theme.accent(todo.id)}\n`);
      }
      continue;
    }
    if (trimmed === "/undo") {
      output.write(`${await undoLast(process.cwd())}\n`);
      continue;
    }
    if (trimmed === "/redo") {
      output.write(`${await redoLast(process.cwd())}\n`);
      continue;
    }
    if (trimmed === "/history") {
      output.write(`${await undoStatus(process.cwd())}\n`);
      continue;
    }
    if (trimmed === "/graph build") {
      output.write(`${await buildGraph(process.cwd())}\n`);
      continue;
    }
    if (trimmed === "/graph stats" || trimmed === "/graph") {
      output.write(`${await graphStats(process.cwd())}\n`);
      continue;
    }
    if (trimmed.startsWith("/graph search ")) {
      output.write(`${await graphSearch(process.cwd(), trimmed.slice("/graph search ".length))}\n`);
      continue;
    }
    if (trimmed.startsWith("/graph impact ")) {
      output.write(`${await graphImpact(process.cwd(), trimmed.slice("/graph impact ".length))}\n`);
      continue;
    }
    if (trimmed === "/agents") {
      output.write(`${formatSubagents()}\n`);
      continue;
    }
    if (trimmed.startsWith("/swarm ")) {
      session = await runSessionPrompt(config, session, swarmPrompt(trimmed.slice("/swarm ".length)));
      continue;
    }
    if (trimmed === "/accessibility") {
      output.write(`${JSON.stringify(config.accessibility, null, 2)}\n`);
      continue;
    }
    if (trimmed.startsWith("/accessibility ")) {
      const [, key, rawValue] = trimmed.split(/\s+/);
      if (!key || rawValue === undefined || !(key in config.accessibility)) {
        output.write(`${theme.warning("Use:")} ${theme.command("/accessibility <noColor|reducedMotion|highContrast|screenReader> <on|off>")}\n`);
        continue;
      }
      const value = boolFromString(rawValue);
      if (value === null) {
        output.write(`${theme.warning("Use on/off.")}\n`);
        continue;
      }
      config.accessibility[key as keyof typeof config.accessibility] = value;
      applyAccessibilityEnvironment(config);
      await saveConfig(config);
      output.write(`${theme.success("Accessibility updated.")}\n`);
      continue;
    }
    if (trimmed === "/key status") {
      for (const provider of Object.keys(config.providers) as ProviderName[]) {
        output.write(`${kv(provider, keyStatus(config, provider))}\n`);
      }
      continue;
    }
    if (trimmed === "/key set" || trimmed.startsWith("/key set ")) {
      const requested = trimmed.slice("/key set".length).trim();
      const provider = requested ? requireProvider(requested) : config.defaultProvider;
      const key = await promptLine(`Paste API key for ${provider}: `);
      if (!key.trim()) {
        output.write(`${theme.warning("No key saved.")}\n`);
        continue;
      }
      config.providers[provider] = { ...config.providers[provider], apiKey: key.trim() };
      await saveConfig(config);
      output.write(`${theme.success("Saved key for")} ${theme.accent(provider)}.\n`);
      continue;
    }
    if (trimmed === "/key delete" || trimmed.startsWith("/key delete ")) {
      const requested = trimmed.slice("/key delete".length).trim();
      const provider = requested ? requireProvider(requested) : config.defaultProvider;
      delete config.providers[provider].apiKey;
      await saveConfig(config);
      output.write(`${theme.success("Deleted stored key for")} ${theme.accent(provider)}. Env key status: ${theme.accent(envKeyForProvider(provider) ? "present" : "missing")}.\n`);
      continue;
    }
    if (trimmed.startsWith("/base-url ")) {
      const parts = trimmed.slice("/base-url ".length).trim().split(/\s+/);
      const provider = requireProvider(parts[0] || "");
      const url = parts.slice(1).join(" ").trim();
      if (!url) {
        output.write(`${theme.warning("Use:")} ${theme.command("/base-url <provider> <url>")}\n`);
        continue;
      }
      config.providers[provider] = { ...config.providers[provider], baseUrl: url };
      await saveConfig(config);
      output.write(`${theme.success("Base URL set for")} ${theme.accent(provider)}.\n`);
      continue;
    }
    if (trimmed.startsWith("/plan ")) {
      session = await runSessionPrompt(config, session, `Create a concrete implementation plan for this task. Read relevant files first if needed. Task: ${trimmed.slice("/plan ".length)}`);
      continue;
    }
    if (trimmed === "/review" || trimmed.startsWith("/review ")) {
      const focus = trimmed.slice("/review".length).trim();
      session = await runSessionPrompt(config, session, `Review this repository or current git diff. Prioritize bugs, regressions, missing tests, and risky design issues. Focus: ${focus || "general code review"}`);
      continue;
    }
    if (trimmed.startsWith("/fix ")) {
      session = await runSessionPrompt(config, session, `Debug and fix this problem end to end. Read files, edit safely, and run relevant checks. Problem: ${trimmed.slice("/fix ".length)}`);
      continue;
    }
    if (trimmed.startsWith("/explain ")) {
      session = await runSessionPrompt(config, session, `Explain this using repository context. Read relevant files first if useful. Topic: ${trimmed.slice("/explain ".length)}`);
      continue;
    }

    try {
      session = await runSessionPrompt(config, session, trimmed);
    } catch (error) {
      output.write(`${theme.danger("Error:")} ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

async function handleConfig(config: EllaConfig, subArgs: string[]): Promise<void> {
  const [command, ...rest] = subArgs;
  switch (command) {
    case "show":
    case undefined:
      output.write(`${JSON.stringify(maskedConfig(config), null, 2)}\n`);
      output.write(`${kv("Config", configPath())}\n`);
      return;
    case "set-key": {
      const provider = requireProvider(rest[0] || "");
      const key = rest[1] || await promptLine(`API key for ${provider}: `);
      config.providers[provider] = { ...config.providers[provider], apiKey: key.trim() };
      if (!config.providers[provider].defaultModel) {
        config.providers[provider].defaultModel = DEFAULT_MODELS[provider];
      }
      await saveConfig(config);
      output.write(`${theme.success("Saved key for")} ${theme.accent(provider)}.\n`);
      return;
    }
    case "delete-key":
    case "remove-key":
    case "clear-key": {
      const provider = requireProvider(rest[0] || "");
      delete config.providers[provider].apiKey;
      await saveConfig(config);
      output.write(`${theme.success("Deleted stored key for")} ${theme.accent(provider)}. Env key status: ${theme.accent(envKeyForProvider(provider) ? "present" : "missing")}.\n`);
      return;
    }
    case "key-status": {
      for (const provider of Object.keys(config.providers) as ProviderName[]) {
        output.write(`${kv(provider, keyStatus(config, provider))}\n`);
      }
      return;
    }
    case "set-base-url": {
      const provider = requireProvider(rest[0] || "");
      const url = rest.slice(1).join(" ").trim();
      if (!url) throw new Error("Missing base URL.");
      config.providers[provider] = { ...config.providers[provider], baseUrl: url };
      await saveConfig(config);
      output.write(`${theme.success("Base URL set for")} ${theme.accent(provider)}.\n`);
      return;
    }
    case "set-provider": {
      const provider = requireProvider(rest[0] || "");
      config.defaultProvider = provider;
      config.defaultModel = config.providers[provider].defaultModel || DEFAULT_MODELS[provider];
      await saveConfig(config);
      output.write(`${theme.success("Provider set:")} ${theme.accent(provider)}. Model set: ${theme.accent(config.defaultModel)}.\n`);
      return;
    }
    case "set-model": {
      const model = rest.join(" ").trim();
      if (!model) throw new Error("Missing model.");
      config.defaultModel = model;
      config.providers[config.defaultProvider].defaultModel = model;
      await saveConfig(config);
      output.write(`${theme.success("Model set:")} ${theme.accent(model)}.\n`);
      return;
    }
    case "set-thinking": {
      const mode = thinkingModeFromString(rest[0] || "");
      if (!mode) throw new Error("Use thinking mode: fast, balanced, deep, max.");
      config.thinkingMode = mode;
      await saveConfig(config);
      output.write(`${theme.success("Thinking mode set:")} ${theme.accent(mode)}.\n`);
      return;
    }
    case "set-approval": {
      const mode = approvalModeFromString(rest[0] || "");
      if (!mode) throw new Error("Use approval mode: ask, auto-edit, full-auto, read-only.");
      config.approvalMode = mode;
      await saveConfig(config);
      output.write(`${theme.success("Approval mode set:")} ${theme.accent(mode)}.\n`);
      return;
    }
    default:
      throw new Error(`Unknown config command: ${command}`);
  }
}

async function handleKey(config: EllaConfig, subArgs: string[]): Promise<void> {
  const action = subArgs[0] || "status";
  if (action === "status") {
    for (const provider of Object.keys(config.providers) as ProviderName[]) {
      output.write(`${kv(provider, keyStatus(config, provider))}\n`);
    }
    return;
  }
  if (action === "set" || action === "add") {
    const provider = subArgs[1] ? requireProvider(subArgs[1]) : config.defaultProvider;
    const key = subArgs.slice(2).join(" ").trim() || await promptLine(`Paste API key for ${provider}: `);
    if (!key.trim()) throw new Error("No key provided.");
    config.providers[provider] = { ...config.providers[provider], apiKey: key.trim() };
    await saveConfig(config);
    output.write(`${theme.success("Saved key for")} ${theme.accent(provider)}.\n`);
    return;
  }
  if (action === "delete" || action === "remove" || action === "clear") {
    const provider = subArgs[1] ? requireProvider(subArgs[1]) : config.defaultProvider;
    delete config.providers[provider].apiKey;
    await saveConfig(config);
    output.write(`${theme.success("Deleted stored key for")} ${theme.accent(provider)}. Env key status: ${theme.accent(envKeyForProvider(provider) ? "present" : "missing")}.\n`);
    return;
  }
  throw new Error("Use: ella key <status|set|delete> [provider]");
}

async function main(): Promise<void> {
  const config = await loadConfig();
  applyAccessibilityEnvironment(config);
  const command = args[0];

  try {
    switch (command) {
      case undefined:
        if (!input.isTTY) {
          const piped = await readPipedInput();
          if (piped) {
            await runAsk(config, piped);
            return;
          }
        }
        await interactive(config);
        return;
      case "help":
      case "--help":
      case "-h":
        printHelp();
        return;
      case "ask":
      case "run": {
        const prompt = await promptFromArgs(1);
        if (!prompt) throw new Error("Missing prompt.");
        await runAsk(config, prompt);
        return;
      }
      case "setup":
        await setupWizard(config);
        return;
      case "commands":
        output.write(slashCommandHelp());
        return;
      case "status":
        output.write(`${statusText(config)}\n${nextSteps(config)}\n`);
        return;
      case "quickstart":
      case "ready":
        output.write(`${statusText(config)}\n${nextSteps(config)}\n\n`);
        printHelp();
        return;
      case "sessions":
        output.write(`${formatSessionList(await listSessions())}\n`);
        return;
      case "continue": {
        const latest = await latestSession();
        if (!latest) throw new Error("No session to continue.");
        const prompt = await promptFromArgs(1);
        if (prompt) {
          await runSessionPrompt(config, latest, prompt);
          return;
        }
        await interactive(config, latest.id);
        return;
      }
      case "resume": {
        const target = args[1] || (await latestSession())?.id;
        if (!target) throw new Error("No session to resume.");
        await interactive(config, target);
        return;
      }
      case "memory": {
        const action = args[1] || "show";
        if (action === "show") {
          output.write(`${await readMemory(process.cwd()) || "No memory."}\n`);
          return;
        }
        if (action === "add") {
          const text = args.slice(2).join(" ").trim() || await promptLine("Memory: ");
          if (!text.trim()) throw new Error("Missing memory text.");
          await addMemory(process.cwd(), text);
          output.write(`${theme.success("Memory added.")}\n`);
          return;
        }
        if (action === "clear") {
          await clearMemory(process.cwd());
          output.write(`${theme.success("Memory cleared.")}\n`);
          return;
        }
        throw new Error("Use: ella memory <show|add|clear>");
      }
      case "todo": {
        const action = args[1] || "list";
        if (action === "list") {
          output.write(`${formatTodos(await readTodos(process.cwd()))}\n`);
          return;
        }
        if (action === "add") {
          const text = args.slice(2).join(" ").trim() || await promptLine("Todo: ");
          if (!text.trim()) throw new Error("Missing todo text.");
          const todo = await addTodo(process.cwd(), text);
          output.write(`${theme.success("Todo added:")} ${theme.accent(todo.id)}\n`);
          return;
        }
        if (action === "done") {
          const todo = await completeTodo(process.cwd(), args[2] || "");
          output.write(todo ? `${theme.success("Todo done:")} ${theme.accent(todo.id)}\n` : `${theme.warning("Todo not found.")}\n`);
          return;
        }
        if (action === "clear") {
          await clearTodos(process.cwd());
          output.write(`${theme.success("Todos cleared.")}\n`);
          return;
        }
        throw new Error("Use: ella todo <list|add|done|clear>");
      }
      case "undo":
        output.write(`${await undoLast(process.cwd())}\n`);
        return;
      case "redo":
        output.write(`${await redoLast(process.cwd())}\n`);
        return;
      case "history":
        output.write(`${await undoStatus(process.cwd())}\n`);
        return;
      case "graph": {
        const action = args[1] || "stats";
        if (action === "build") {
          output.write(`${await buildGraph(process.cwd())}\n`);
          return;
        }
        if (action === "stats") {
          output.write(`${await graphStats(process.cwd())}\n`);
          return;
        }
        if (action === "search") {
          output.write(`${await graphSearch(process.cwd(), args.slice(2).join(" "))}\n`);
          return;
        }
        if (action === "impact") {
          output.write(`${await graphImpact(process.cwd(), args.slice(2).join(" "))}\n`);
          return;
        }
        throw new Error("Use: ella graph <build|stats|search|impact>");
      }
      case "agents":
        output.write(`${formatSubagents()}\n`);
        return;
      case "swarm": {
        const task = await promptFromArgs(1);
        if (!task) throw new Error("Missing task.");
        await runAsk(config, swarmPrompt(task));
        return;
      }
      case "key":
        await handleKey(config, args.slice(1));
        return;
      case "provider": {
        const provider = requireProvider(args[1] || "");
        config.defaultProvider = provider;
        config.defaultModel = config.providers[provider].defaultModel || DEFAULT_MODELS[provider];
        await saveConfig(config);
        output.write(`${theme.success("Provider set:")} ${theme.accent(provider)}. Model: ${theme.accent(config.defaultModel)}. Key: ${theme.accent(keyStatus(config, provider))}\n`);
        return;
      }
      case "model": {
        const selectedModel = pickModel(config.defaultProvider, args.slice(1).join(" "));
        if (!selectedModel) {
          output.write(renderModels(config.defaultProvider));
          return;
        }
        config.defaultModel = selectedModel;
        config.providers[config.defaultProvider].defaultModel = selectedModel;
        await saveConfig(config);
        output.write(`${theme.success("Model set:")} ${theme.accent(config.defaultModel)}\n`);
        return;
      }
      case "think": {
        const mode = thinkingModeFromString(args[1] || "");
        if (!mode) throw new Error("Use: ella think <fast|balanced|deep|max>");
        config.thinkingMode = mode;
        await saveConfig(config);
        output.write(`${theme.success("Thinking mode set:")} ${theme.accent(mode)}\n`);
        return;
      }
      case "approval": {
        const mode = approvalModeFromString(args[1] || "");
        if (!mode) throw new Error("Use: ella approval <ask|auto-edit|full-auto|read-only>");
        config.approvalMode = mode;
        await saveConfig(config);
        output.write(`${theme.success("Approval mode set:")} ${theme.accent(mode)}\n`);
        return;
      }
      case "base-url": {
        const provider = requireProvider(args[1] || "");
        const url = args.slice(2).join(" ").trim();
        if (!url) throw new Error("Use: ella base-url <provider> <url>");
        config.providers[provider] = { ...config.providers[provider], baseUrl: url };
        await saveConfig(config);
        output.write(`${theme.success("Base URL set for")} ${theme.accent(provider)}.\n`);
        return;
      }
      case "accessibility": {
        const action = args[1] || "show";
        if (action === "show") {
          output.write(`${JSON.stringify(config.accessibility, null, 2)}\n`);
          return;
        }
        if (action === "set") {
          const key = args[2] as keyof typeof config.accessibility;
          const value = boolFromString(args[3] || "");
          if (!key || value === null || !(key in config.accessibility)) {
            throw new Error("Use: ella accessibility set <noColor|reducedMotion|highContrast|screenReader> <on|off>");
          }
          config.accessibility[key] = value;
          applyAccessibilityEnvironment(config);
          await saveConfig(config);
          output.write(`${theme.success("Accessibility updated.")}\n`);
          return;
        }
        throw new Error("Use: ella accessibility <show|set>");
      }
      case "plan": {
        const task = await promptFromArgs(1);
        if (!task) throw new Error("Missing task.");
        await runAsk(config, `Create a concrete implementation plan for this task. Read relevant files first if needed. Task: ${task}`);
        return;
      }
      case "review": {
        const focus = await promptFromArgs(1);
        await runAsk(config, `Review this repository or current git diff. Prioritize bugs, regressions, missing tests, and risky design issues. Focus: ${focus || "general code review"}`);
        return;
      }
      case "fix": {
        const problem = await promptFromArgs(1);
        if (!problem) throw new Error("Missing problem.");
        await runAsk(config, `Debug and fix this problem end to end. Read files, edit safely, and run relevant checks. Problem: ${problem}`);
        return;
      }
      case "explain": {
        const topic = await promptFromArgs(1);
        if (!topic) throw new Error("Missing topic.");
        await runAsk(config, `Explain this using repository context. Read relevant files first if useful. Topic: ${topic}`);
        return;
      }
      case "init": {
        const created = await initProject(process.cwd());
        output.write(created.length ? `Created:\n${created.map((item) => `- ${item}`).join("\n")}\n` : "Ella project already initialized.\n");
        return;
      }
      case "models": {
        const provider = args[1] ? requireProvider(args[1]) : undefined;
        const providers = provider ? [provider] : Object.keys(MODEL_CATALOG) as ProviderName[];
        for (const item of providers) {
          output.write(`${item}:\n${MODEL_CATALOG[item].map((model) => `- ${model}`).join("\n")}\n`);
        }
        return;
      }
      case "tools":
        output.write(`${toolHelp()}\n`);
        return;
      case "doctor":
        await doctor(config);
        return;
      case "config":
        await handleConfig(config, args.slice(1));
        return;
      default:
        await runAsk(config, await promptFromArgs(0));
        return;
    }
  } catch (error) {
    output.write(`${theme.danger("Error:")} ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await main();
