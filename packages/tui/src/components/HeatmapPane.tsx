import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

export interface HeatEntry {
  path: string;
  count: number;
}

interface Props {
  entries: HeatEntry[];
}

const HEAT_CHARS = ["░", "▒", "▓", "█"];

function heatChar(count: number, max: number): string {
  if (max === 0) return HEAT_CHARS[0]!;
  const idx = Math.min(Math.floor((count / max) * (HEAT_CHARS.length - 1)), HEAT_CHARS.length - 1);
  return HEAT_CHARS[idx]!;
}

function heatColor(count: number, max: number): string {
  if (max === 0) return colors.dim;
  const ratio = count / max;
  if (ratio >= 0.75) return colors.danger;
  if (ratio >= 0.5) return colors.warning;
  if (ratio >= 0.25) return colors.orchid;
  return colors.muted;
}

export function HeatmapPane({ entries }: Props): React.ReactElement {
  const max = entries.reduce((m, e) => Math.max(m, e.count), 0);
  const barWidth = 20;

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={colors.orchid} bold>File Touch Heatmap</Text>
        <Text color={colors.dim}>  (files written this session)</Text>
      </Box>

      {entries.length === 0 && (
        <Text color={colors.muted}>No files written yet.</Text>
      )}

      {entries.map((e) => {
        const filled = max > 0 ? Math.round((e.count / max) * barWidth) : 0;
        const bar = heatChar(e.count, max).repeat(filled).padEnd(barWidth, "·");
        const col = heatColor(e.count, max);
        const shortPath = e.path.length > 40 ? `…${e.path.slice(-39)}` : e.path;
        return (
          <Box key={e.path}>
            <Text color={col}>{bar} </Text>
            <Text color={colors.muted}>{String(e.count).padStart(3)} </Text>
            <Text>{shortPath}</Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color={colors.dim}>
          {"░ low  ▒ mid  ▓ high  █ hot"}
        </Text>
      </Box>
    </Box>
  );
}
