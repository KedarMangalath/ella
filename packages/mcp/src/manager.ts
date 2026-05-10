import { McpClient, type McpClientConfig } from "./client.js";
import type { McpTool } from "./protocol.js";

export interface ManagedMcpTool extends McpTool {
  serverName: string;
  call(args: Record<string, unknown>): Promise<unknown>;
}

export class McpManager {
  private clients = new Map<string, McpClient>();

  async addServer(config: McpClientConfig): Promise<void> {
    const client = new McpClient(config);
    try {
      await client.connect();
      this.clients.set(config.name, client);
    } catch (err) {
      // Non-fatal: server unavailable
      console.warn(`MCP server "${config.name}" unavailable: ${String(err)}`);
    }
  }

  allTools(): ManagedMcpTool[] {
    const tools: ManagedMcpTool[] = [];
    for (const [name, client] of this.clients) {
      for (const tool of client.tools) {
        tools.push({
          ...tool,
          serverName: name,
          call: (args) => client.callTool(tool.name, args),
        });
      }
    }
    return tools;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    for (const client of this.clients.values()) {
      const tool = client.tools.find((t) => t.name === toolName);
      if (tool) return client.callTool(toolName, args);
    }
    throw new Error(`MCP tool not found: ${toolName}`);
  }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled(
      [...this.clients.values()].map((c) => c.disconnect()),
    );
    this.clients.clear();
  }

  serverCount(): number { return this.clients.size; }
  toolCount(): number { return this.allTools().length; }
}
