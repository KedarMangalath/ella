import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

export interface PairEntry {
  id: string;
  prompt: string;
  providerA: string;
  modelA: string;
  textA: string;
  providerB: string;
  modelB: string;
  textB: string;
  costUsd: number;
  elapsedMs: number;
}

interface Props {
  entries: PairEntry[];
  streaming?: { side: "A" | "B"; text: string };
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (para.length <= width) { lines.push(para); continue; }
    let i = 0;
    while (i < para.length) { lines.push(para.slice(i, i + width)); i += width; }
  }
  return lines;
}

function Column({
  label,
  model,
  text,
  color,
  width,
}: {
  label: string;
  model: string;
  text: string;
  color: string;
  width: number;
}): React.ReactElement {
  const colWidth = Math.max(width - 2, 20);
  const lines = wrap(text || "(streaming…)", colWidth).slice(0, 20);
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderColor={color}
      paddingX={1}
    >
      <Text color={color} bold>{label}</Text>
      <Text color={colors.dim}>{model}</Text>
      <Box marginTop={1} flexDirection="column">
        {lines.map((l, i) => <Text key={i}>{l}</Text>)}
      </Box>
    </Box>
  );
}

export function PairPane({ entries, streaming }: Props): React.ReactElement {
  const cols = Math.floor((process.stdout.columns ?? 120) / 2);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={colors.orchid} bold>Pair Mode</Text>
        <Text color={colors.dim}>  (two providers on the same prompt)</Text>
      </Box>

      {entries.length === 0 && (
        <Text color={colors.muted}>Use /pair {"<prompt>"} to compare two providers.</Text>
      )}

      {entries.map((e) => (
        <Box key={e.id} flexDirection="column" marginBottom={1}>
          <Box>
            <Text color={colors.cyan} bold>❯ </Text>
            <Text>{e.prompt.slice(0, 80)}</Text>
            <Text color={colors.dim}>  ${e.costUsd.toFixed(4)}  {(e.elapsedMs / 1000).toFixed(1)}s</Text>
          </Box>
          <Box flexDirection="row">
            <Column
              label={e.providerA}
              model={e.modelA}
              text={e.textA}
              color={colors.orchid}
              width={cols}
            />
            <Column
              label={e.providerB}
              model={e.modelB}
              text={e.textB}
              color={colors.cyan}
              width={cols}
            />
          </Box>
        </Box>
      ))}

      {streaming && (
        <Box flexDirection="row">
          <Column
            label={`streaming (${streaming.side})`}
            model=""
            text={streaming.text}
            color={streaming.side === "A" ? colors.orchid : colors.cyan}
            width={cols}
          />
        </Box>
      )}
    </Box>
  );
}
