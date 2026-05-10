import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";
import type { AgentId } from "@ella/bridge";

export interface BridgeColumnEntry {
  agentId: AgentId;
  text: string;
  done: boolean;
  durationMs?: number;
  winner?: boolean;
}

interface BridgeColumnProps {
  agentId: AgentId;
  entry: BridgeColumnEntry;
  height: number;
}

const AGENT_COLORS: Record<AgentId, string> = {
  opencode: colors.gold,
  gemini:   colors.rose,
  codex:    colors.orchid,
};

const AGENT_LABELS: Record<AgentId, string> = {
  opencode: "OpenCode",
  gemini:   "Gemini",
  codex:    "Codex",
};

function BridgeColumn({ agentId, entry, height }: BridgeColumnProps): React.ReactElement {
  const col = AGENT_COLORS[agentId];
  const label = AGENT_LABELS[agentId];
  const statusText = entry.done
    ? (entry.winner ? " ✦ winner" : " done")
    : " streaming…";
  const statusColor = entry.winner ? colors.gold : entry.done ? colors.muted : colors.orchid;

  // Truncate to available height - 3 (header + border rows)
  const lines = entry.text.split("\n");
  const visible = lines.slice(-(height - 3)).join("\n");

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={col} paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={col} bold>{label}</Text>
        <Text color={statusColor} dimColor>
          {statusText}
          {entry.durationMs !== undefined ? ` ${(entry.durationMs / 1000).toFixed(1)}s` : ""}
        </Text>
      </Box>
      <Box flexGrow={1} overflow="hidden">
        <Text color={colors.white} wrap="wrap">{visible}</Text>
        {!entry.done && <Text color={col}>{"▊"}</Text>}
      </Box>
    </Box>
  );
}

export interface BridgePaneProps {
  columns: BridgeColumnEntry[];
  mode?: string;
  active: boolean;
}

export function BridgePane({ columns, mode, active }: BridgePaneProps): React.ReactElement {
  const rows = process.stdout.rows ?? 40;
  const contentHeight = rows - 6;

  if (!active) {
    return (
      <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
        <Text color={colors.dim}>Bridge panel — run /bridge &lt;task&gt; to start</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text color={colors.muted}>Bridge · </Text>
        <Text color={colors.gold} bold>{mode ?? "race"}</Text>
        <Text color={colors.muted}> mode — {columns.length} agent(s)</Text>
      </Box>
      <Box flexDirection="row" flexGrow={1} gap={1}>
        {columns.map((col) => (
          <BridgeColumn key={col.agentId} agentId={col.agentId} entry={col} height={contentHeight} />
        ))}
        {columns.length === 0 && (
          <Box flexGrow={1} alignItems="center" justifyContent="center">
            <Text color={colors.dim}>Waiting for agents…</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
