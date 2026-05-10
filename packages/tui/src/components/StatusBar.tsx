import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface StatusBarProps {
  provider: string;
  model: string;
  mode: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cwd: string;
  sessionId?: string;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtCost(n: number): string {
  if (n === 0) return "";
  if (n < 0.001) return "<$0.001";
  return `$${n.toFixed(3)}`;
}

export function StatusBar({ provider, model, mode, inputTokens, outputTokens, costUsd, cwd, sessionId }: StatusBarProps): React.ReactElement {
  const cost = fmtCost(costUsd);
  const cwdShort = cwd.length > 28 ? `…${cwd.slice(-25)}` : cwd;
  const modelShort = model.length > 20 ? model.slice(-20) : model;

  return (
    <Box borderStyle="single" borderColor={colors.dim} paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text color={colors.orchid} bold>{provider}</Text>
        <Text color={colors.dim}>/</Text>
        <Text color={colors.accent}>{modelShort}</Text>
        <Text color={colors.dim}>│</Text>
        <Text color={colors.gold}>{mode}</Text>
        {sessionId && (
          <>
            <Text color={colors.dim}>│</Text>
            <Text color={colors.dim}>{sessionId.slice(0, 8)}</Text>
          </>
        )}
      </Box>
      <Box gap={2}>
        <Text color={colors.muted}>↑{fmtTokens(inputTokens)} ↓{fmtTokens(outputTokens)}</Text>
        {cost && <Text color={colors.warning}>{cost}</Text>}
        <Text color={colors.dim}>{cwdShort}</Text>
      </Box>
    </Box>
  );
}
