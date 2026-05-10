export { Coordinator } from "./coordinator.js";
export { OpenCodeAdapter } from "./adapters/opencode.js";
export { GeminiAdapter } from "./adapters/gemini.js";
export { CodexAdapter } from "./adapters/codex.js";
export { BaseAdapter } from "./adapters/base.js";
export type {
  AgentAdapter,
  AgentId,
  AgentResult,
  AgentStreamEvent,
  AgentStreamEventKind,
  AgentStrengths,
  BridgeConfig,
  CoordinatorMode,
  CoordinatorResult,
  SubTask,
  TaskDecomposition,
} from "./types.js";
