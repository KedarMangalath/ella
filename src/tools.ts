import { exec } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ApprovalMode, ToolCall, ToolContext, ToolDefinition, ToolRisk } from "./types.js";

const execAsync = promisify(exec);

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  ".ella",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
]);

function stringArg(input: Record<string, unknown>, key: string, fallback = ""): string {
  const value = input[key];
  return typeof value === "string" ? value : fallback;
}

function numberArg(input: Record<string, unknown>, key: string, fallback: number): number {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveInside(cwd: string, requested: string): string {
  const target = path.resolve(cwd, requested || ".");
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

async function walkFiles(root: string, maxDepth: number, currentDepth = 0): Promise<string[]> {
  if (currentDepth > maxDepth) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push(...await walkFiles(fullPath, maxDepth, currentDepth + 1));
      continue;
    }
    if (entry.isFile()) results.push(fullPath);
  }

  return results;
}

function relativeList(cwd: string, files: string[]): string {
  return files.map((file) => path.relative(cwd, file).replaceAll(path.sep, "/")).sort().join("\n");
}

async function readTextLimited(filePath: string, limitBytes: number): Promise<string> {
  const info = await stat(filePath);
  if (info.size > limitBytes) {
    const handle = await readFile(filePath);
    return `${handle.subarray(0, limitBytes).toString("utf8")}\n\n[truncated ${info.size - limitBytes} bytes]`;
  }
  return readFile(filePath, "utf8");
}

function shellForPlatform(command: string): string {
  if (process.platform === "win32") {
    return `powershell.exe -NoProfile -Command ${JSON.stringify(command)}`;
  }
  return command;
}

function isAllowed(mode: ApprovalMode, risk: ToolRisk): boolean {
  if (risk === "read") return true;
  if (mode === "read-only") return false;
  if (mode === "full-auto") return true;
  if (mode === "auto-edit" && risk === "edit") return true;
  return false;
}

async function ensureApproval(tool: ToolDefinition, input: Record<string, unknown>, context: ToolContext): Promise<void> {
  if (isAllowed(context.approvalMode, tool.risk)) return;
  const preview = tool.preview ? await tool.preview(input, context) : JSON.stringify(input);
  const approved = await context.askApproval(`Allow ${tool.risk} tool ${tool.name}?\n${preview}`);
  if (!approved) throw new Error(`User denied ${tool.name}.`);
}

function previewText(text: string, maxLines = 80): string {
  const lines = text.split(/\r?\n/);
  const shown = lines.slice(0, maxLines).join("\n");
  return lines.length > maxLines ? `${shown}\n... ${lines.length - maxLines} more lines` : shown;
}

