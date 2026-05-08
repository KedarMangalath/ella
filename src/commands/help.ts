import { renderEllaLogo } from "../logo.js";
import { theme } from "../theme.js";
import { cliCommands, slashCommands, type CommandEntry, type CommandGroup } from "./registry.js";

const GROUPS: CommandGroup[] = ["Core", "Setup", "Workspace", "Agent", "Interactive"];

function blockFor(command: CommandEntry, mode: "cli" | "slash"): string {
  const syntaxes = mode === "cli" ? command.cli || [] : command.slash || [];
  return [
    theme.muted(command.description),
    ...syntaxes.map((syntax) => `  ${theme.command(syntax)}`),
  ].join("\n");
}

function grouped(commands: CommandEntry[], mode: "cli" | "slash"): string {
  const sections: string[] = [];
  for (const group of GROUPS) {
    const groupCommands = commands.filter((command) => command.group === group);
    if (!groupCommands.length) continue;
    sections.push(`${theme.header(group)}\n${groupCommands.map((command) => blockFor(command, mode)).join("\n\n")}`);
  }
  return sections.join("\n\n");
}

export function formatCliHelp(): string {
  return `${renderEllaLogo("model-agnostic coding agent")}

${theme.header("Usage")}
${grouped(cliCommands(), "cli")}

${theme.header("Providers")} ${theme.accent("openai, anthropic, gemini, openrouter")}
${theme.muted("Shortcut: type plain English directly, e.g. ella fix the failing tests")}
`;
}

export function formatSlashCommandHelp(): string {
  return `${theme.header("Slash commands")}
${grouped(slashCommands(), "slash")}
`;
}
