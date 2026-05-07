import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

interface EditOperation {
  id: string;
  filePath: string;
  before: string | null;
  after: string | null;
  timestamp: string;
  label: string;
}

interface UndoState {
  undo: EditOperation[];
  redo: EditOperation[];
}

function statePath(cwd: string): string {
  return path.join(cwd, ".ella", "undo.json");
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readState(cwd: string): Promise<UndoState> {
  try {
    return JSON.parse(await readFile(statePath(cwd), "utf8")) as UndoState;
  } catch {
    return { undo: [], redo: [] };
  }
}

async function saveState(cwd: string, state: UndoState): Promise<void> {
  await mkdir(path.dirname(statePath(cwd)), { recursive: true });
  await writeFile(statePath(cwd), JSON.stringify(state, null, 2), "utf8");
}

async function applyContent(filePath: string, content: string | null): Promise<void> {
  if (content === null) {
    await rm(filePath, { force: true });
    return;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export async function recordEdit(
  cwd: string,
  filePath: string,
  before: string | null,
  after: string | null,
  label: string,
): Promise<void> {
  const state = await readState(cwd);
  state.undo.push({
    id: newId(),
    filePath: path.resolve(filePath),
    before,
    after,
    timestamp: new Date().toISOString(),
    label,
  });
  state.redo = [];
  state.undo = state.undo.slice(-100);
  await saveState(cwd, state);
}

export async function undoLast(cwd: string): Promise<string> {
  const state = await readState(cwd);
  const op = state.undo.pop();
  if (!op) return "Nothing to undo.";
  await applyContent(op.filePath, op.before);
  state.redo.push(op);
  await saveState(cwd, state);
  return `Undid ${path.relative(cwd, op.filePath).replaceAll(path.sep, "/")} (${op.label}).`;
}

export async function redoLast(cwd: string): Promise<string> {
  const state = await readState(cwd);
  const op = state.redo.pop();
  if (!op) return "Nothing to redo.";
  await applyContent(op.filePath, op.after);
  state.undo.push(op);
  await saveState(cwd, state);
  return `Redid ${path.relative(cwd, op.filePath).replaceAll(path.sep, "/")} (${op.label}).`;
}

export async function undoStatus(cwd: string): Promise<string> {
  const state = await readState(cwd);
  const lastUndo = state.undo.at(-1);
  const lastRedo = state.redo.at(-1);
  return [
    `Undo stack: ${state.undo.length}${lastUndo ? `, next: ${lastUndo.label}` : ""}`,
    `Redo stack: ${state.redo.length}${lastRedo ? `, next: ${lastRedo.label}` : ""}`,
  ].join("\n");
}
