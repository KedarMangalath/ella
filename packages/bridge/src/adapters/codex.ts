import { spawn, type ChildProcess } from "node:child_process";
import type { AgentStreamEvent } from "../types.js";
import { BaseAdapter } from "./base.js";

export class CodexAdapter extends BaseAdapter {
  readonly id = "codex" as const;
  readonly strengths = {
    longContext:    6,
    codeGeneration: 9,
    shellOps:       7,
    multiFile:      7,
    reasoning:      9,
  };

  private proc: ChildProcess | null = null;
  private buf = "";
  private eventQueue: AgentStreamEvent[] = [];
  private isDone = false;

  async start(cwd: string): Promise<void> {
    this._cwd = cwd;
    try {
      this.proc = spawn("codex", ["--approval-mode", "full-auto", "--quiet"], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      this.proc.stdout?.on("data", (chunk: Buffer) => {
        this.buf += chunk.toString("utf8");
        const lines = this.buf.split("\n");
        this.buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) {
            this.eventQueue.push({ agentId: "codex", kind: "token", text: line });
          }
        }
      });

      this.proc.on("close", () => {
        this.isDone = true;
        this.eventQueue.push({ agentId: "codex", kind: "done" });
        this._running = false;
      });

      this._running = true;
    } catch {
      this._running = false;
    }
  }

  async send(prompt: string): Promise<void> {
    if (!this.proc?.stdin) throw new Error("Codex adapter not running.");
    this.isDone = false;
    this.eventQueue = [];
    this.proc.stdin.write(`${prompt}\n`);
  }

  async *stream(): AsyncGenerator<AgentStreamEvent> {
    while (!this.isDone || this.eventQueue.length) {
      if (this.eventQueue.length) {
        const evt = this.eventQueue.shift()!;
        yield evt;
        if (evt.kind === "done" || evt.kind === "error") return;
      } else {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  async cancel(): Promise<void> {
    this.proc?.kill("SIGINT");
    this.isDone = true;
  }

  async stop(): Promise<void> {
    this.proc?.kill("SIGTERM");
    this.proc = null;
    this._running = false;
  }
}
