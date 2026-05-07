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

const args = process.argv.slice(2);

const SLASH_COMMAND_HELP = `Slash commands:
/commands, /help               Show commands
/exit, /quit                   Quit Ella
/setup                         Run setup wizard
/status                        Show active provider/model/settings
/config                        Show masked config
/tools                         Show local tools
/models [provider]             Show model catalog
/provider <provider>           Switch provider
/model <name-or-number>        Switch model for active provider
/think <fast|balanced|deep|max>
/approval <ask|auto-edit|full-auto|read-only>
/key status                    Show key status
/key set [provider]            Paste and save API key
/key delete [provider]         Delete stored API key
/base-url <provider> <url>     Set custom provider base URL
`;

function printHelp(): void {
  output.write(`Ella CLI

Usage:
  ella
  ella ask <prompt>
  ella setup
  ella commands
  ella init
  ella models [provider]
  ella tools
  ella doctor
  ella config show
  ella config set-key <provider> [key]
  ella config delete-key <provider>
  ella config set-base-url <provider> <url>
  ella config set-provider <provider>
  ella config set-model <model>
  ella config set-thinking <fast|balanced|deep|max>
  ella config set-approval <ask|auto-edit|full-auto|read-only>

Providers: openai, anthropic, gemini, openrouter
`);
}

async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(question);
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
  output.write("\nElla setup\n");
  output.write("Paste key here once. Ella remembers it in global config.\n\n");

  output.write("Providers:\n1. openai\n2. anthropic\n3. gemini\n4. openrouter\n");
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
  output.write(`\nSaved. Active: ${config.defaultProvider}/${config.defaultModel}, thinking=${config.thinkingMode}, approval=${config.approvalMode}\n\n`);
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

async function runAsk(config: EllaConfig, prompt: string): Promise<void> {
  await ensureConfigured(config);
  const instructions = await readProjectInstructions(process.cwd());
  const fullPrompt = instructions
    ? `Project instructions:\n${instructions}\n\nUser request:\n${prompt}`
    : prompt;
  const provider = createProvider(config, config.defaultProvider);
  const agent = new EllaAgent(provider, config);
  await agent.run({ cwd: process.cwd(), prompt: fullPrompt });
}

