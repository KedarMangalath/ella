import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";

const SLASH_COMMANDS = [
  "/help", "/clear", "/session", "/model", "/provider", "/mode",
  "/bridge", "/fork", "/tree", "/heatmap", "/pair", "/eval",
  "/budget", "/undo", "/redo", "/remember", "/memory", "/skills",
  "/plugins", "/mcp", "/plan", "/cost", "/tag", "/exit",
];

type VimMode = "insert" | "normal";

interface InputBarProps {
  placeholder?: string;
  disabled?: boolean;
  onSubmit: (value: string) => void;
}

export function InputBar({ placeholder = "Ask ella anything…", disabled, onSubmit }: InputBarProps): React.ReactElement {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [vimMode, setVimMode] = useState<VimMode>("insert");
  const [completion, setCompletion] = useState<string | null>(null);
  const [pendingG, setPendingG] = useState(false);

  function applyCompletion(): void {
    if (!completion) return;
    setValue(completion + " ");
    setCursor(completion.length + 1);
    setCompletion(null);
  }

  function updateCompletion(v: string): void {
    if (v.startsWith("/") && !v.includes(" ")) {
      const match = SLASH_COMMANDS.find((c) => c.startsWith(v) && c !== v);
      setCompletion(match ?? null);
    } else {
      setCompletion(null);
    }
  }

  useInput((input, key) => {
    if (disabled) {
      if (key.ctrl && input === "c") process.exit(0);
      return;
    }

    if (key.ctrl && input === "c") { process.exit(0); return; }

    // ── Normal mode ───────────────────────────────────────────────────────────
    if (vimMode === "normal") {
      if (input === "i") { setVimMode("insert"); return; }
      if (input === "a") { setVimMode("insert"); setCursor((c) => Math.min(value.length, c + 1)); return; }
      if (input === "A") { setVimMode("insert"); setCursor(value.length); return; }
      if (input === "I") { setVimMode("insert"); setCursor(0); return; }
      if (input === "s") { setValue((v) => v.slice(0, cursor) + v.slice(cursor + 1)); setVimMode("insert"); return; }
      if (input === "x") { setValue((v) => v.slice(0, cursor) + v.slice(cursor + 1)); setCursor((c) => Math.max(0, Math.min(c, value.length - 2))); return; }
      if (input === "D") { setValue((v) => v.slice(0, cursor)); return; }
      if (input === "0") { setCursor(0); return; }
      if (input === "$") { setCursor(Math.max(0, value.length - 1)); return; }
      if (input === "h" || key.leftArrow)  { setCursor((c) => Math.max(0, c - 1)); return; }
      if (input === "l" || key.rightArrow) { setCursor((c) => Math.min(Math.max(0, value.length - 1), c + 1)); return; }
      if (input === "w") {
        let i = cursor;
        while (i < value.length && value[i] !== " ") i++;
        while (i < value.length && value[i] === " ") i++;
        setCursor(i);
        return;
      }
      if (input === "b") {
        let i = cursor - 1;
        while (i > 0 && value[i] === " ") i--;
        while (i > 0 && value[i - 1] !== " ") i--;
        setCursor(Math.max(0, i));
        return;
      }
      // gg — go to start
      if (input === "g") {
        if (pendingG) { setCursor(0); setPendingG(false); return; }
        setPendingG(true);
        setTimeout(() => setPendingG(false), 500);
        return;
      }
      // G — go to end
      if (input === "G") { setCursor(Math.max(0, value.length - 1)); return; }
      // dd — clear line
      if (input === "d") {
        if (pendingG) { setValue(""); setCursor(0); setPendingG(false); return; }
        setPendingG(true);
        setTimeout(() => setPendingG(false), 500);
        return;
      }
      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) { onSubmit(trimmed); setValue(""); setCursor(0); setCompletion(null); }
        setVimMode("insert");
        return;
      }
      return;
    }

    // ── Insert mode ───────────────────────────────────────────────────────────
    if (key.escape) { setVimMode("normal"); setCursor((c) => Math.max(0, c - 1)); return; }
    if (key.ctrl && input === "u") { setValue(""); setCursor(0); setCompletion(null); return; }
    if (key.ctrl && input === "a") { setCursor(0); return; }
    if (key.ctrl && input === "e") { setCursor(value.length); return; }
    if (key.ctrl && input === "w") {
      // Delete word before cursor
      let i = cursor - 1;
      while (i > 0 && value[i - 1] === " ") i--;
      while (i > 0 && value[i - 1] !== " ") i--;
      setValue((v) => v.slice(0, i) + v.slice(cursor));
      setCursor(i);
      return;
    }

    if (key.tab) {
      if (completion) { applyCompletion(); return; }
      return;
    }

    if (key.return) {
      const trimmed = value.trim();
      if (trimmed) { onSubmit(trimmed); setValue(""); setCursor(0); setCompletion(null); }
      return;
    }

    if (key.backspace || key.delete) {
      if (cursor > 0) {
        const next = value.slice(0, cursor - 1) + value.slice(cursor);
        setValue(next);
        setCursor((c) => c - 1);
        updateCompletion(next.slice(0, cursor - 1) + value.slice(cursor));
      }
      return;
    }

    if (key.leftArrow)  { setCursor((c) => Math.max(0, c - 1)); return; }
    if (key.rightArrow) {
      if (cursor === value.length && completion) { applyCompletion(); return; }
      setCursor((c) => Math.min(value.length, c + 1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const next = value.slice(0, cursor) + input + value.slice(cursor);
      setValue(next);
      setCursor((c) => c + input.length);
      updateCompletion(next);
    }
  });

  const before = value.slice(0, cursor);
  const atChar = value[cursor] ?? (vimMode === "normal" ? " " : " ");
  const after  = value.slice(cursor + 1);

  const borderColor = disabled ? colors.dim : vimMode === "normal" ? colors.gold : colors.orchid;
  const modeTag = vimMode === "normal"
    ? <Text color={colors.gold} bold>{" NOR "}</Text>
    : <Text color={colors.orchid} bold>{" INS "}</Text>;

  // Completion ghost text (the suffix after current input)
  const completionSuffix = completion ? completion.slice(value.length) : null;

  return (
    <Box borderStyle="round" borderColor={borderColor} paddingX={1} flexDirection="row">
      {modeTag}
      <Text color={colors.rose} bold>{"❯ "}</Text>
      {value.length === 0 && !disabled && vimMode === "insert" ? (
        <Text color={colors.dim}>{placeholder}</Text>
      ) : (
        <>
          <Text color={colors.brand}>{before}</Text>
          <Text color={colors.bg} backgroundColor={disabled ? colors.dim : borderColor}>{atChar}</Text>
          <Text color={colors.brand}>{after}</Text>
          {completionSuffix && (
            <Text color={colors.dim}>{completionSuffix}</Text>
          )}
        </>
      )}
    </Box>
  );
}