async function fileEditPreview(target: string, content: string, cwd: string): Promise<string> {
  const rel = path.relative(cwd, target).replaceAll(path.sep, "/");
  if (!await exists(target)) {
    return `Create ${rel}\n--- new content ---\n${previewText(content)}`;
  }
  const before = await readTextLimited(target, 24_000);
  return `Overwrite ${rel}\n--- current ---\n${previewText(before, 40)}\n--- new ---\n${previewText(content, 40)}`;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "list_files",
    description: "List workspace files, skipping generated/dependency directories.",
    risk: "read",
    async run(input, context) {
      const target = resolveInside(context.cwd, stringArg(input, "path", "."));
      const maxDepth = Math.min(numberArg(input, "maxDepth", 3), 8);
      const files = await walkFiles(target, maxDepth);
      return relativeList(context.cwd, files).slice(0, 50000);
    },
  },
  {
    name: "read_file",
    description: "Read a UTF-8 text file from the workspace.",
    risk: "read",
    async run(input, context) {
      const target = resolveInside(context.cwd, stringArg(input, "path"));
      return readTextLimited(target, 48_000);
    },
  },
  {
    name: "search_files",
    description: "Search workspace text files for a literal query.",
    risk: "read",
    async run(input, context) {
      const query = stringArg(input, "query");
      if (!query) throw new Error("search_files requires query.");
      const target = resolveInside(context.cwd, stringArg(input, "path", "."));
      const maxResults = Math.min(numberArg(input, "maxResults", 20), 100);
      const files = await walkFiles(target, 8);
      const matches: string[] = [];

      for (const file of files) {
        if (matches.length >= maxResults) break;
        let text = "";
        try {
          text = await readTextLimited(file, 128_000);
        } catch {
          continue;
        }
        const lines = text.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          if (lines[index]?.includes(query)) {
            const rel = path.relative(context.cwd, file).replaceAll(path.sep, "/");
            matches.push(`${rel}:${index + 1}: ${lines[index]}`);
            if (matches.length >= maxResults) break;
          }
        }
      }

      return matches.length ? matches.join("\n") : "No matches.";
    },
  },
  {
    name: "write_file",
    description: "Create or fully overwrite a workspace file.",
    risk: "edit",
    async preview(input, context) {
      const target = resolveInside(context.cwd, stringArg(input, "path"));
      return fileEditPreview(target, stringArg(input, "content"), context.cwd);
    },
    async run(input, context) {
      const target = resolveInside(context.cwd, stringArg(input, "path"));
      const content = stringArg(input, "content");
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
      return `Wrote ${path.relative(context.cwd, target).replaceAll(path.sep, "/")} (${content.length} chars).`;
    },
  },
  {
    name: "replace_in_file",
    description: "Replace exact text inside a workspace file.",
    risk: "edit",
    async preview(input, context) {
      const target = resolveInside(context.cwd, stringArg(input, "path"));
      const rel = path.relative(context.cwd, target).replaceAll(path.sep, "/");
      return `Replace in ${rel}\n--- find ---\n${previewText(stringArg(input, "find"), 40)}\n--- replace ---\n${previewText(stringArg(input, "replace"), 40)}`;
    },
    async run(input, context) {
      const target = resolveInside(context.cwd, stringArg(input, "path"));
      const find = stringArg(input, "find");
      const replace = stringArg(input, "replace");
      if (!find) throw new Error("replace_in_file requires non-empty find.");
      const before = await readFile(target, "utf8");
      if (!before.includes(find)) throw new Error("Exact text not found.");
      const after = before.replace(find, replace);
      await writeFile(target, after, "utf8");
      return `Updated ${path.relative(context.cwd, target).replaceAll(path.sep, "/")}.`;
    },
  },
  {
    name: "run_shell",
    description: "Run a shell command in the workspace.",
    risk: "shell",
    async preview(input, context) {
      const cwd = resolveInside(context.cwd, stringArg(input, "cwd", "."));
      return `cwd: ${path.relative(context.cwd, cwd) || "."}\ncommand: ${stringArg(input, "command")}`;
    },
    async run(input, context) {
      const command = stringArg(input, "command");
      if (!command) throw new Error("run_shell requires command.");
      const cwd = resolveInside(context.cwd, stringArg(input, "cwd", "."));
      const { stdout, stderr } = await execAsync(shellForPlatform(command), {
        cwd,
        timeout: 120_000,
        maxBuffer: 1024 * 1024 * 5,
      });
      return [stdout, stderr].filter(Boolean).join("\n").trim() || "Command completed with no output.";
    },
  },
  {
    name: "git_status",
    description: "Show git status.",
    risk: "read",
    async run(_input, context) {
      if (!await exists(path.join(context.cwd, ".git"))) return "No .git directory in current workspace.";
      const { stdout, stderr } = await execAsync("git status --short", { cwd: context.cwd });
      return [stdout, stderr].filter(Boolean).join("\n").trim() || "Clean worktree.";
    },
  },
  {
    name: "git_diff",
    description: "Show git diff, optionally for one path.",
    risk: "read",
    async run(input, context) {
      const requestedPath = stringArg(input, "path");
      const command = requestedPath ? `git diff -- ${JSON.stringify(requestedPath)}` : "git diff";
      const { stdout, stderr } = await execAsync(command, {
        cwd: context.cwd,
        maxBuffer: 1024 * 1024 * 5,
      });
      return [stdout, stderr].filter(Boolean).join("\n").trim() || "No diff.";
    },
  },
];

export function parseToolCalls(text: string): ToolCall[] {
  const regex = /<ella_tool\s+name="([^"]+)">\s*([\s\S]*?)\s*<\/ella_tool>/g;
  const calls: ToolCall[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const [, name, rawJson] = match;
    try {
      const parsed = JSON.parse(rawJson ?? "{}") as Record<string, unknown>;
      calls.push({ name: name ?? "", input: parsed, raw: match[0] });
    } catch (error) {
      calls.push({
        name: name ?? "",
        input: {
          error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          raw: rawJson,
        },
        raw: match[0],
      });
    }
  }
  return calls;
}

export async function runToolCall(call: ToolCall, context: ToolContext): Promise<string> {
  const tool = TOOLS.find((candidate) => candidate.name === call.name);
  if (!tool) return `Unknown tool: ${call.name}`;
  try {
    await ensureApproval(tool, call.input, context);
    return await tool.run(call.input, context);
  } catch (error) {
    return `Tool ${call.name} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function toolHelp(): string {
  return TOOLS.map((tool) => `- ${tool.name} [${tool.risk}]: ${tool.description}`).join("\n");
}
