export type ProviderName = "openai" | "anthropic" | "gemini" | "openrouter";

export type ThinkingMode = "fast" | "balanced" | "deep" | "max";

export type ApprovalMode = "ask" | "auto-edit" | "full-auto" | "read-only";

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

export interface EllaConfig {
  defaultProvider: ProviderName;
  defaultModel: string;
  thinkingMode: ThinkingMode;
  approvalMode: ApprovalMode;
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
  preview?(input: Record<string, unknown>, context: ToolContext): Promise<string>;
  run(input: Record<string, unknown>, context: ToolContext): Promise<string>;
}

export interface ToolContext {
  cwd: string;
  approvalMode: ApprovalMode;
  askApproval(reason: string): Promise<boolean>;
}
