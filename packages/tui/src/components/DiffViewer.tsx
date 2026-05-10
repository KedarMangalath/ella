import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface DiffViewerProps {
  diff: string;
  maxLines?: number;
  title?: string;
}

export function DiffViewer({ diff, maxLines = 50, title }: DiffViewerProps): React.ReactElement {
  const allLines = diff.split("\n");
  const lines = allLines.slice(0, maxLines);
  const truncated = allLines.length > maxLines;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.dim} paddingX={1}>
      {title && <Text color={colors.accent} bold>{title}</Text>}
      {lines.map((line, i) => {
        const color =
          line.startsWith("+")  ? colors.success :
          line.startsWith("-")  ? colors.danger   :
          line.startsWith("@@") ? colors.cyan     :
          line.startsWith("+++") || line.startsWith("---") ? colors.accent :
          colors.muted;
        return (
          <Text key={i} color={color} wrap="truncate-end">{line}</Text>
        );
      })}
      {truncated && (
        <Text color={colors.dim}>{"…"} +{allLines.length - maxLines} more lines</Text>
      )}
    </Box>
  );
}
