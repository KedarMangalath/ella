import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MemoryEntry, TodoItem } from "./types.js";

function projectDir(cwd: string): string {
  return path.join(cwd, ".ella");
}

function memoryPath(cwd: string): string {
  return path.join(projectDir(cwd), "memory.md");
}

function todosPath(cwd: string): string {
  return path.join(projectDir(cwd), "todos.json");
}

function nowIso(): string { return new Date().toISOString(); }
function newId(): string { return Math.random().toString(36).slice(2, 8); }

export async function readMemory(cwd: string): Promise<string> {
  try { return await readFile(memoryPath(cwd), "utf8"); } catch { return ""; }
}

export async function addMemory(
  cwd: string,
  text: string,
  source = "user",
  provenance?: { sessionId?: string; turnIndex?: number },
): Promise<MemoryEntry> {
  await mkdir(projectDir(cwd), { recursive: true });
  const entry: MemoryEntry = {
    id: newId(),
    text: text.trim(),
    source,
    createdAt: nowIso(),
    sessionId: provenance?.sessionId,
    turnIndex: provenance?.turnIndex,
    verified: true,
  };
  const provenanceNote = provenance?.sessionId
    ? ` session=${provenance.sessionId.slice(0, 8)} turn=${provenance.turnIndex ?? "?"}`
    : "";
  const existing = await readMemory(cwd);
  const block = `\n## ${entry.createdAt} [${source}${provenanceNote}]\n\n${entry.text}\n`;
  await writeFile(memoryPath(cwd), `${existing}${block}`.trimStart(), "utf8");
  return entry;
}

export async function clearMemory(cwd: string): Promise<void> {
  await mkdir(projectDir(cwd), { recursive: true });
  await writeFile(memoryPath(cwd), "", "utf8");
}

export async function readTodos(cwd: string): Promise<TodoItem[]> {
  try {
    return JSON.parse(await readFile(todosPath(cwd), "utf8")) as TodoItem[];
  } catch { return []; }
}

async function saveTodos(cwd: string, todos: TodoItem[]): Promise<void> {
  await mkdir(projectDir(cwd), { recursive: true });
  await writeFile(todosPath(cwd), JSON.stringify(todos, null, 2), "utf8");
}

export async function addTodo(cwd: string, text: string): Promise<TodoItem> {
  const todos = await readTodos(cwd);
  const now = nowIso();
  const item: TodoItem = { id: newId(), text, status: "pending", createdAt: now, updatedAt: now };
  todos.push(item);
  await saveTodos(cwd, todos);
  return item;
}

export async function completeTodo(cwd: string, id: string): Promise<void> {
  const todos = await readTodos(cwd);
  const item = todos.find((t) => t.id === id);
  if (!item) throw new Error(`Todo ${id} not found.`);
  item.status = "done";
  item.updatedAt = nowIso();
  await saveTodos(cwd, todos);
}

export async function clearTodos(cwd: string): Promise<void> {
  await saveTodos(cwd, []);
}

export function formatTodos(todos: TodoItem[]): string {
  if (!todos.length) return "No todos.";
  return todos
    .map((t) => `[${t.status === "done" ? "x" : " "}] ${t.id} ${t.text}`)
    .join("\n");
}
