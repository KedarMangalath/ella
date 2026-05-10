import type { McpManagerLike } from "./types.js";

interface GraphResult {
  content?: Array<{ type: string; text?: string }>;
  text?: string;
}

function extractText(result: unknown): string | null {
  if (typeof result === "string") return result;
  const r = result as GraphResult;
  if (Array.isArray(r?.content)) {
    return r.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") || null;
  }
  if (typeof r?.text === "string") return r.text;
  return null;
}

export async function fetchGraphContext(mcpManager: McpManagerLike | undefined, cwd: string): Promise<string | null> {
  if (!mcpManager) return null;

  const tools = mcpManager.allTools();
  const hasGraph = tools.some((t) => t.name === "get_architecture_overview" || t.name === "query_graph_tool");
  if (!hasGraph) return null;

  const sections: string[] = [];

  try {
    // Get high-level architecture overview
    const overview = await mcpManager.callTool("get_architecture_overview", { root_path: cwd }).catch(() => null);
    if (overview) {
      const text = extractText(overview);
      if (text) sections.push(`## Codebase Architecture\n${text}`);
    }

    // Get community structure (major modules)
    const communities = await mcpManager.callTool("list_communities_tool", {}).catch(() => null);
    if (communities) {
      const text = extractText(communities);
      if (text) sections.push(`## Module Communities\n${text}`);
    }
  } catch {
    // Graph context is best-effort — never block the agent
    return sections.length ? sections.join("\n\n") : null;
  }

  return sections.length ? `## Knowledge Graph Context\n\n${sections.join("\n\n")}` : null;
}

export async function fetchGraphContextForPrompt(
  mcpManager: McpManagerLike | undefined,
  prompt: string,
): Promise<string | null> {
  if (!mcpManager) return null;

  const tools = mcpManager.allTools();
  if (!tools.some((t) => t.name === "semantic_search_nodes_tool" || t.name === "query_graph_tool")) {
    return null;
  }

  try {
    // Search for nodes related to the prompt
    const result = await mcpManager.callTool("semantic_search_nodes_tool", {
      query: prompt.slice(0, 200),
      limit: 8,
    }).catch(() => null);

    if (!result) return null;
    const text = extractText(result);
    if (!text) return null;
    return `## Related Code Nodes\n${text}`;
  } catch {
    return null;
  }
}