async function interactive(config: EllaConfig): Promise<void> {
  if (!apiKeyForProvider(config, config.defaultProvider)) {
    await setupWizard(config);
  }

  output.write(`Ella ${config.defaultProvider}/${config.defaultModel} thinking=${config.thinkingMode} approval=${config.approvalMode}\n`);
  output.write("Type /commands for commands, /exit to quit.\n\n");

  while (true) {
    const line = await promptLine("ella> ");
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "/exit" || trimmed === "/quit") return;
    if (trimmed === "/help" || trimmed === "/commands") {
      output.write(SLASH_COMMAND_HELP);
      continue;
    }
    if (trimmed === "/setup") {
      await setupWizard(config);
      continue;
    }
    if (trimmed === "/status") {
      output.write(`Provider: ${config.defaultProvider}
Model: ${config.defaultModel}
Thinking: ${config.thinkingMode}
Approval: ${config.approvalMode}
Key: ${keyStatus(config, config.defaultProvider)}
Config: ${configPath()}
`);
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
      await saveConfig(config);
      output.write(`Provider set: ${provider}. Model: ${config.defaultModel}. Key: ${keyStatus(config, provider)}\n`);
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
      await saveConfig(config);
      output.write(`Model set: ${config.defaultModel}\n`);
      continue;
    }
    if (trimmed.startsWith("/think ")) {
      const mode = thinkingModeFromString(trimmed.slice("/think ".length));
      if (!mode) {
        output.write("Use: fast, balanced, deep, max\n");
        continue;
      }
      config.thinkingMode = mode;
      await saveConfig(config);
      output.write(`Thinking mode set: ${mode}\n`);
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
      output.write(`Approval mode set: ${mode}\n`);
      continue;
    }
    if (trimmed === "/key status") {
      for (const provider of Object.keys(config.providers) as ProviderName[]) {
        output.write(`${provider}: ${keyStatus(config, provider)}\n`);
      }
      continue;
    }
    if (trimmed === "/key set" || trimmed.startsWith("/key set ")) {
      const requested = trimmed.slice("/key set".length).trim();
      const provider = requested ? requireProvider(requested) : config.defaultProvider;
      const key = await promptLine(`Paste API key for ${provider}: `);
      if (!key.trim()) {
        output.write("No key saved.\n");
        continue;
      }
      config.providers[provider] = { ...config.providers[provider], apiKey: key.trim() };
      await saveConfig(config);
      output.write(`Saved key for ${provider}.\n`);
      continue;
    }
    if (trimmed === "/key delete" || trimmed.startsWith("/key delete ")) {
      const requested = trimmed.slice("/key delete".length).trim();
      const provider = requested ? requireProvider(requested) : config.defaultProvider;
      delete config.providers[provider].apiKey;
      await saveConfig(config);
      output.write(`Deleted stored key for ${provider}. Env key status: ${envKeyForProvider(provider) ? "present" : "missing"}.\n`);
      continue;
    }
    if (trimmed.startsWith("/base-url ")) {
      const parts = trimmed.slice("/base-url ".length).trim().split(/\s+/);
      const provider = requireProvider(parts[0] || "");
      const url = parts.slice(1).join(" ").trim();
      if (!url) {
        output.write("Use: /base-url <provider> <url>\n");
        continue;
      }
      config.providers[provider] = { ...config.providers[provider], baseUrl: url };
      await saveConfig(config);
      output.write(`Base URL set for ${provider}.\n`);
      continue;
    }

    try {
      await runAsk(config, trimmed);
    } catch (error) {
      output.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

async function handleConfig(config: EllaConfig, subArgs: string[]): Promise<void> {
  const [command, ...rest] = subArgs;
  switch (command) {
    case "show":
    case undefined:
      output.write(`${JSON.stringify(maskedConfig(config), null, 2)}\n`);
      output.write(`Config: ${configPath()}\n`);
      return;
    case "set-key": {
      const provider = requireProvider(rest[0] || "");
      const key = rest[1] || await promptLine(`API key for ${provider}: `);
      config.providers[provider] = { ...config.providers[provider], apiKey: key.trim() };
      if (!config.providers[provider].defaultModel) {
        config.providers[provider].defaultModel = DEFAULT_MODELS[provider];
      }
      await saveConfig(config);
      output.write(`Saved key for ${provider}.\n`);
      return;
    }
    case "delete-key":
    case "remove-key":
    case "clear-key": {
      const provider = requireProvider(rest[0] || "");
      delete config.providers[provider].apiKey;
      await saveConfig(config);
      output.write(`Deleted stored key for ${provider}. Env key status: ${envKeyForProvider(provider) ? "present" : "missing"}.\n`);
      return;
    }
    case "key-status": {
      for (const provider of Object.keys(config.providers) as ProviderName[]) {
        output.write(`${provider}: ${keyStatus(config, provider)}\n`);
      }
      return;
    }
    case "set-base-url": {
      const provider = requireProvider(rest[0] || "");
      const url = rest.slice(1).join(" ").trim();
      if (!url) throw new Error("Missing base URL.");
      config.providers[provider] = { ...config.providers[provider], baseUrl: url };
      await saveConfig(config);
      output.write(`Base URL set for ${provider}.\n`);
      return;
    }
    case "set-provider": {
      const provider = requireProvider(rest[0] || "");
      config.defaultProvider = provider;
      config.defaultModel = config.providers[provider].defaultModel || DEFAULT_MODELS[provider];
      await saveConfig(config);
      output.write(`Provider set: ${provider}. Model set: ${config.defaultModel}.\n`);
      return;
    }
    case "set-model": {
      const model = rest.join(" ").trim();
      if (!model) throw new Error("Missing model.");
      config.defaultModel = model;
      config.providers[config.defaultProvider].defaultModel = model;
      await saveConfig(config);
      output.write(`Model set: ${model}.\n`);
      return;
    }
    case "set-thinking": {
      const mode = thinkingModeFromString(rest[0] || "");
      if (!mode) throw new Error("Use thinking mode: fast, balanced, deep, max.");
      config.thinkingMode = mode;
      await saveConfig(config);
      output.write(`Thinking mode set: ${mode}.\n`);
      return;
    }
    case "set-approval": {
      const mode = approvalModeFromString(rest[0] || "");
      if (!mode) throw new Error("Use approval mode: ask, auto-edit, full-auto, read-only.");
      config.approvalMode = mode;
      await saveConfig(config);
      output.write(`Approval mode set: ${mode}.\n`);
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
        output.write(SLASH_COMMAND_HELP);
        return;
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
        output.write(`Node: ${process.version}\n`);
        output.write(`CWD: ${process.cwd()}\n`);
        output.write(`Config: ${configPath()}\n`);
        output.write(`Provider: ${config.defaultProvider}\n`);
        output.write(`Model: ${config.defaultModel}\n`);
        output.write(`Thinking: ${config.thinkingMode}\n`);
        output.write(`Approval: ${config.approvalMode}\n`);
        return;
      case "config":
        await handleConfig(config, args.slice(1));
        return;
      default:
        printHelp();
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    output.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await main();
