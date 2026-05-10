import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

export type MessageRole = "user" | "assistant" | "tool" | "thinking" | "error" | "system";

export interface ChatEntry {
  id: string;
  role: MessageRole;
  text: string;
  toolName?: string;
  timestamp: number;
}

interface RoleLabelProps {
  role: MessageRole;
  toolName?: string;
}

function RoleLabel({ role, toolName }: RoleLabelProps): React.ReactElement {
  switch (role) {
    case "user":      return <Text color={colors.rose}    bold>  you  </Text>;
    case "assistant": return <Text color={colors.orchid}  bold>  ella </Text>;
    case "thinking":  return <Text color={colors.dim}     bold>  ...  </Text>;
    case "tool":      return <Text color={colors.gold}    bold>  {`⚙ ${(toolName ?? "tool").slice(0, 6)}`} </Text>;
    case "error":     return <Text color={colors.danger}  bold>  err  </Text>;
    case "system":    return <Text color={colors.muted}   bold>  sys  </Text>;
    default:          return <Text>  ?    </Text>;
  }
}

function messageColor(role: MessageRole): string {
  switch (role) {
    case "user":      return colors.brand;
    case "assistant": return colors.white;
    case "thinking":  return colors.dim;
    case "tool":      return colors.muted;
    case "error":     return colors.danger;
    case "system":    return colors.muted;
    default:          return colors.white;
  }
}

interface ChatMessageProps {
  entry: ChatEntry;
}

function ChatMessage({ entry }: ChatMessageProps): React.ReactElement {
  return (
    <Box flexDirection="row" marginBottom={0}>
      <Box width={9} flexShrink={0}>
        <RoleLabel role={entry.role} toolName={entry.toolName} />
      </Box>
      <Box flexGrow={1}>
        <Text color={messageColor(entry.role)} wrap="wrap">{entry.text}</Text>
      </Box>
    </Box>
  );
}

interface ChatPaneProps {
  entries: ChatEntry[];
  streaming?: string;
}

export function ChatPane({ entries, streaming }: ChatPaneProps): React.ReactElement {
  const visible = entries.slice(-40);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={0}>
      {visible.map((e) => (
        <ChatMessage key={e.id} entry={e} />
      ))}
      {streaming !== undefined && (
        <Box flexDirection="row">
          <Box width={9}><Text color={colors.orchid} bold>  ella </Text></Box>
          <Box flexGrow={1}>
            <Text color={colors.white} wrap="wrap">
              {streaming}
              <Text color={colors.orchid}>{"▊"}</Text>
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
