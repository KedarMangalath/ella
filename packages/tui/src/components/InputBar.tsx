import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";

interface InputBarProps {
  placeholder?: string;
  disabled?: boolean;
  onSubmit: (value: string) => void;
}

export function InputBar({ placeholder = "Ask ella anything…", disabled, onSubmit }: InputBarProps): React.ReactElement {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (disabled) {
      if (key.ctrl && input === "c") process.exit(0);
      return;
    }

    if (key.ctrl && input === "c") { process.exit(0); return; }
    if (key.ctrl && input === "u") { setValue(""); setCursor(0); return; }
    if (key.ctrl && input === "a") { setCursor(0); return; }
    if (key.ctrl && input === "e") { setCursor(value.length); return; }

    if (key.return) {
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setValue("");
        setCursor(0);
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (cursor > 0) {
        setValue((v) => v.slice(0, cursor - 1) + v.slice(cursor));
        setCursor((c) => c - 1);
      }
      return;
    }

    if (key.leftArrow)  { setCursor((c) => Math.max(0, c - 1)); return; }
    if (key.rightArrow) { setCursor((c) => Math.min(value.length, c + 1)); return; }

    if (input && !key.ctrl && !key.meta && !key.escape) {
      setValue((v) => v.slice(0, cursor) + input + v.slice(cursor));
      setCursor((c) => c + input.length);
    }
  });

  const before = value.slice(0, cursor);
  const atChar = value[cursor] ?? " ";
  const after  = value.slice(cursor + 1);

  const borderColor = disabled ? colors.dim : colors.orchid;

  return (
    <Box borderStyle="round" borderColor={borderColor} paddingX={1}>
      <Text color={colors.rose} bold>{"❯ "}</Text>
      {value.length === 0 && !disabled ? (
        <Text color={colors.dim}>{placeholder}</Text>
      ) : (
        <>
          <Text color={colors.brand}>{before}</Text>
          <Text
            color={colors.bg}
            backgroundColor={disabled ? colors.dim : colors.orchid}
          >{atChar}</Text>
          <Text color={colors.brand}>{after}</Text>
        </>
      )}
    </Box>
  );
}
