export type ProviderName = "openai" | "anthropic" | "gemini" | "openrouter";

export type ThinkingMode = "fast" | "balanced" | "deep" | "max";

export type ApprovalMode = "ask" | "auto-edit" | "full-auto" | "read-only";

export type PermissionAction = "allow" | "deny" | "ask";

export interface PermissionRule {
  permission: string;
  pattern: string;
  action: PermissionAction;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
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
}

export interface TodoItem {
  id: string;
  text: string;
  status: "pending" | "done";
  createdAt: string;
  updatedAt: string;
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

export interface EllaConfig {
  defaultProvider: ProviderName;
  defaultModel: string;
  thinkingMode: ThinkingMode;
  approvalMode: ApprovalMode;
  permissions: PermissionRule[];
  accessibility: AccessibilitySettings;
  providers: Record<ProviderName, ProviderSettings>;
}

export interface CompletionOptions {
  provider: ProviderName;
  model: string;
  thinkingMode: ThinkingMode;
  maxOutputTokens: number;
}

export interface ModelProvider {
  readonly name: ProviderName;
  complete(messages: ChatMessage[], options: CompletionOptions): Promise<string>;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  raw: string;
}

export type ToolRisk = "read" | "edit" | "shell";

export interface ToolDefinition {
  name: string;
  description: string;
  risk: ToolRisk;
  permission?: string;
  patterns?(input: Record<string, unknown>, context: ToolContext): Promise<string[]> | string[];
  preview?(input: Record<string, unknown>, context: ToolContext): Promise<string>;
  run(input: Record<string, unknown>, context: ToolContext): Promise<string>;
}

export interface ToolContext {
  cwd: string;
  approvalMode: ApprovalMode;
  permissions: PermissionRule[];
  askApproval(reason: string): Promise<boolean>;
}
