export type ProviderName = "openai" | "anthropic" | "gemini" | "openrouter";
export type ThinkingMode = "fast" | "balanced" | "deep" | "max";
export type ApprovalMode = "ask" | "auto-edit" | "full-auto" | "read-only";
export type PermissionAction = "allow" | "deny" | "ask";
export type ChatRole = "system" | "user" | "assistant";
export type ToolRisk = "read" | "edit" | "shell";
export type StreamEventKind = "token" | "thinking" | "tool_start" | "tool_end" | "done" | "error" | "cost" | "budget_warn" | "budget_exceeded" | "file_written" | "lsp_diagnostic";

export interface PermissionRule {
  permission: string;
  pattern: string;
  action: PermissionAction;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface StreamEvent {
  kind: StreamEventKind;
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  filePath?: string;
  diff?: string;
}

export interface SessionRecord {
  id: string;
  title: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  provider: ProviderName;
  model: string;
  thinkingMode: ThinkingMode;
  messages: ChatMessage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  costUsd: number;
  // Time-travel
  forkOf?: string;
  forkTurn?: number;
  // Heatmap: filepath → touch count
  fileTouches?: Record<string, number>;
  // Cost budget
  budgetUsd?: number;
  tags?: string[];
}

export interface PairResult {
  providerA: ProviderName;
  providerB: ProviderName;
  modelA: string;
  modelB: string;
  textA: string;
  textB: string;
  inputTokens: number;
  outputTokensA: number;
  outputTokensB: number;
  costUsd: number;
  elapsedMs: number;
}

export interface EvalTurn {
  turnIndex: number;
  prompt: string;
  originalResponse: string;
  newResponse: string;
  similarity: number;
}

export interface EvalResult {
  sessionId: string;
  model: string;
  turns: EvalTurn[];
  avgSimilarity: number;
  driftScore: number;
}

export interface TodoItem {
  id: string;
  text: string;
  status: "pending" | "done";
  createdAt: string;
  updatedAt: string;
}

export interface MemoryEntry {
  id: string;
  text: string;
  source: string;
  createdAt: string;
  sessionId?: string;
  turnIndex?: number;
  verified?: boolean;
}

export interface ProviderSettings {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface AccessibilitySettings {
  noColor: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  screenReader: boolean;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface EllaConfig {
  defaultProvider: ProviderName;
  defaultModel: string;
  thinkingMode: ThinkingMode;
  approvalMode: ApprovalMode;
  permissions: PermissionRule[];
  accessibility: AccessibilitySettings;
  providers: Record<ProviderName, ProviderSettings>;
  mcpServers?: McpServerConfig[];
}

export interface CompletionOptions {
  provider: ProviderName;
  model: string;
  thinkingMode: ThinkingMode;
  maxOutputTokens: number;
}

export interface ModelProvider {
  readonly name: ProviderName;
  stream(messages: ChatMessage[], options: CompletionOptions): AsyncGenerator<StreamEvent>;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  raw: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  risk: ToolRisk;
  permission?: string;
  patterns?(input: Record<string, unknown>, context: ToolContext): Promise<string[]> | string[];
  preview?(input: Record<string, unknown>, context: ToolContext): Promise<string>;
  run(input: Record<string, unknown>, context: ToolContext): Promise<string>;
}

export interface UndoJournalLike {
  push(record: UndoRecord): Promise<void>;
}

export interface McpManagerLike {
  allTools(): Array<{ name: string; description?: string; serverName: string; call(args: Record<string, unknown>): Promise<unknown> }>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  toolCount(): number;
}

export interface ToolContext {
  cwd: string;
  approvalMode: ApprovalMode;
  permissions: PermissionRule[];
  askApproval(reason: string, preview?: string, risk?: ToolRisk): Promise<boolean>;
  onEvent?(event: StreamEvent): void;
  onFileTouch?(filePath: string): void;
  undoJournal?: UndoJournalLike;
  mcpManager?: McpManagerLike;
}

export interface AgentRunOptions {
  cwd: string;
  prompt: string;
  messages?: ChatMessage[];
  onEvent?: (event: StreamEvent) => void;
  signal?: AbortSignal;
  budgetUsd?: number;
  onFileTouch?: (filePath: string) => void;
  undoJournal?: UndoJournalLike;
  extraContext?: string;
  mcpManager?: McpManagerLike;
  askApproval?: (reason: string, preview?: string, risk?: ToolRisk) => Promise<boolean>;
}

export interface AgentRunResult {
  text: string;
  messages: ChatMessage[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface SkillDef {
  name: string;
  description: string;
  trigger?: string;
  content: string;
}

export interface UndoRecord {
  path: string;
  before: string | null;
  after: string;
  tool: string;
  timestamp: string;
}
