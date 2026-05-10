import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ellaHome } from "./config.js";
import type { UndoRecord } from "./types.js";

function undoDir(): string {
  return path.join(ellaHome(), "undo");
}

function undoPath(sessionId: string): string {
  return path.join(undoDir(), `${sessionId}.jsonl`);
}

export class UndoJournal {
  private records: UndoRecord[] = [];
  private cursor = -1;

  constructor(private readonly sessionId: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(undoPath(this.sessionId), "utf8");
      this.records = raw
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as UndoRecord);
      this.cursor = this.records.length - 1;
    } catch {
      this.records = [];
      this.cursor = -1;
    }
  }

  async push(record: UndoRecord): Promise<void> {
    // Truncate redo stack on new action
    this.records = this.records.slice(0, this.cursor + 1);
    this.records.push(record);
    this.cursor = this.records.length - 1;
    await this.persist();
  }

  async undo(): Promise<UndoRecord | null> {
    if (this.cursor < 0) return null;
    const record = this.records[this.cursor]!;
    if (record.before !== null) {
      await mkdir(path.dirname(record.path), { recursive: true });
      await writeFile(record.path, record.before, "utf8");
    }
    this.cursor--;
    return record;
  }

  async redo(): Promise<UndoRecord | null> {
    if (this.cursor >= this.records.length - 1) return null;
    this.cursor++;
    const record = this.records[this.cursor]!;
    await mkdir(path.dirname(record.path), { recursive: true });
    await writeFile(record.path, record.after, "utf8");
    return record;
  }

  list(): UndoRecord[] {
    return this.records.slice(0, this.cursor + 1);
  }

  canUndo(): boolean { return this.cursor >= 0; }
  canRedo(): boolean { return this.cursor < this.records.length - 1; }

  private async persist(): Promise<void> {
    await mkdir(undoDir(), { recursive: true });
    const content = this.records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await writeFile(undoPath(this.sessionId), content, "utf8");
  }
}

export async function snapshotBefore(
  journal: UndoJournal,
  filePath: string,
  tool: string,
): Promise<string | null> {
  let before: string | null = null;
  try { before = await readFile(filePath, "utf8"); } catch { /* new file */ }
  return before;
}

export async function recordWrite(
  journal: UndoJournal,
  filePath: string,
  before: string | null,
  after: string,
  tool: string,
): Promise<void> {
  await journal.push({
    path: filePath,
    before,
    after,
    tool,
    timestamp: new Date().toISOString(),
  });
}
