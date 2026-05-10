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

export async function ellaInit(cwd: string): Promise<InitResult> {
  const lines: string[] = [];
  const projectDir = path.join(cwd, ".ella");
  const globalDir = ellaHome();

  await mkdir(projectDir, { recursive: true });
  await mkdir(path.join(projectDir, "skills"), { recursive: true });
  await mkdir(globalDir, { recursive: true });

  // Write .ella/.gitignore
  await writeFile(path.join(projectDir, ".gitignore"), GITIGNORE, "utf8");
  lines.push(`  created  ${path.join(projectDir, ".gitignore")}`);

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

  return { configCreated, projectDir, skillExample, lines };
}
