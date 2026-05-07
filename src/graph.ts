import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

interface GraphFile {
  path: string;
  imports: string[];
  symbols: string[];
  size: number;
}

interface RepoGraph {
  version: 1;
  root: string;
  builtAt: string;
  files: GraphFile[];
}

const SKIP_DIRS = new Set([
  ".git",
  ".ella",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
]);

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".php",
  ".rb",
  ".md",
  ".json",
]);

function graphPath(cwd: string): string {
  return path.join(cwd, ".ella", "graph.json");
}

async function walk(root: string, cwd: string, depth = 0): Promise<string[]> {
  if (depth > 12) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...await walk(full, cwd, depth + 1));
    } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(path.relative(cwd, full).replaceAll(path.sep, "/"));
    }
  }
  return files;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function extractImports(text: string): string[] {
  const matches = [
    ...text.matchAll(/import\s+(?:.+?\s+from\s+)?["']([^"']+)["']/g),
    ...text.matchAll(/require\(["']([^"']+)["']\)/g),
    ...text.matchAll(/from\s+([a-zA-Z0-9_.]+)\s+import/g),
  ];
  return unique(matches.map((match) => match[1] || ""));
}

function extractSymbols(text: string): string[] {
  const matches = [
    ...text.matchAll(/\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g),
    ...text.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g),
    ...text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g),
    ...text.matchAll(/\bdef\s+([A-Za-z_]\w*)/g),
  ];
  return unique(matches.map((match) => match[1] || ""));
}

export async function buildGraph(cwd: string): Promise<string> {
  const files = await walk(cwd, cwd);
  const graphFiles: GraphFile[] = [];
  for (const rel of files) {
    const full = path.join(cwd, rel);
    const info = await stat(full);
    if (info.size > 512 * 1024) continue;
    let text = "";
    try {
      text = await readFile(full, "utf8");
    } catch {
      continue;
    }
    graphFiles.push({
      path: rel,
      imports: extractImports(text),
      symbols: extractSymbols(text),
      size: info.size,
    });
  }

  const graph: RepoGraph = {
    version: 1,
    root: cwd,
    builtAt: new Date().toISOString(),
    files: graphFiles.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await mkdir(path.dirname(graphPath(cwd)), { recursive: true });
  await writeFile(graphPath(cwd), JSON.stringify(graph, null, 2), "utf8");
  return `Graph built: ${graph.files.length} files, ${graph.files.reduce((sum, file) => sum + file.symbols.length, 0)} symbols.`;
}

export async function loadGraph(cwd: string): Promise<RepoGraph | null> {
  try {
    return JSON.parse(await readFile(graphPath(cwd), "utf8")) as RepoGraph;
  } catch {
    return null;
  }
}

export async function graphStats(cwd: string): Promise<string> {
  const graph = await loadGraph(cwd);
  if (!graph) return "No graph. Run: ella graph build";
  const imports = graph.files.reduce((sum, file) => sum + file.imports.length, 0);
  const symbols = graph.files.reduce((sum, file) => sum + file.symbols.length, 0);
  const largest = [...graph.files].sort((a, b) => b.size - a.size).slice(0, 5);
  return [
    `Built: ${graph.builtAt}`,
    `Files: ${graph.files.length}`,
    `Imports: ${imports}`,
    `Symbols: ${symbols}`,
    "Largest files:",
    ...largest.map((file) => `- ${file.path} (${file.size} bytes)`),
  ].join("\n");
}

export async function graphSearch(cwd: string, query: string): Promise<string> {
  const graph = await loadGraph(cwd);
  if (!graph) return "No graph. Run: ella graph build";
  const needle = query.toLowerCase();
  const matches = graph.files
    .filter((file) =>
      file.path.toLowerCase().includes(needle) ||
      file.imports.some((item) => item.toLowerCase().includes(needle)) ||
      file.symbols.some((item) => item.toLowerCase().includes(needle)),
    )
    .slice(0, 30);
  if (!matches.length) return "No graph matches.";
  return matches.map((file) => `${file.path}\n  symbols: ${file.symbols.slice(0, 8).join(", ") || "-"}\n  imports: ${file.imports.slice(0, 8).join(", ") || "-"}`).join("\n");
}

export async function graphImpact(cwd: string, target: string): Promise<string> {
  const graph = await loadGraph(cwd);
  if (!graph) return "No graph. Run: ella graph build";
  const normalized = target.replaceAll("\\", "/").toLowerCase();
  const impacted = graph.files.filter((file) =>
    file.path.toLowerCase().includes(normalized) ||
    file.imports.some((item) => item.toLowerCase().includes(normalized) || normalized.includes(item.toLowerCase().replace(/^\.\//, ""))),
  );
  if (!impacted.length) return "No obvious impacted files found.";
  return impacted.slice(0, 50).map((file) => `- ${file.path}`).join("\n");
}
