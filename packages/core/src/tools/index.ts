import { exec } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import type { UndoRecord } from "../types.js";
import path from "node:path";
import { promisify } from "node:util";
import type { ApprovalMode, ToolCall, ToolContext, ToolDefinition, ToolRisk } from "../types.js";

const execAsync = promisify(exec);

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", ".next", ".turbo",
  ".cache", ".ella", "coverage", "__pycache__", ".venv", "venv",
]);

function str(input: Record<string, unknown>, key: string, fallback = ""): string {
  const v = input[key];
  return typeof v === "string" ? v : fallback;
}

function num(input: Record<string, unknown>, key: string, fallback: number): number {
  const v = input[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function resolveInside(cwd: string, req: string): string {
  const target = path.resolve(cwd, req || ".");
  const root = path.resolve(cwd);
  if (target !== root && !target.startsWith(root + path.sep))
    throw new Error(`Path outside workspace denied: ${req}`);
  return target;
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

async function walkFiles(root: string, maxDepth: number, depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const results: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".env.example") continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      results.push(...await walkFiles(full, maxDepth, depth + 1));
    } else if (e.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function relList(cwd: string, files: string[]): string {
  return files.map((f) => path.relative(cwd, f).replaceAll(path.sep, "/")).sort().join("\n");
}

async function readLimited(p: string, limit: number): Promise<string> {
  const info = await stat(p);
  if (info.size > limit) {
    const buf = await readFile(p);
    return `${buf.subarray(0, limit).toString("utf8")}\n[truncated ${info.size - limit} bytes]`;
  }
  return readFile(p, "utf8");
}

function shellCmd(cmd: string): string {
  if (process.platform === "win32") return `powershell.exe -NoProfile -Command ${JSON.stringify(cmd)}`;
  return cmd;
}

function isAutoAllowed(mode: ApprovalMode, risk: ToolRisk): boolean {
  if (risk === "read") return true;
  if (mode === "read-only") return false;
  if (mode === "full-auto") return true;
  if (mode === "auto-edit" && risk === "edit") return true;
  return false;
}

function shellPatterns(cmd: string): string[] {
  const tokens = cmd.trim().split(/\s+/).filter(Boolean);
  return [...new Set([
    cmd.trim(),
    tokens[0] ?? "",
    tokens.slice(0, 2).join(" "),
    tokens.slice(0, 3).join(" "),
  ])];
}

async function ensureApproval(tool: ToolDefinition, input: Record<string, unknown>, ctx: ToolContext): Promise<void> {
  if (ctx.approvalMode === "read-only" && tool.risk !== "read")
    throw new Error(`Read-only mode denied ${tool.name}.`);
  if (isAutoAllowed(ctx.approvalMode, tool.risk)) return;
  const preview = tool.preview ? await tool.preview(input, ctx) : JSON.stringify(input);
  const ok = await ctx.askApproval(`Allow ${tool.risk} tool "${tool.name}"?`, preview);
  if (!ok) throw new Error(`User denied ${tool.name}.`);
}

function previewText(text: string, max = 60): string {
  const lines = text.split(/\r?\n/);
  return lines.length > max
    ? `${lines.slice(0, max).join("\n")}\n… +${lines.length - max} lines`
    : text;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "list_files",
    description: "List workspace files, skipping generated/dependency dirs.",
    risk: "read",
    patterns: (i) => [str(i, "path", ".")],
    async run(i, ctx) {
      const target = resolveInside(ctx.cwd, str(i, "path", "."));
      const files = await walkFiles(target, Math.min(num(i, "maxDepth", 3), 8));
      return relList(ctx.cwd, files).slice(0, 50000);
    },
  },
  {
    name: "read_file",
    description: "Read a UTF-8 text file from the workspace.",
    risk: "read",
    patterns: (i) => [str(i, "path")],
    async run(i, ctx) {
      return readLimited(resolveInside(ctx.cwd, str(i, "path")), 48_000);
    },
  },
  {
    name: "search_files",
    description: "Search workspace text files for a literal string.",
    risk: "read",
    patterns: (i) => [str(i, "path", ".")],
    async run(i, ctx) {
      const query = str(i, "query");
      if (!query) throw new Error("search_files requires query.");
      const files = await walkFiles(resolveInside(ctx.cwd, str(i, "path", ".")), 8);
      const max = Math.min(num(i, "maxResults", 20), 100);
      const hits: string[] = [];
      for (const f of files) {
        if (hits.length >= max) break;
        let text = "";
        try { text = await readLimited(f, 128_000); } catch { continue; }
        const lines = text.split(/\r?\n/);
        for (let n = 0; n < lines.length; n++) {
          if (lines[n]?.includes(query)) {
            hits.push(`${path.relative(ctx.cwd, f).replaceAll(path.sep, "/")}:${n + 1}: ${lines[n]}`);
            if (hits.length >= max) break;
          }
        }
      }
      return hits.length ? hits.join("\n") : "No matches.";
    },
  },
  {
    name: "write_file",
    description: "Create or fully overwrite a workspace file.",
    risk: "edit",
    patterns: (i) => [str(i, "path")],
    async preview(i, ctx) {
      const target = resolveInside(ctx.cwd, str(i, "path"));
      const rel = path.relative(ctx.cwd, target).replaceAll(path.sep, "/");
      if (!await fileExists(target)) return `Create ${rel}\n${previewText(str(i, "content"))}`;
      const before = await readLimited(target, 24_000);
      return `Overwrite ${rel}\n--- before ---\n${previewText(before, 20)}\n--- after ---\n${previewText(str(i, "content"), 20)}`;
    },
    async run(i, ctx) {
      const target = resolveInside(ctx.cwd, str(i, "path"));
      const content = str(i, "content");
      let before: string | null = null;
      try { before = await readFile(target, "utf8"); } catch { /* new file */ }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
      const rel = path.relative(ctx.cwd, target).replaceAll(path.sep, "/");
      ctx.onFileTouch?.(rel);
      await ctx.undoJournal?.push({ path: target, before, after: content, tool: "write_file", timestamp: new Date().toISOString() });
      return `Wrote ${rel} (${content.length} chars).`;
    },
  },
  {
    name: "replace_in_file",
    description: "Replace an exact string in a workspace file.",
    risk: "edit",
    patterns: (i) => [str(i, "path")],
    async preview(i, ctx) {
      const rel = path.relative(ctx.cwd, resolveInside(ctx.cwd, str(i, "path"))).replaceAll(path.sep, "/");
      return `replace_in_file ${rel}\n--- find ---\n${str(i, "find").slice(0, 300)}\n--- replace ---\n${str(i, "replace").slice(0, 300)}`;
    },
    async run(i, ctx) {
      const target = resolveInside(ctx.cwd, str(i, "path"));
      const find = str(i, "find");
      const replace = str(i, "replace");
      if (!find) throw new Error("replace_in_file requires non-empty find.");
      const before = await readFile(target, "utf8");
      if (!before.includes(find)) throw new Error("Exact text not found in file.");
      const after = before.replace(find, replace);
      await writeFile(target, after, "utf8");
      const rel = path.relative(ctx.cwd, target).replaceAll(path.sep, "/");
      ctx.onFileTouch?.(rel);
      await ctx.undoJournal?.push({ path: target, before, after, tool: "replace_in_file", timestamp: new Date().toISOString() });
      return `Updated ${rel}.`;
    },
  },
  {
    name: "run_shell",
    description: "Run a shell command in the workspace.",
    risk: "shell",
    patterns: (i) => shellPatterns(str(i, "command")),
    async preview(i, ctx) {
      const cwd = resolveInside(ctx.cwd, str(i, "cwd", "."));
      return `cwd: ${path.relative(ctx.cwd, cwd) || "."}\n$ ${str(i, "command")}`;
    },
    async run(i, ctx) {
      const command = str(i, "command");
      if (!command) throw new Error("run_shell requires command.");
      const cwd = resolveInside(ctx.cwd, str(i, "cwd", "."));
      const { stdout, stderr } = await execAsync(shellCmd(command), {
        cwd,
        timeout: 120_000,
        maxBuffer: 5 * 1024 * 1024,
      });
      return [stdout, stderr].filter(Boolean).join("\n").trim() || "Command completed.";
    },
  },
  {
    name: "git_status",
    description: "Show git status.",
    risk: "read",
    patterns: () => ["git status"],
    async run(_i, ctx) {
      if (!await fileExists(path.join(ctx.cwd, ".git"))) return "No .git directory.";
      const { stdout } = await execAsync("git status --short", { cwd: ctx.cwd });
      return stdout.trim() || "Clean worktree.";
    },
  },
  {
    name: "git_diff",
    description: "Show git diff, optionally for a specific path.",
    risk: "read",
    patterns: (i) => [str(i, "path") || "git diff"],
    async run(i, ctx) {
      const p = str(i, "path");
      const cmd = p ? `git diff -- ${JSON.stringify(p)}` : "git diff";
      const { stdout } = await execAsync(cmd, { cwd: ctx.cwd, maxBuffer: 5 * 1024 * 1024 });
      return stdout.trim() || "No diff.";
    },
  },
  {
    name: "git_log",
    description: "Show recent git commits.",
    risk: "read",
    patterns: () => ["git log"],
    async run(i, ctx) {
      const limit = Math.min(num(i, "limit", 10), 50);
      const { stdout } = await execAsync(
        `git log --oneline --decorate -${limit}`,
        { cwd: ctx.cwd },
      );
      return stdout.trim() || "No commits.";
    },
  },
];

export function parseToolCalls(text: string): ToolCall[] {
  const re = /<ella_tool\s+name="([^"]+)">\s*([\s\S]*?)\s*<\/ella_tool>/g;
  const calls: ToolCall[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, name, raw] = m;
    try {
      calls.push({ name: name ?? "", input: JSON.parse(raw ?? "{}") as Record<string, unknown>, raw: m[0] });
    } catch (e) {
      calls.push({ name: name ?? "", input: { error: String(e) }, raw: m[0] });
    }
  }
  return calls;
}

export async function runToolCall(call: ToolCall, ctx: ToolContext): Promise<string> {
  const tool = TOOLS.find((t) => t.name === call.name);
  if (!tool) return `Unknown tool: ${call.name}`;
  try {
    await ensureApproval(tool, call.input, ctx);
    return await tool.run(call.input, ctx);
  } catch (e) {
    return `Tool ${call.name} failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export function toolHelp(): string {
  return TOOLS.map((t) => `- ${t.name} [${t.risk}]: ${t.description}`).join("\n");
}
