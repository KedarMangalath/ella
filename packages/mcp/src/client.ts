import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpInitializeResult,
  McpTool,
  McpResource,
} from "./protocol.js";

export interface McpClientConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class McpClient {
  private proc: ChildProcess | null = null;
  private pending = new Map<number | string, PendingRequest>();
  private seq = 1;
  private initialized = false;
  tools: McpTool[] = [];
  resources: McpResource[] = [];

  constructor(private readonly config: McpClientConfig) {}

  async connect(): Promise<void> {
    this.proc = spawn(this.config.command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(this.config.env ?? {}) },
    });

    const rl = createInterface({ input: this.proc.stdout! });
    rl.on("line", (line) => {
      let msg: JsonRpcResponse;
      try { msg = JSON.parse(line) as JsonRpcResponse; } catch { return; }
      if (msg.id !== null && msg.id !== undefined) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          this.pending.delete(msg.id);
          if (msg.error) pending.reject(new Error(msg.error.message));
          else pending.resolve(msg.result);
        }
      }
    });

    this.proc.on("close", () => {
      for (const p of this.pending.values()) p.reject(new Error("MCP server closed."));
      this.pending.clear();
      this.initialized = false;
    });

    // Initialize handshake
    const initResult = await this.request<McpInitializeResult>("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "ella", version: "0.1.0" },
    });

    await this.notify("notifications/initialized");
    this.initialized = true;

    // Discover tools + resources
    try {
      const toolsResult = await this.request<{ tools: McpTool[] }>("tools/list", {});
      this.tools = toolsResult.tools ?? [];
    } catch { /* server may not support tools */ }

    try {
      const resResult = await this.request<{ resources: McpResource[] }>("resources/list", {});
      this.resources = resResult.resources ?? [];
    } catch { /* server may not support resources */ }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.initialized) throw new Error("MCP client not initialized.");
    return this.request("tools/call", { name, arguments: args });
  }

  async readResource(uri: string): Promise<unknown> {
    if (!this.initialized) throw new Error("MCP client not initialized.");
    return this.request("resources/read", { uri });
  }

  async disconnect(): Promise<void> {
    this.proc?.kill();
    this.proc = null;
    this.initialized = false;
  }

  private async request<T>(method: string, params: unknown): Promise<T> {
    const id = this.seq++;
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      this.proc?.stdin?.write(`${JSON.stringify(msg)}\n`);
    });
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const msg = { jsonrpc: "2.0", method, params };
    this.proc?.stdin?.write(`${JSON.stringify(msg)}\n`);
  }
}
