import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

export interface TreeNode {
  id: string;
  title: string;
  updatedAt: string;
  costUsd: number;
  forkOf?: string;
  forkTurn?: number;
  children: TreeNode[];
}

interface Props {
  roots: TreeNode[];
  activeId?: string;
}

function NodeRow({
  node,
  indent,
  isLast,
  activeId,
}: {
  node: TreeNode;
  indent: string;
  isLast: boolean;
  activeId?: string;
}): React.ReactElement {
  const isActive = node.id === activeId;
  const connector = isLast ? "└─" : "├─";
  const icon = node.forkOf ? "⎇ " : "◉ ";
  const shortId = node.id.slice(0, 8);
  const title = node.title.length > 30 ? `${node.title.slice(0, 29)}…` : node.title;
  const forkLabel = node.forkOf ? ` @t${node.forkTurn ?? 0}` : "";

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={colors.dim}>{indent}{connector} </Text>
        <Text color={isActive ? colors.orchid : colors.dim}>{icon}</Text>
        <Text color={isActive ? colors.orchid : undefined} bold={isActive}>
          {shortId}
        </Text>
        <Text color={colors.muted}>{forkLabel}  </Text>
        <Text>{title}</Text>
        <Text color={colors.dim}>  {node.updatedAt.slice(0, 16)}</Text>
        {node.costUsd > 0 && (
          <Text color={colors.gold}>  ${node.costUsd.toFixed(3)}</Text>
        )}
      </Box>
      {node.children.map((child, i) => (
        <NodeRow
          key={child.id}
          node={child}
          indent={indent + (isLast ? "   " : "│  ")}
          isLast={i === node.children.length - 1}
          activeId={activeId}
        />
      ))}
    </Box>
  );
}

export function SessionTreePane({ roots, activeId }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={colors.orchid} bold>Session Tree</Text>
        <Text color={colors.dim}>  (◉ root  ⎇ fork)</Text>
      </Box>

      {roots.length === 0 && (
        <Text color={colors.muted}>No sessions yet.</Text>
      )}

      {roots.map((root, i) => (
        <NodeRow
          key={root.id}
          node={root}
          indent=""
          isLast={i === roots.length - 1}
          activeId={activeId}
        />
      ))}

      <Box marginTop={1}>
        <Text color={colors.dim}>/fork [turn]  to branch from current turn</Text>
      </Box>
    </Box>
  );
}
