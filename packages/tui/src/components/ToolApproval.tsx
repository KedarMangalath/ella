import React from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";

export type ToolRisk = "read" | "edit" | "shell";

interface ToolApprovalProps {
  reason: string;
  risk: ToolRisk;
  preview?: string;
  onRespond: (approved: boolean) => void;
}

export function ToolApproval({ reason, risk, preview, onRespond }: ToolApprovalProps): React.ReactElement {
  const riskColor =
    risk === "shell" ? colors.danger :
    risk === "edit"  ? colors.warning :
    colors.muted;

  useInput((input, key) => {
    if (input === "y" || input === "Y" || key.return) { onRespond(true); return; }
    if (input === "n" || input === "N" || key.escape) { onRespond(false); return; }
    if (key.ctrl && input === "c") process.exit(0);
  });

  return (
    <Box borderStyle="double" borderColor={riskColor} flexDirection="column" padding={1} marginX={1}>
      <Box gap={2} marginBottom={1}>
        <Text color={riskColor} bold>{"⚡ "}{reason}</Text>
        <Text color={riskColor}>[{risk}]</Text>
      </Box>
      {preview && <Text color={colors.muted} wrap="wrap">{preview.slice(0, 500)}</Text>}
      <Box marginTop={1} gap={4}>
        <Text color={colors.success} bold>[y / Enter] approve</Text>
        <Text color={colors.danger}  bold>[n / Esc] deny</Text>
      </Box>
    </Box>
  );
}
