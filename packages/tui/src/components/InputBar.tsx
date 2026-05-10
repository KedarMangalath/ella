import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme.js";

const SLASH_COMMANDS = [
  "/help", "/clear", "/session", "/model", "/provider", "/mode",
  "/bridge", "/fork", "/tree", "/heatmap", "/pair", "/eval",
  "/budget", "/undo", "/redo", "/remember", "/memory", "/skills",
  "/plugins", "/mcp", "/plan", "/cost", "/tag", "/diff", "/exit",
];

type VimMode = "insert" | "normal";

interface InputBarProps {
  placeholder?: string;
  disabled?: boolean;
  onSubmit: (value: string) => void;
  history?: string[];
}

export function InputBar({ placeholder = "Ask ella anything…", disabled, onSubmit, history = [] }: InputBarProps): React.ReactElement {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [vimMode, setVimMode] = useState<VimMode>("insert");
  const [completion, setCompletion] = useState<string | null>(null);
  const [pendingOp, setPendingOp] = useState<string | null>(null);
  const [histIdx, setHistIdx] = useState(-1);
  const [savedDraft, setSavedDraft] = useState("");

  function set(v: string, c?: number): void {
    setValue(v);
    setCursor(c !== undefined ? c : v.length);
    updateCompletion(v);
  }

  function applyCompletion(): void {
    if (!completion) return;
    set(completion + " ");
    setCompletion(null);
  }

  function updateCompletion(v: string): void {
    const word = v.split("\n").at(-1) ?? v;
    if (word.startsWith("/") && !word.includes(" ")) {
      const match = SLASH_COMMANDS.find((c) => c.startsWith(word) && c !== word);
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

    // ── Normal mode ───────────────────────────────────────────────────
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
      if (input === "g") {
        if (pendingOp === "g") { setCursor(0); setPendingOp(null); return; }
        setPendingOp("g"); setTimeout(() => setPendingOp(null), 500); return;
      }
      if (input === "G") { setCursor(Math.max(0, value.length - 1)); return; }
      if (input === "d") {
        if (pendingOp === "d") { set(""); setPendingOp(null); return; }
        setPendingOp("d"); setTimeout(() => setPendingOp(null), 500); return;
      }
      if (key.upArrow) {
        navigateHistory(1);
        return;
      }
      if (key.downArrow) {
        navigateHistory(-1);
        return;
      }
      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) { onSubmit(trimmed); set(""); setCompletion(null); }
        setVimMode("insert");
        return;
      }
      return;
    }

    // ── Insert mode ───────────────────────────────────────────────────
    if (key.escape) { setVimMode("normal"); setCursor((c) => Math.max(0, c - 1)); return; }

    if (key.ctrl && input === "u") { set(""); setCompletion(null); return; }
    if (key.ctrl && input === "a") { setCursor(0); return; }
    if (key.ctrl && input === "e") { setCursor(value.length); return; }
    if (key.ctrl && input === "w") {
      let i = cursor - 1;
      while (i > 0 && value[i - 1] === " ") i--;
      while (i > 0 && value[i - 1] !== " ") i--;
      setValue((v) => v.slice(0, i) + v.slice(cursor));
      setCursor(i);
      return;
    }

    // Multi-line: Ctrl+Enter inserts newline
    if (key.ctrl && input === "j") {
      const next = value.slice(0, cursor) + "\n" + value.slice(cursor);
      setValue(next);
      setCursor(cursor + 1);
      return;
    }

    if (key.tab) { if (completion) { applyCompletion(); return; } return; }

    if (key.return) {
      const trimmed = value.trim();
      if (trimmed) { onSubmit(trimmed); set(""); setCompletion(null); setHistIdx(-1); setSavedDraft(""); }
      return;
    }

    if (key.upArrow) { navigateHistory(1); return; }
    if (key.downArrow) { navigateHistory(-1); return; }

    if (key.backspace || key.delete) {
      if (cursor > 0) {
        const next = value.slice(0, cursor - 1) + value.slice(cursor);
        setValue(next);
        setCursor((c) => c - 1);
        updateCompletion(next);
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

  function navigateHistory(direction: 1 | -1): void {
    if (history.length === 0) return;
    if (histIdx === -1 && direction === 1) {
      setSavedDraft(value);
    }
    const next = histIdx + direction;
    if (next < 0) {
      setHistIdx(-1);
      set(savedDraft);
      return;
    }
    if (next >= history.length) return;
    setHistIdx(next);
    const entry = history[history.length - 1 - next] ?? "";
    set(entry);
  }

  // Display: show last line for cursor positioning in multi-line mode
  const lines = value.split("\n");
  const linesBefore = lines.slice(0, -1);
  const currentLine = lines.at(-1) ?? "";
  const displayCursor = Math.min(cursor, currentLine.length);
  const before = currentLine.slice(0, displayCursor);
  const atChar = currentLine[displayCursor] ?? " ";
  const after  = currentLine.slice(displayCursor + 1);

  const borderColor = disabled ? colors.dim : vimMode === "normal" ? colors.gold : colors.orchid;

  const completionSuffix = completion ? completion.slice(currentLine.length) : null;

  return (
    <Box borderStyle="round" borderColor={borderColor} paddingX={1} flexDirection="column">
      {/* Previous lines in multi-line input */}
      {linesBefore.map((line, i) => (
        <Box key={i} flexDirection="row">
          <Text color={colors.dim}>{i === 0 ? (vimMode === "normal" ? " NOR " : " INS ") : "     "}</Text>
          <Text color={colors.rose} bold>{"❯ "}</Text>
          <Text color={colors.brand}>{line}</Text>
        </Box>
      ))}
      {/* Current line */}
      <Box flexDirection="row">
        <Text color={vimMode === "normal" ? colors.gold : colors.orchid} bold>
          {linesBefore.length === 0 ? (vimMode === "normal" ? " NOR " : " INS ") : "     "}
        </Text>
        <Text color={colors.rose} bold>{"❯ "}</Text>
        {value.length === 0 && !disabled && vimMode === "insert" ? (
          <Text color={colors.dim}>{placeholder}</Text>
        ) : (
          <>
            <Text color={colors.brand}>{before}</Text>
            <Text color={colors.bg} backgroundColor={disabled ? colors.dim : borderColor}>{atChar}</Text>
            <Text color={colors.brand}>{after}</Text>
            {completionSuffix && <Text color={colors.dim}>{completionSuffix}</Text>}
          </>
        )}
      </Box>
    </Box>
  );
}
