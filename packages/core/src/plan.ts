import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { SessionRecord, ChatMessage } from "./types.js";

export interface EllaPlан {
  version: "1";
  sessionId: string;
  title: string;
  model: string;
  provider: string;
  thinkingMode: string;
  cwd: string;
  createdAt: string;
  steps: PlanStep[];
  metadata: Record<string, unknown>;
}

export interface PlanStep {
  turn: number;
  prompt: string;
  response?: string;
  status: "done" | "pending";
  cost?: number;
}

function yamlescape(s: string): string {
  if (!s.includes("\n") && !s.includes('"') && !s.includes("'") && !s.includes(":") && !s.includes("#")) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function toYaml(plan: EllaPlан): string {
  const lines: string[] = [
    `# ELLA Plan — ${plan.title}`,
    `version: "1"`,
    `sessionId: ${yamlescape(plan.sessionId)}`,
    `title: ${yamlescape(plan.title)}`,
    `model: ${yamlescape(plan.model)}`,
    `provider: ${yamlescape(plan.provider)}`,
    `thinkingMode: ${yamlescape(plan.thinkingMode)}`,
    `cwd: ${yamlescape(plan.cwd)}`,
    `createdAt: ${yamlescape(plan.createdAt)}`,
    `steps:`,
  ];

  for (const step of plan.steps) {
    lines.push(`  - turn: ${step.turn}`);
    lines.push(`    status: ${step.status}`);
    lines.push(`    prompt: ${yamlescape(step.prompt)}`);
    if (step.response) lines.push(`    response: ${yamlescape(step.response.slice(0, 200))}`);
    if (step.cost) lines.push(`    cost: ${step.cost.toFixed(6)}`);
  }

  return lines.join("\n") + "\n";
}

export async function exportPlan(session: SessionRecord, outputDir: string): Promise<string> {
  const conversation = session.messages.filter((m) => m.role !== "system");
  const steps: PlanStep[] = [];
  let turn = 0;
  for (let i = 0; i < conversation.length; i += 2) {
    const user = conversation[i];
    const assistant = conversation[i + 1];
    if (!user || user.role !== "user") continue;
    steps.push({
      turn,
      prompt: user.content,
      response: assistant?.content,
      status: "done",
    });
    turn++;
  }

  const plan: EllaPlан = {
    version: "1",
    sessionId: session.id,
    title: session.title,
    model: session.model,
    provider: session.provider,
    thinkingMode: session.thinkingMode,
    cwd: session.cwd,
    createdAt: session.createdAt,
    steps,
    metadata: {
      totalInputTokens: session.totalInputTokens,
      totalOutputTokens: session.totalOutputTokens,
      costUsd: session.costUsd,
      tags: session.tags ?? [],
    },
  };

  await mkdir(outputDir, { recursive: true });
  const outPath = path.join(outputDir, `.ella-plan-${session.id.slice(0, 8)}.yaml`);
  await writeFile(outPath, toYaml(plan), "utf8");
  return outPath;
}

export async function importPlan(filePath: string): Promise<Array<{ prompt: string; status: string }>> {
  const raw = await readFile(filePath, "utf8");
  const steps: Array<{ prompt: string; status: string }> = [];
  const promptRe = /prompt:\s*(.+)/g;
  const statusRe = /status:\s*(.+)/g;
  let pm: RegExpExecArray | null;
  let sm: RegExpExecArray | null;
  const prompts: string[] = [];
  const statuses: string[] = [];
  while ((pm = promptRe.exec(raw)) !== null) prompts.push(pm[1]!.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n"));
  while ((sm = statusRe.exec(raw)) !== null) statuses.push(sm[1]!.trim());
  for (let i = 0; i < prompts.length; i++) steps.push({ prompt: prompts[i]!, status: statuses[i] ?? "pending" });
  return steps;
}
