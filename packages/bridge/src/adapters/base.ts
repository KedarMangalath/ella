import type { AgentAdapter, AgentId, AgentStreamEvent, AgentStrengths } from "../types.js";

export abstract class BaseAdapter implements AgentAdapter {
  abstract readonly id: AgentId;
  abstract readonly strengths: AgentStrengths;

  protected _running = false;
  protected _cwd = process.cwd();

  abstract start(cwd: string): Promise<void>;
  abstract send(prompt: string): Promise<void>;
  abstract stream(): AsyncGenerator<AgentStreamEvent>;
  abstract cancel(): Promise<void>;
  abstract stop(): Promise<void>;

  isRunning(): boolean {
    return this._running;
  }
}
