import { constants } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { recordEdit } from "./undo.js";

interface AddOperation {
  type: "add";
  path: string;
  lines: string[];
}

interface DeleteOperation {
  type: "delete";
  path: string;
}

interface UpdateChunk {
  oldLines: string[];
  newLines: string[];
}

interface UpdateOperation {
  type: "update";
  path: string;
  moveTo?: string;
  chunks: UpdateChunk[];
}

type PatchOperation = AddOperation | DeleteOperation | UpdateOperation;

function normalizePatch(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function nextFileHeader(line: string): boolean {
  return line.startsWith("*** Add File: ") ||
    line.startsWith("*** Update File: ") ||
    line.startsWith("*** Delete File: ") ||
    line === "*** End Patch";
}

function parsePatch(patchText: string): PatchOperation[] {
  const lines = normalizePatch(patchText);
  const begin = lines.findIndex((line) => line.trim() === "*** Begin Patch");
  const end = lines.findIndex((line) => line.trim() === "*** End Patch");
  if (begin === -1 || end === -1 || end <= begin) {
    throw new Error("Patch must include *** Begin Patch and *** End Patch markers.");
  }

  const operations: PatchOperation[] = [];
  let index = begin + 1;
  while (index < end) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("*** Add File: ")) {
      const filePath = line.slice("*** Add File: ".length).trim();
      if (!filePath) throw new Error("Add File header is missing a path.");
      index += 1;
      const content: string[] = [];
      while (index < end && !nextFileHeader(lines[index] ?? "")) {
        const contentLine = lines[index] ?? "";
        if (contentLine.startsWith("+")) {
          content.push(contentLine.slice(1));
        } else if (contentLine === "\\ No newline at end of file") {
          // Marker emitted by some diff tools; Ella writes normal text files.
        } else {
          throw new Error(`Add File lines must start with '+': ${contentLine}`);
        }
        index += 1;
      }
      operations.push({ type: "add", path: filePath, lines: content });
      continue;
    }

    if (line.startsWith("*** Delete File: ")) {
      const filePath = line.slice("*** Delete File: ".length).trim();
      if (!filePath) throw new Error("Delete File header is missing a path.");
      operations.push({ type: "delete", path: filePath });
      index += 1;
      continue;
    }

    if (line.startsWith("*** Update File: ")) {
      const filePath = line.slice("*** Update File: ".length).trim();
      if (!filePath) throw new Error("Update File header is missing a path.");
      index += 1;
      let moveTo: string | undefined;
      const chunks: UpdateChunk[] = [];
      let current: UpdateChunk | null = null;

      const flushChunk = (): void => {
        if (!current) return;
        if (current.oldLines.length === 0 && current.newLines.length === 0) return;
        chunks.push(current);
        current = null;
      };

      while (index < end && !nextFileHeader(lines[index] ?? "")) {
        const patchLine = lines[index] ?? "";
        if (patchLine.startsWith("*** Move to: ")) {
          moveTo = patchLine.slice("*** Move to: ".length).trim();
          if (!moveTo) throw new Error("Move to header is missing a path.");
          index += 1;
          continue;
        }
        if (patchLine.startsWith("@@")) {
          flushChunk();
          current = { oldLines: [], newLines: [] };
          index += 1;
          continue;
        }
        if (!current) current = { oldLines: [], newLines: [] };
        if (patchLine.startsWith(" ")) {
          const text = patchLine.slice(1);
          current.oldLines.push(text);
          current.newLines.push(text);
        } else if (patchLine.startsWith("-")) {
          current.oldLines.push(patchLine.slice(1));
        } else if (patchLine.startsWith("+")) {
          current.newLines.push(patchLine.slice(1));
        } else if (patchLine === "\\ No newline at end of file") {
          // Ignore metadata-only diff marker.
        } else if (!patchLine.trim()) {
          throw new Error("Blank update lines must be prefixed with space, '+', or '-'.");
        } else {
          throw new Error(`Unsupported update line: ${patchLine}`);
        }
        index += 1;
      }

      flushChunk();
      if (!chunks.length && !moveTo) throw new Error(`Update File has no changes: ${filePath}`);
      operations.push({ type: "update", path: filePath, moveTo, chunks });
      continue;
    }

    throw new Error(`Unknown patch directive: ${line}`);
  }

  if (!operations.length) throw new Error("Patch contains no file operations.");
  return operations;
}

