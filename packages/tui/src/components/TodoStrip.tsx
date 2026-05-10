import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

export interface TodoItem {
  id: string;
  text: string;
  status: "pending" | "done";
}

interface TodoStripProps {
  todos: TodoItem[];
}

export function TodoStrip({ todos }: TodoStripProps): React.ReactElement | null {
  if (!todos.length) return null;

  const pending = todos.filter((t) => t.status === "pending");
  const done    = todos.filter((t) => t.status === "done");

  return (
    <Box borderStyle="round" borderColor={colors.dim} paddingX={1} flexDirection="row" gap={2}>
      <Text color={colors.muted} bold>tasks</Text>
      {pending.slice(0, 4).map((t) => (
        <Text key={t.id} color={colors.warning}>{"◦"} {t.text.slice(0, 28)}</Text>
      ))}
      {done.slice(-2).map((t) => (
        <Text key={t.id} color={colors.success}>{"✓"} {t.text.slice(0, 20)}</Text>
      ))}
      {pending.length > 4 && (
        <Text color={colors.dim}>+{pending.length - 4} more</Text>
      )}
    </Box>
  );
}
