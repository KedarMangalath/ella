export type AgentId = "opencode" | "codex" | "gemini";

export type CoordinatorMode =
  | "route"    // assign subtasks to the best agent per strength
  | "race"     // send same task to all, pick/merge best result
  | "debate";  // agents critique each other, ella adjudicates

export interface AgentStrengths {
  longContext: number;    // 0-10
  codeGeneration: number;
  shellOps: number;
  multiFile: number;
  reasoning: number;
}

export interface AgentAdapter {
  readonly id: AgentId;
  readonly strengths: AgentStrengths;
  start(cwd: string): Promise<void>;
  send(prompt: string): Promise<void>;
  stream(): AsyncGenerator<AgentStreamEvent>;
  cancel(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export type AgentStreamEventKind =
  | "token"
  | "tool_use"
  | "tool_result"
  | "done"
  | "error"
  | "status";

export interface AgentStreamEvent {
  agentId: AgentId;
  kind: AgentStreamEventKind;
  text?: string;
  toolName?: string;
  error?: string;
}

export interface TaskDecomposition {
  subtasks: SubTask[];
}

export interface SubTask {
  id: string;
  description: string;
  assignedTo: AgentId[];
  dependsOn?: string[];
}

export interface AgentResult {
  agentId: AgentId;
  text: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface CoordinatorResult {
  mode: CoordinatorMode;
  results: AgentResult[];
  finalText: string;
  winner?: AgentId;
}

export interface BridgeConfig {
  mode: CoordinatorMode;
  agents: AgentId[];
  timeout?: number;
  worktreeBase?: string;
  opencodePort?: number;
}
