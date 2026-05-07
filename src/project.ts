import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_DIR = ".ella";
const PROJECT_CONFIG = "project.json";
const INSTRUCTIONS = "ELLA.md";

async function writeIfMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return false;
  } catch {
    await writeFile(filePath, content, "utf8");
    return true;
  }
}

export async function initProject(cwd: string): Promise<string[]> {
  const created: string[] = [];
  const ellaDir = path.join(cwd, PROJECT_DIR);
  await mkdir(ellaDir, { recursive: true });

  const projectConfig = path.join(ellaDir, PROJECT_CONFIG);
  if (await writeIfMissing(projectConfig, JSON.stringify({
    name: path.basename(cwd),
    createdAt: new Date().toISOString(),
    memory: true,
    graph: {
      enabled: false,
      mode: "mcp-sidecar"
    }
  }, null, 2))) {
    created.push(path.relative(cwd, projectConfig));
  }

  const instructionsPath = path.join(cwd, INSTRUCTIONS);
  if (await writeIfMissing(instructionsPath, `# Ella Instructions

Project-specific instructions for Ella.

- Read existing code before editing.
- Keep changes scoped.
- Run relevant checks when possible.
- Summarize changed files and validation.
`)) {
    created.push(path.relative(cwd, instructionsPath));
  }

  return created;
}

export async function readProjectInstructions(cwd: string): Promise<string> {
  try {
    return await readFile(path.join(cwd, INSTRUCTIONS), "utf8");
  } catch {
    return "";
  }
}
