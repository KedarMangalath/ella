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
  const random = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${random}`;
}

function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}

export function titleFromPrompt(prompt: string): string {
  const title = prompt.replace(/\s+/g, " ").trim().slice(0, 80);
  return title || "Untitled session";
}

export async function createSession(config: EllaConfig, cwd: string, title = "New session"): Promise<SessionRecord> {
  const timestamp = nowIso();
  const session: SessionRecord = {
    id: newId(),
    title,
    cwd,
    createdAt: timestamp,
    updatedAt: timestamp,
    provider: config.defaultProvider,
    model: config.defaultModel,
    thinkingMode: config.thinkingMode,
    messages: [],
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
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = await readFile(path.join(sessionsDir(), entry.name), "utf8");
        sessions.push(JSON.parse(raw) as SessionRecord);
      } catch {
        // Ignore corrupt session file.
      }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function latestSession(): Promise<SessionRecord | null> {
  const sessions = await listSessions();
  return sessions[0] || null;
}

export function appendPair(session: SessionRecord, userPrompt: string, newMessages: ChatMessage[]): SessionRecord {
  if (session.title === "New session") {
    session.title = titleFromPrompt(userPrompt);
  }
  session.messages = newMessages;
  return session;
}

export function formatSessionList(sessions: SessionRecord[]): string {
  if (!sessions.length) return "No saved sessions.";
  return sessions
    .map((session) => {
      const age = session.updatedAt.replace("T", " ").slice(0, 19);
      return `${session.id}  ${age}  ${session.provider}/${session.model}  ${session.title}`;
    })
    .join("\n");
}
