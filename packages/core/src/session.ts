import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ellaHome } from "./config.js";
import type { ChatMessage, EllaConfig, SessionRecord } from "./types.js";

function sessionsDir(): string {
  return path.join(ellaHome(), "sessions");
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${rand}`;
}

function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}

export function titleFromPrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled session";
}

export async function createSession(config: EllaConfig, cwd: string, title = "New session"): Promise<SessionRecord> {
  const now = nowIso();
  const session: SessionRecord = {
    id: newId(),
    title,
    cwd,
    createdAt: now,
    updatedAt: now,
    provider: config.defaultProvider,
    model: config.defaultModel,
    thinkingMode: config.thinkingMode,
    messages: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    costUsd: 0,
  };
  await saveSession(session);
  return session;
}

export async function saveSession(session: SessionRecord): Promise<void> {
  await mkdir(sessionsDir(), { recursive: true });
  session.updatedAt = nowIso();
  await writeFile(sessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
}

export async function loadSession(id: string): Promise<SessionRecord> {
  const raw = await readFile(sessionPath(id), "utf8");
  return JSON.parse(raw) as SessionRecord;
}

export async function listSessions(): Promise<SessionRecord[]> {
  try {
    const entries = await readdir(sessionsDir(), { withFileTypes: true });
    const sessions: SessionRecord[] = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".json")) continue;
      try {
        sessions.push(JSON.parse(await readFile(path.join(sessionsDir(), e.name), "utf8")) as SessionRecord);
      } catch { /* skip corrupt */ }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function latestSession(): Promise<SessionRecord | null> {
  const sessions = await listSessions();
  return sessions[0] ?? null;
}

export function appendPair(session: SessionRecord, prompt: string, response: string): void {
  session.messages.push({ role: "user", content: prompt });
  session.messages.push({ role: "assistant", content: response });
}

export function touchFile(session: SessionRecord, filePath: string): void {
  if (!session.fileTouches) session.fileTouches = {};
  session.fileTouches[filePath] = (session.fileTouches[filePath] ?? 0) + 1;
}

export function topTouchedFiles(session: SessionRecord, n = 10): Array<{ path: string; count: number }> {
  const touches = session.fileTouches ?? {};
  return Object.entries(touches)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([path, count]) => ({ path, count }));
}

export async function forkSession(session: SessionRecord, turnIndex: number): Promise<SessionRecord> {
  // turnIndex is the user-turn number (0-based). Each turn = 1 user + 1 assistant message.
  // We keep messages up to and including that turn's assistant reply.
  const systemMessages = session.messages.filter((m) => m.role === "system");
  const conversationMessages = session.messages.filter((m) => m.role !== "system");

  const sliceEnd = Math.min((turnIndex + 1) * 2, conversationMessages.length);
  const keptMessages = [...systemMessages, ...conversationMessages.slice(0, sliceEnd)];

  const now = nowIso();
  const fork: SessionRecord = {
    id: newId(),
    title: `Fork of "${session.title}" @turn${turnIndex}`,
    cwd: session.cwd,
    createdAt: now,
    updatedAt: now,
    provider: session.provider,
    model: session.model,
    thinkingMode: session.thinkingMode,
    messages: keptMessages,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    costUsd: 0,
    forkOf: session.id,
    forkTurn: turnIndex,
    fileTouches: session.fileTouches ? { ...session.fileTouches } : undefined,
    budgetUsd: session.budgetUsd,
    tags: session.tags,
  };
  await saveSession(fork);
  return fork;
}

export interface SessionTreeNode {
  session: SessionRecord;
  children: SessionTreeNode[];
}

export async function getSessionTree(): Promise<SessionTreeNode[]> {
  const all = await listSessions();
  const byId = new Map(all.map((s) => [s.id, s]));
  const roots: SessionTreeNode[] = [];
  const nodes = new Map<string, SessionTreeNode>(all.map((s) => [s.id, { session: s, children: [] }]));

  for (const session of all) {
    const node = nodes.get(session.id)!;
    if (session.forkOf && nodes.has(session.forkOf)) {
      nodes.get(session.forkOf)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function renderSessionTree(roots: SessionTreeNode[], indent = ""): string {
  const lines: string[] = [];
  for (const root of roots) {
    const s = root.session;
    const marker = s.forkOf ? "└─ " : "◉ ";
    lines.push(`${indent}${marker}${s.id.slice(0, 8)}  ${s.updatedAt.slice(0, 16)}  ${s.title}`);
    if (root.children.length) {
      lines.push(renderSessionTree(root.children, indent + "   "));
    }
  }
  return lines.join("\n");
}

export function formatSessionList(sessions: SessionRecord[]): string {
  if (!sessions.length) return "No sessions.";
  return sessions
    .slice(0, 20)
    .map((s) => `${s.id}  ${s.updatedAt.slice(0, 16)}  ${s.title}`)
    .join("\n");
}