function resolveInside(cwd: string, requested: string): string {
  const target = path.resolve(cwd, requested);
  const root = path.resolve(cwd);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Path outside workspace denied: ${requested}`);
  }
  return target;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function fileTextFromLines(lines: string[]): string {
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function previewText(text: string, maxLines = 60): string {
  const lines = text.split(/\r?\n/);
  const shown = lines.slice(0, maxLines).join("\n");
  return lines.length > maxLines ? `${shown}\n... ${lines.length - maxLines} more lines` : shown;
}

function applyUpdateChunks(before: string, chunks: UpdateChunk[], filePath: string): string {
  const usesCrLf = before.includes("\r\n");
  let after = before.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (const chunk of chunks) {
    const oldBlock = chunk.oldLines.join("\n");
    const newBlock = chunk.newLines.join("\n");
    if (!oldBlock && !newBlock) continue;
    if (!oldBlock) {
      after = `${after}${after.endsWith("\n") || !after ? "" : "\n"}${newBlock}${newBlock.endsWith("\n") ? "" : "\n"}`;
      continue;
    }
    if (!after.includes(oldBlock)) {
      throw new Error(`Patch context not found in ${filePath}: ${previewText(oldBlock, 8)}`);
    }
    after = after.replace(oldBlock, newBlock);
  }
  return usesCrLf ? after.replace(/\n/g, "\r\n") : after;
}

export function patchPaths(patchText: string): string[] {
  const operations = parsePatch(patchText);
  return [...new Set(operations.flatMap((operation) => {
    if (operation.type === "update" && operation.moveTo) return [operation.path, operation.moveTo];
    return [operation.path];
  }))];
}

export async function previewPatch(cwd: string, patchText: string): Promise<string> {
  const operations = parsePatch(patchText);
  const lines: string[] = ["Patch preview:"];
  for (const operation of operations) {
    const target = resolveInside(cwd, operation.path);
    const rel = path.relative(cwd, target).replaceAll(path.sep, "/");
    if (operation.type === "add") {
      lines.push(`A ${rel} (${operation.lines.length} lines)`);
      lines.push(previewText(fileTextFromLines(operation.lines), 20));
      continue;
    }
    if (operation.type === "delete") {
      lines.push(`D ${rel}`);
      continue;
    }
    const move = operation.moveTo ? ` -> ${operation.moveTo}` : "";
    lines.push(`M ${rel}${move} (${operation.chunks.length} chunks)`);
  }
  return lines.join("\n").trim();
}

export async function applyPatch(cwd: string, patchText: string): Promise<string> {
  const operations = parsePatch(patchText);
  const changed: string[] = [];

  for (const operation of operations) {
    const target = resolveInside(cwd, operation.path);
    const rel = path.relative(cwd, target).replaceAll(path.sep, "/");

    if (operation.type === "add") {
      if (await exists(target)) throw new Error(`Add File target already exists: ${rel}`);
      const after = fileTextFromLines(operation.lines);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, after, "utf8");
      await recordEdit(cwd, target, null, after, "apply_patch add");
      changed.push(`A ${rel}`);
      continue;
    }

    if (operation.type === "delete") {
      if (!await exists(target)) throw new Error(`Delete File target does not exist: ${rel}`);
      const before = await readFile(target, "utf8");
      await rm(target, { force: true });
      await recordEdit(cwd, target, before, null, "apply_patch delete");
      changed.push(`D ${rel}`);
      continue;
    }

    if (!await exists(target)) throw new Error(`Update File target does not exist: ${rel}`);
    const before = await readFile(target, "utf8");
    const after = applyUpdateChunks(before, operation.chunks, rel);
    const finalTarget = operation.moveTo ? resolveInside(cwd, operation.moveTo) : target;
    const finalRel = path.relative(cwd, finalTarget).replaceAll(path.sep, "/");
    const beforeFinalTarget = finalTarget === target || !await exists(finalTarget)
      ? null
      : await readFile(finalTarget, "utf8");

    await mkdir(path.dirname(finalTarget), { recursive: true });
    await writeFile(finalTarget, after, "utf8");
    if (finalTarget !== target) {
      await rm(target, { force: true });
      await recordEdit(cwd, target, before, null, "apply_patch move-from");
      await recordEdit(cwd, finalTarget, beforeFinalTarget, after, "apply_patch move-to");
      changed.push(`R ${rel} -> ${finalRel}`);
    } else {
      await recordEdit(cwd, target, before, after, "apply_patch update");
      changed.push(`M ${rel}`);
    }
  }

  return `Applied patch:\n${changed.join("\n")}`;
}
