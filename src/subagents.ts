export interface SubagentProfile {
  name: string;
  mission: string;
  tools: string[];
}

export const SUBAGENTS: SubagentProfile[] = [
  {
    name: "planner",
    mission: "Break ambiguous work into ordered implementation steps, risks, and verification.",
    tools: ["read_file", "list_files", "search_files", "git_status"],
  },
  {
    name: "explorer",
    mission: "Map codebase structure, relevant files, dependencies, and constraints before edits.",
    tools: ["list_files", "read_file", "search_files", "git_diff"],
  },
  {
    name: "coder",
    mission: "Make focused code changes using existing project patterns.",
    tools: ["read_file", "replace_in_file", "write_file", "run_shell"],
  },
  {
    name: "reviewer",
    mission: "Find bugs, regressions, missing tests, and security risks.",
    tools: ["git_diff", "read_file", "search_files", "run_shell"],
  },
  {
    name: "tester",
    mission: "Detect relevant checks, run them, diagnose failures, and suggest repair loops.",
    tools: ["read_file", "search_files", "run_shell"],
  },
];

export function formatSubagents(): string {
  return SUBAGENTS
    .map((agent) => `${agent.name}\n  ${agent.mission}\n  tools: ${agent.tools.join(", ")}`)
    .join("\n");
}

export function swarmPrompt(task: string): string {
  return `Run a local agent swarm mentally for this task, using the roles below. Do not invent results: use tools to inspect files when needed.

Task:
${task}

Agents:
${formatSubagents()}

Workflow:
1. planner defines success criteria and steps.
2. explorer gathers codebase context.
3. coder proposes or applies focused changes.
4. tester runs or recommends validation.
5. reviewer checks risks before final answer.

Return final answer with sections: Plan, Context, Changes, Validation, Risks, Next.`;
}
