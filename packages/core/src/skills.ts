import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ellaHome } from "./config.js";
import type { SkillDef } from "./types.js";

function parseSkillFile(content: string, filename: string): SkillDef {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return {
      name: filename.replace(/\.md$/, ""),
      description: "",
      content: content.trim(),
    };
  }

  const [, frontmatter, body] = frontmatterMatch;
  const meta: Record<string, string> = {};
  for (const line of (frontmatter ?? "").split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) meta[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
  }

  return {
    name: meta["name"] ?? filename.replace(/\.md$/, ""),
    description: meta["description"] ?? "",
    trigger: meta["trigger"],
    content: (body ?? "").trim(),
  };
}

async function loadFromDir(dir: string): Promise<SkillDef[]> {
  const skills: SkillDef[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      try {
        const content = await readFile(path.join(dir, e.name), "utf8");
        skills.push(parseSkillFile(content, e.name));
      } catch { /* skip */ }
    }
  } catch { /* dir not found */ }
  return skills;
}

export async function loadSkills(cwd: string): Promise<SkillDef[]> {
  const [projectSkills, globalSkills] = await Promise.all([
    loadFromDir(path.join(cwd, ".ella", "skills")),
    loadFromDir(path.join(ellaHome(), "skills")),
  ]);
  // Project skills override global if same name
  const byName = new Map<string, SkillDef>();
  for (const s of [...globalSkills, ...projectSkills]) byName.set(s.name, s);
  return [...byName.values()];
}

export function skillsPromptBlock(skills: SkillDef[]): string {
  if (!skills.length) return "";
  const lines = ["## Active skills"];
  for (const s of skills) {
    lines.push(`\n### ${s.name}${s.description ? ` — ${s.description}` : ""}`);
    lines.push(s.content);
  }
  return lines.join("\n");
}

export async function createExampleSkill(cwd: string): Promise<string> {
  const dir = path.join(cwd, ".ella", "skills");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "example.md");
  await writeFile(file, [
    "---",
    'name: example',
    'description: Example skill — edit or delete this file',
    'trigger: optional keyword that activates this skill',
    "---",
    "",
    "When this skill is active, follow these instructions:",
    "- Prefer concise, idiomatic code",
    "- Always add JSDoc for public functions",
  ].join("\n"), "utf8");
  return file;
}
