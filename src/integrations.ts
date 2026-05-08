import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ellaHome } from "./config.js";

export type IntegrationKind = "mcp" | "skills" | "hooks" | "extensions";

interface IntegrationEntry {
  name: string;
  kind: IntegrationKind;
  detail: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type IntegrationState = Record<IntegrationKind, IntegrationEntry[]>;

const KINDS: IntegrationKind[] = ["mcp", "skills", "hooks", "extensions"];

function emptyState(): IntegrationState {
  return {
    mcp: [],
    skills: [],
    hooks: [],
    extensions: [],
  };
}

function statePath(): string {
  return path.join(ellaHome(), "integrations.json");
}

function nowIso(): string {
  return new Date().toISOString();
}

async function readState(): Promise<IntegrationState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<IntegrationState>;
    return {
      ...emptyState(),
      ...parsed,
    };
  } catch {
    return emptyState();
  }
}

async function saveState(state: IntegrationState): Promise<void> {
  await mkdir(ellaHome(), { recursive: true });
  await writeFile(statePath(), JSON.stringify(state, null, 2), "utf8");
}

function normalizeKind(value: string): IntegrationKind {
  const normalized = value.toLowerCase();
  if (normalized === "skill") return "skills";
  if (normalized === "hook") return "hooks";
  if (normalized === "extension") return "extensions";
  if (KINDS.includes(normalized as IntegrationKind)) return normalized as IntegrationKind;
  throw new Error(`Unknown integration kind: ${value}`);
}

function usage(kind: IntegrationKind): string {
  if (kind === "mcp") return "Use: ella mcp <list|add|remove|enable|disable> [name] [command-or-url]";
  if (kind === "skills") return "Use: ella skills <list|install|link|uninstall|enable|disable> [name] [path-or-url]";
  if (kind === "hooks") return "Use: ella hooks <list|add|remove|enable|disable> [name] [command]";
  return "Use: ella extensions <list|install|link|uninstall|enable|disable> [name] [path-or-url]";
}

function formatList(kind: IntegrationKind, entries: IntegrationEntry[]): string {
  if (!entries.length) return `No ${kind} configured.`;
  return entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const state = entry.enabled ? "on" : "off";
      const detail = entry.detail ? `  ${entry.detail}` : "";
      return `${state}  ${entry.name}${detail}`;
    })
    .join("\n");
}

function upsert(entries: IntegrationEntry[], kind: IntegrationKind, name: string, detail: string): IntegrationEntry[] {
  const timestamp = nowIso();
  const existing = entries.find((entry) => entry.name === name);
  if (existing) {
    existing.detail = detail || existing.detail;
    existing.enabled = true;
    existing.updatedAt = timestamp;
    return entries;
  }
  return [
    ...entries,
    {
      name,
      kind,
      detail,
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

export async function handleIntegrationCommand(kindValue: string, args: string[]): Promise<string> {
  const kind = normalizeKind(kindValue);
  const action = (args[0] || "list").toLowerCase();
  const state = await readState();
  const entries = state[kind] || [];

  if (action === "list" || action === "ls" || action === "status") {
    return formatList(kind, entries);
  }

  if (["add", "install", "link", "new", "configure"].includes(action)) {
    const name = args[1];
    const detail = args.slice(2).join(" ").trim();
    if (!name) throw new Error(usage(kind));
    state[kind] = upsert(entries, kind, name, detail);
    await saveState(state);
    return `${kind} entry saved: ${name}`;
  }

  if (action === "enable" || action === "disable") {
    const name = args[1];
    if (!name) throw new Error(usage(kind));
    const entry = entries.find((item) => item.name === name);
    if (!entry) throw new Error(`${kind} entry not found: ${name}`);
    entry.enabled = action === "enable";
    entry.updatedAt = nowIso();
    await saveState(state);
    return `${kind} entry ${entry.enabled ? "enabled" : "disabled"}: ${name}`;
  }

  if (["remove", "rm", "delete", "uninstall"].includes(action)) {
    const name = args[1];
    if (!name) throw new Error(usage(kind));
    const next = entries.filter((entry) => entry.name !== name);
    if (next.length === entries.length) throw new Error(`${kind} entry not found: ${name}`);
    state[kind] = next;
    await saveState(state);
    return `${kind} entry removed: ${name}`;
  }

  if (action === "help") return usage(kind);
  throw new Error(usage(kind));
}
