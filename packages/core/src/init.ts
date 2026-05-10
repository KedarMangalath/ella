import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { ellaHome, configPath, defaultConfig, saveConfig } from "./config.js";
import { createExampleSkill } from "./skills.js";

const GITIGNORE = `# ELLA local files
memory.md
todos.json
undo/

# Keep skills in version control
!skills/
`;

export interface InitResult {
  configCreated: boolean;
  projectDir: string;
  skillExample: string;
  lines: string[];
}

const MEMORY_TEMPLATE = `# Project Memory

Ella stores project-specific context here. Use /remember <text> to add entries,
or edit this file directly. Entries are injected into the system prompt.

<!-- example entry:
- The database uses PostgreSQL 16 with RLS enabled on all tables.
- Deploy via: npm run deploy (runs tsc + docker build + push to ECR).
-->
`;

export async function ellaInit(cwd: string): Promise<InitResult> {
  const lines: string[] = [];
  const projectDir = path.join(cwd, ".ella");
  const globalDir = ellaHome();

  // Create project dirs
  await mkdir(projectDir, { recursive: true });
  await mkdir(path.join(projectDir, "skills"), { recursive: true });
  await mkdir(path.join(projectDir, "plugins"), { recursive: true });
  await mkdir(globalDir, { recursive: true });

  // Write .ella/.gitignore
  await writeFile(path.join(projectDir, ".gitignore"), GITIGNORE, "utf8");
  lines.push(`  created  ${path.join(projectDir, ".gitignore")}`);

  // Create memory.md stub if it doesn't exist
  const memPath = path.join(projectDir, "memory.md");
  try {
    await access(memPath);
    lines.push(`  exists   ${memPath} (unchanged)`);
  } catch {
    await writeFile(memPath, MEMORY_TEMPLATE, "utf8");
    lines.push(`  created  ${memPath}`);
  }

  // Global config — only if doesn't exist
  let configCreated = false;
  try {
    await access(configPath());
    lines.push(`  exists   ${configPath()} (unchanged)`);
  } catch {
    await saveConfig(defaultConfig());
    configCreated = true;
    lines.push(`  created  ${configPath()}`);
  }

  // Example skill
  const skillExample = await createExampleSkill(cwd);
  lines.push(`  created  ${skillExample}`);

  lines.push("");
  lines.push("Next steps:");
  lines.push("  1. Set your API key:");
  lines.push("       export ANTHROPIC_API_KEY=sk-ant-...");
  lines.push("     or add it to ~/.ella/config.json → providers.anthropic.apiKey");
  lines.push("  2. Run: ella");
  lines.push("  3. Add skills in .ella/skills/*.md to customize Ella's behavior");
  lines.push("  4. Add MCP servers: ella mcp add <name> <command> [args...]");
  lines.push("  5. Add plugins in .ella/plugins/*.js (beforePrompt/afterPrompt hooks)");
  lines.push("  6. Edit .ella/memory.md to persist project context across sessions");

  return { configCreated, projectDir, skillExample, lines };
}
