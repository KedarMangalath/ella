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

  constructor(port = 4242) {
    super();
    this.port = port;
  }

  async start(cwd: string): Promise<void> {
    this._cwd = cwd;
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
      this._running = false;
    }
  }

  async send(prompt: string): Promise<void> {
    if (!this._running || !this.sessionId) throw new Error("OpenCode adapter not running.");
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

    // Use SSE streaming from the events endpoint
    try {
      const resp = await fetch(`http://localhost:${this.port}/session/${this.sessionId}/events/stream`, {
        headers: { accept: "text/event-stream" },
      });

      if (!resp.ok || !resp.body) {
        // Fall back to polling if SSE endpoint not available
        yield* this._pollStream();
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          try {
            const evt = JSON.parse(raw) as AgentStreamEvent;
            yield { ...evt, agentId: "opencode" };
            if (evt.kind === "done" || evt.kind === "error") return;
          } catch { /* skip malformed lines */ }
        }
      }
    } catch {
      yield* this._pollStream();
    }
  }

  private async *_pollStream(): AsyncGenerator<AgentStreamEvent> {
    let done = false;
    while (!done) {
      await new Promise((r) => setTimeout(r, 150));
      try {
        const resp = await fetch(`http://localhost:${this.port}/session/${this.sessionId}/events`);
        if (!resp.ok) continue;
        const events = await resp.json() as AgentStreamEvent[];
        for (const evt of events) {
          yield { ...evt, agentId: "opencode" };
          if (evt.kind === "done" || evt.kind === "error") { done = true; break; }
        }
      } catch { break; }
    }
  }

  async cancel(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await fetch(`http://localhost:${this.port}/session/${this.sessionId}/cancel`, { method: "POST" });
    } catch { /* ignore */ }
  }

  async stop(): Promise<void> {
    await this.cancel();
    this._running = false;
    this.sessionId = null;
  }
}
