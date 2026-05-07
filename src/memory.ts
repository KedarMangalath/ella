import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TodoItem } from "./types.js";

function projectEllaDir(cwd: string): string {
  return path.join(cwd, ".ella");
}

function memoryPath(cwd: string): string {
  return path.join(projectEllaDir(cwd), "memory.md");
}

function todosPath(cwd: string): string {
  return path.join(projectEllaDir(cwd), "todos.json");
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function readMemory(cwd: string): Promise<string> {
  try {
    return await readFile(memoryPath(cwd), "utf8");
  } catch {
    return "";
  }
}

export async function addMemory(cwd: string, text: string): Promise<void> {
  await mkdir(projectEllaDir(cwd), { recursive: true });
  const existing = await readMemory(cwd);
  const entry = `\n## ${nowIso()}\n\n${text.trim()}\n`;
  await writeFile(memoryPath(cwd), `${existing}${entry}`.trimStart(), "utf8");
}

export async function clearMemory(cwd: string): Promise<void> {
  await mkdir(projectEllaDir(cwd), { recursive: true });
  await writeFile(memoryPath(cwd), "", "utf8");
}

export async function readTodos(cwd: string): Promise<TodoItem[]> {
  try {
    const raw = await readFile(todosPath(cwd), "utf8");
    return JSON.parse(raw) as TodoItem[];
  } catch {
    return [];
  }
}

export async function saveTodos(cwd: string, todos: TodoItem[]): Promise<void> {
  await mkdir(projectEllaDir(cwd), { recursive: true });
  await writeFile(todosPath(cwd), JSON.stringify(todos, null, 2), "utf8");
}

export async function addTodo(cwd: string, text: string): Promise<TodoItem> {
  const todos = await readTodos(cwd);
  const timestamp = nowIso();
  const todo: TodoItem = {
    id: newId(),
    text: text.trim(),
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  todos.push(todo);
  await saveTodos(cwd, todos);
  return todo;
}

export async function completeTodo(cwd: string, idPrefix: string): Promise<TodoItem | null> {
  const todos = await readTodos(cwd);
  const todo = todos.find((item) => item.id.startsWith(idPrefix));
  if (!todo) return null;
  todo.status = "done";
  todo.updatedAt = nowIso();
  await saveTodos(cwd, todos);
  return todo;
}

export async function clearTodos(cwd: string): Promise<void> {
  await saveTodos(cwd, []);
}

export function formatTodos(todos: TodoItem[]): string {
  if (!todos.length) return "No todos.";
  return todos
    .map((todo) => `${todo.status === "done" ? "x" : " "} ${todo.id} ${todo.text}`)
    .join("\n");
}
