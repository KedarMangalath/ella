import { stdout } from "node:process";

type Rgb = readonly [number, number, number];

const useColor = !process.env.NO_COLOR && (Boolean(process.env.FORCE_COLOR) || stdout.isTTY);

const palette = {
  plum: [92, 42, 105],
  mauve: [183, 132, 167],
  orchid: [202, 129, 213],
  lavender: [222, 203, 247],
  rose: [232, 162, 190],
  ink: [245, 240, 248],
  muted: [174, 153, 181],
  success: [132, 210, 173],
  warning: [236, 197, 121],
  danger: [244, 131, 151],
} satisfies Record<string, Rgb>;

function esc(code: string): string {
  return `\x1b[${code}m`;
}

function rgb([r, g, b]: Rgb): string {
  return esc(`38;2;${r};${g};${b}`);
}

function paint(color: Rgb, text: string): string {
  if (!useColor) return text;
  return `${rgb(color)}${text}${esc("0")}`;
}

function style(code: string, text: string): string {
  if (!useColor) return text;
  return `${esc(code)}${text}${esc("0")}`;
}

function line(command: string, description: string): string {
  return `${theme.command(command.padEnd(32))} ${theme.muted(description)}`;
}

export const theme = {
  palette,
  enabled: useColor,
  bold: (text: string) => style("1", text),
  dim: (text: string) => style("2", text),
  header: (text: string) => theme.bold(paint(palette.orchid, text)),
  brand: (text: string) => theme.bold(paint(palette.lavender, text)),
  accent: (text: string) => paint(palette.mauve, text),
  command: (text: string) => paint(palette.orchid, text),
  prompt: (text: string) => paint(palette.rose, text),
  label: (text: string) => paint(palette.lavender, text),
  value: (text: string) => paint(palette.ink, text),
  muted: (text: string) => paint(palette.muted, text),
  success: (text: string) => paint(palette.success, text),
  warning: (text: string) => paint(palette.warning, text),
  danger: (text: string) => paint(palette.danger, text),
  tool: (text: string) => theme.bold(paint(palette.mauve, text)),
  code: (text: string) => paint(palette.lavender, text),
};

export function slashCommandHelp(): string {
  return `${theme.header("Slash commands")}
${line("/commands, /help", "Show commands")}
${line("/exit, /quit", "Quit Ella")}
${line("/setup", "Run setup wizard")}
${line("/status", "Show active provider/model/settings")}
${line("/sessions", "List saved sessions")}
${line("/resume [session-id]", "Resume saved session")}
${line("/new", "Start new session")}
${line("/config", "Show masked config")}
${line("/tools", "Show local tools")}
${line("/models [provider]", "Show model catalog")}
${line("/provider <provider>", "Switch provider")}
${line("/model <name-or-number>", "Switch model for active provider")}
${line("/think <fast|balanced|deep|max>", "Set thinking mode")}
${line("/approval <mode>", "Set approval mode")}
${line("/key status", "Show key status")}
${line("/key set [provider]", "Paste and save API key")}
${line("/key delete [provider]", "Delete stored API key")}
${line("/memory show|add|clear", "Project memory")}
${line("/todo list|add|done|clear", "Project todo list")}
${line("/plan <task>", "Produce implementation plan")}
${line("/review [focus]", "Review repo/diff for issues")}
${line("/fix <problem>", "Debug and fix problem")}
${line("/explain <topic>", "Explain code/topic using repo context")}
${line("/base-url <provider> <url>", "Set custom provider base URL")}
`;
}

export function kv(label: string, value: string): string {
  return `${theme.label(`${label}:`)} ${theme.value(value)}`;
}
