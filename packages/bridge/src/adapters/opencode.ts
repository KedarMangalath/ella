import type { AgentStreamEvent } from "../types.js";
import { BaseAdapter } from "./base.js";

export class OpenCodeAdapter extends BaseAdapter {
  readonly id = "opencode" as const;
  readonly strengths = {
    longContext:    7,
    codeGeneration: 8,
    shellOps:       9,
    multiFile:      8,
    reasoning:      7,
  };

  private port: number;
  private sessionId: string | null = null;
  private pendingEvents: AgentStreamEvent[] = [];
  private done = false;

  constructor(port = 4242) {
    super();
    this.port = port;
  }

  async start(cwd: string): Promise<void> {
    this._cwd = cwd;
    // opencode exposes a local HTTP server — attempt to create a session
    try {
      const resp = await fetch(`http://localhost:${this.port}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      if (resp.ok) {
        const data = await resp.json() as { id?: string };
        this.sessionId = data.id ?? null;
        this._running = true;
      }
    } catch {
      // opencode not running — mark unavailable
      this._running = false;
    }
  }

  async send(prompt: string): Promise<void> {
    if (!this._running || !this.sessionId) throw new Error("OpenCode adapter not running.");
    this.pendingEvents = [];
    this.done = false;

    const resp = await fetch(`http://localhost:${this.port}/session/${this.sessionId}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: prompt }),
    });

    if (!resp.ok) throw new Error(`OpenCode send failed: ${resp.status}`);
  }

  async *stream(): AsyncGenerator<AgentStreamEvent> {
    if (!this._running || !this.sessionId) {
      yield { agentId: "opencode", kind: "error", error: "Not running" };
      return;
    }

    // Poll events endpoint
    while (!this.done) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const resp = await fetch(`http://localhost:${this.port}/session/${this.sessionId}/events`);
        if (!resp.ok) continue;
        const events = await resp.json() as AgentStreamEvent[];
        for (const evt of events) {
          yield { ...evt, agentId: "opencode" };
          if (evt.kind === "done" || evt.kind === "error") { this.done = true; break; }
        }
      } catch { break; }
    }
  }

  async cancel(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await fetch(`http://localhost:${this.port}/session/${this.sessionId}/cancel`, { method: "POST" });
    } catch { /* ignore */ }
    this.done = true;
  }

  async stop(): Promise<void> {
    await this.cancel();
    this._running = false;
    this.sessionId = null;
  }
}
