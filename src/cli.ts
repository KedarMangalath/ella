#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  apiKeyForProvider,
  approvalModeFromString,
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

const args = process.argv.slice(2);

function printHelp(): void {
  output.write(`${theme.brand("Ella CLI")}

${theme.header("Usage")}
  ${theme.command("ella")}
  ${theme.command("ella ask <prompt>")}
  ${theme.command("ella setup")}
  ${theme.command("ella commands")}
  ${theme.command("ella sessions")}
  ${theme.command("ella resume [session-id]")}
  ${theme.command("ella memory <show|add|clear>")}
  ${theme.command("ella todo <list|add|done|clear>")}
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
  const prefix = await contextPrefix(process.cwd());
  const fullPrompt = prefix ? `${prefix}\n\nUser request:\n${prompt}` : prompt;
  const provider = createProvider(config, config.defaultProvider);
  const agent = new EllaAgent(provider, config);
  await agent.run({ cwd: process.cwd(), prompt: fullPrompt });
}

async function interactive(config: EllaConfig, resumeSessionId?: string): Promise<void> {
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
  output.write(`${theme.muted("Type /commands for commands, /exit to quit.")}\n\n`);

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
      output.write(`${kv("Provider", config.defaultProvider)}
${kv("Model", config.defaultModel)}
${kv("Thinking", config.thinkingMode)}
${kv("Approval", config.approvalMode)}
${kv("Key", keyStatus(config, config.defaultProvider))}
${kv("Session", `${session.id} (${session.title})`)}
${kv("Config", configPath())}
`);
      continue;
    }
    if (trimmed === "/sessions") {
      output.write(`${formatSessionList(await listSessions())}\n`);
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
      await runAsk(config, `Create a concrete implementation plan for this task. Read relevant files first if needed. Task: ${trimmed.slice("/plan ".length)}`);
      continue;
    }
    if (trimmed === "/review" || trimmed.startsWith("/review ")) {
      const focus = trimmed.slice("/review".length).trim();
      await runAsk(config, `Review this repository or current git diff. Prioritize bugs, regressions, missing tests, and risky design issues. Focus: ${focus || "general code review"}`);
      continue;
    }
    if (trimmed.startsWith("/fix ")) {
      await runAsk(config, `Debug and fix this problem end to end. Read files, edit safely, and run relevant checks. Problem: ${trimmed.slice("/fix ".length)}`);
      continue;
    }
    if (trimmed.startsWith("/explain ")) {
      await runAsk(config, `Explain this using repository context. Read relevant files first if useful. Topic: ${trimmed.slice("/explain ".length)}`);
      continue;
    }

    try {
      await ensureConfigured(config);
      const prefix = await contextPrefix(process.cwd());
      const fullPrompt = prefix ? `${prefix}\n\nUser request:\n${trimmed}` : trimmed;
      const provider = createProvider(config, config.defaultProvider);
      const agent = new EllaAgent(provider, config);
      const result = await agent.run({
        cwd: process.cwd(),
        prompt: fullPrompt,
        messages: session.messages,
      });
      appendPair(session, trimmed, result.messages);
      session.provider = config.defaultProvider;
      session.model = config.defaultModel;
      session.thinkingMode = config.thinkingMode;
      await saveSession(session);
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

async function main(): Promise<void> {
  const config = await loadConfig();
  const command = args[0];

  try {
    switch (command) {
      case undefined:
        await interactive(config);
        return;
      case "help":
      case "--help":
      case "-h":
        printHelp();
        return;
      case "ask":
      case "run": {
        const prompt = args.slice(1).join(" ").trim();
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
      case "sessions":
        output.write(`${formatSessionList(await listSessions())}\n`);
        return;
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
      case "plan": {
        const task = args.slice(1).join(" ").trim();
        if (!task) throw new Error("Missing task.");
        await runAsk(config, `Create a concrete implementation plan for this task. Read relevant files first if needed. Task: ${task}`);
        return;
      }
      case "review": {
        const focus = args.slice(1).join(" ").trim();
        await runAsk(config, `Review this repository or current git diff. Prioritize bugs, regressions, missing tests, and risky design issues. Focus: ${focus || "general code review"}`);
        return;
      }
      case "fix": {
        const problem = args.slice(1).join(" ").trim();
        if (!problem) throw new Error("Missing problem.");
        await runAsk(config, `Debug and fix this problem end to end. Read files, edit safely, and run relevant checks. Problem: ${problem}`);
        return;
      }
      case "explain": {
        const topic = args.slice(1).join(" ").trim();
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
        output.write(`${kv("Node", process.version)}\n`);
        output.write(`${kv("CWD", process.cwd())}\n`);
        output.write(`${kv("Config", configPath())}\n`);
        output.write(`${kv("Provider", config.defaultProvider)}\n`);
        output.write(`${kv("Model", config.defaultModel)}\n`);
        output.write(`${kv("Thinking", config.thinkingMode)}\n`);
        output.write(`${kv("Approval", config.approvalMode)}\n`);
        return;
      case "config":
        await handleConfig(config, args.slice(1));
        return;
      default:
        printHelp();
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    output.write(`${theme.danger("Error:")} ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await main();
