import { readdir } from "node:fs/promises";
import path from "node:path";
import { ellaHome } from "./config.js";
import type { StreamEvent, ToolCall } from "./types.js";

export interface EllaPlugin {
  name: string;
  version?: string;
  beforePrompt?(prompt: string, cwd: string): Promise<string> | string;
  afterPrompt?(prompt: string, response: string, cwd: string): Promise<void> | void;
  beforeTool?(call: ToolCall, cwd: string): Promise<ToolCall | null> | ToolCall | null;
  afterTool?(call: ToolCall, result: string, cwd: string): Promise<string> | string;
  onEvent?(event: StreamEvent): Promise<void> | void;
}

export class PluginManager {
  private plugins: EllaPlugin[] = [];

  register(plugin: EllaPlugin): void {
    this.plugins.push(plugin);
  }

  async loadFromDir(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith(".js")) continue;
        try {
          const mod = await import(path.join(dir, e.name)) as { default?: EllaPlugin; plugin?: EllaPlugin };
          const plugin = mod.default ?? mod.plugin;
          if (plugin?.name) {
            this.plugins.push(plugin);
          }
        } catch (err) {
          console.warn(`Plugin ${e.name} failed to load: ${String(err)}`);
        }
      }
    } catch { /* dir not found */ }
  }

  async loadAll(cwd: string): Promise<void> {
    await Promise.all([
      this.loadFromDir(path.join(cwd, ".ella", "plugins")),
      this.loadFromDir(path.join(ellaHome(), "plugins")),
    ]);
  }

  async runBeforePrompt(prompt: string, cwd: string): Promise<string> {
    let result = prompt;
    for (const p of this.plugins) {
      if (p.beforePrompt) result = await p.beforePrompt(result, cwd) ?? result;
    }
    return result;
  }

  async runAfterPrompt(prompt: string, response: string, cwd: string): Promise<void> {
    for (const p of this.plugins) {
      if (p.afterPrompt) await p.afterPrompt(prompt, response, cwd);
    }
  }

  async runBeforeTool(call: ToolCall, cwd: string): Promise<ToolCall | null> {
    let result: ToolCall | null = call;
    for (const p of this.plugins) {
      if (!result) break;
      if (p.beforeTool) result = await p.beforeTool(result, cwd) ?? result;
    }
    return result;
  }

  async runAfterTool(call: ToolCall, toolResult: string, cwd: string): Promise<string> {
    let result = toolResult;
    for (const p of this.plugins) {
      if (p.afterTool) result = await p.afterTool(call, result, cwd) ?? result;
    }
    return result;
  }

  async runOnEvent(event: StreamEvent): Promise<void> {
    for (const p of this.plugins) {
      if (p.onEvent) await p.onEvent(event);
    }
  }

  list(): string[] {
    return this.plugins.map((p) => `${p.name}${p.version ? `@${p.version}` : ""}`);
  }
}
