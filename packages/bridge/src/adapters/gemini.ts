import { spawn, type ChildProcess } from "node:child_process";
import type { AgentStreamEvent } from "../types.js";
import { BaseAdapter } from "./base.js";

export class GeminiAdapter extends BaseAdapter {
  readonly id = "gemini" as const;
  readonly strengths = {
    longContext:    10,
    codeGeneration: 7,
    shellOps:       6,
    multiFile:      9,
    reasoning:      8,
  };

  private proc: ChildProcess | null = null;
  private buf = "";
  private eventQueue: AgentStreamEvent[] = [];
  private isDone = false;

  async start(cwd: string): Promise<void> {
    this._cwd = cwd;
    // gemini-cli has an a2a-server mode; fall back to process spawn
    try {
      this.proc = spawn("gemini", ["--yolo", "--non-interactive"], {
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
            this.eventQueue.push({ agentId: "gemini", kind: "token", text: line });
          }
        }
      });

      this.proc.on("close", () => {
        this.isDone = true;
        this.eventQueue.push({ agentId: "gemini", kind: "done" });
        this._running = false;
      });

      this._running = true;
    } catch {
      this._running = false;
    }
  }

  async send(prompt: string): Promise<void> {
    if (!this.proc?.stdin) throw new Error("Gemini adapter not running.");
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
