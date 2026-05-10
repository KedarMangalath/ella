import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

export type MascotState = "idle" | "think" | "type" | "tool" | "error" | "celebrate" | "sleep";

interface Frame {
  head: string;
  eyes: string;
  mouth: string;
  chin: string;
  aura: string;
}

const FRAMES: Record<MascotState, Frame[]> = {
  idle: [
    { head: "  ╭─────╮", eyes: "  │ ◉   ◉ │", mouth: "  │  ———  │", chin: "  ╰─────╯", aura: "          " },
    { head: "  ╭─────╮", eyes: "  │ ◉   ◉ │", mouth: "  │  ———  │", chin: "  ╰─────╯", aura: " ·        " },
    { head: "  ╭─────╮", eyes: "  │ ◉   ◉ │", mouth: "  │  −▾−  │", chin: "  ╰─────╯", aura: " · ·      " },
    { head: "  ╭─────╮", eyes: "  │ ◉   ◉ │", mouth: "  │  ———  │", chin: "  ╰─────╯", aura: "          " },
  ],
  think: [
    { head: "  ╭─────╮", eyes: "  │ ◔   ◔ │", mouth: "  │  ···  │", chin: "  ╰─────╯", aura: " ？       " },
    { head: "  ╭─────╮", eyes: "  │ ◑   ◔ │", mouth: "  │  ···  │", chin: "  ╰─────╯", aura: "  ？      " },
    { head: "  ╭─────╮", eyes: "  │ ◕   ◑ │", mouth: "  │  ~~~  │", chin: "  ╰─────╯", aura: "   ？     " },
    { head: "  ╭─────╮", eyes: "  │ ◕   ◕ │", mouth: "  │  ~~~  │", chin: "  ╰─────╯", aura: "    ！    " },
  ],
  type: [
    { head: "  ╭─────╮", eyes: "  │ ▸   ▸ │", mouth: "  │  ___  │", chin: "  ╰─────╯", aura: "  ✎       " },
    { head: "  ╭─────╮", eyes: "  │ ▶   ▶ │", mouth: "  │  ___  │", chin: "  ╰─────╯", aura: "   ✎      " },
    { head: "  ╭─────╮", eyes: "  │ ▸   ▸ │", mouth: "  │  −▾−  │", chin: "  ╰─────╯", aura: "  ✎       " },
    { head: "  ╭─────╮", eyes: "  │ ▶   ▶ │", mouth: "  │  ———  │", chin: "  ╰─────╯", aura: "    ✎     " },
  ],
  tool: [
    { head: "  ╭─────╮", eyes: "  │ ⊙   ⊙ │", mouth: "  │  ═══  │", chin: "  ╰═════╯", aura: " ⚙        " },
    { head: "  ╭─────╮", eyes: "  │ ⊙   ⊙ │", mouth: "  │  ═══  │", chin: "  ╰═════╯", aura: "  ⚙       " },
    { head: "  ╭─────╮", eyes: "  │ ⊛   ⊛ │", mouth: "  │  ═══  │", chin: "  ╰═════╯", aura: "   ⚙      " },
    { head: "  ╭─────╮", eyes: "  │ ⊙   ⊛ │", mouth: "  │  ═══  │", chin: "  ╰═════╯", aura: "  ⚙ ⚙    " },
  ],
  error: [
    { head: "  ╭─────╮", eyes: "  │ ✕   ✕ │", mouth: "  │  ───  │", chin: "  ╰─────╯", aura: " ！       " },
    { head: "  ╭─────╮", eyes: "  │ ✕   ✕ │", mouth: "  │  ╌╌╌  │", chin: "  ╰─────╯", aura: "  ！      " },
    { head: "  ╭─────╮", eyes: "  │ ✖   ✖ │", mouth: "  │  ───  │", chin: "  ╰─────╯", aura: " ！ ！    " },
    { head: "  ╭─────╮", eyes: "  │ ✕   ✕ │", mouth: "  │  ╌╌╌  │", chin: "  ╰─────╯", aura: "  ！      " },
  ],
  celebrate: [
    { head: "  ╭─────╮", eyes: "  │ ★   ★ │", mouth: "  │  ◡◡◡  │", chin: "  ╰─────╯", aura: " ✨       " },
    { head: "  ╭─────╮", eyes: "  │ ☆   ★ │", mouth: "  │  ◡◡◡  │", chin: "  ╰─────╯", aura: "  ✨      " },
    { head: "  ╭─────╮", eyes: "  │ ★   ☆ │", mouth: "  │  ▽▽▽  │", chin: "  ╰─────╯", aura: " ✨ ✨    " },
    { head: "  ╭─────╮", eyes: "  │ ★   ★ │", mouth: "  │  ◡◡◡  │", chin: "  ╰─────╯", aura: "  ✨ ✨   " },
  ],
  sleep: [
    { head: "  ╭─────╮", eyes: "  │ ─   ─ │", mouth: "  │  ───  │", chin: "  ╰─────╯", aura: " z        " },
    { head: "  ╭─────╮", eyes: "  │ ─   ─ │", mouth: "  │  ───  │", chin: "  ╰─────╯", aura: "  z       " },
    { head: "  ╭─────╮", eyes: "  │ ─   ─ │", mouth: "  │  ───  │", chin: "  ╰─────╯", aura: "   Z      " },
    { head: "  ╭─────╮", eyes: "  │ ─   ─ │", mouth: "  │  ───  │", chin: "  ╰─────╯", aura: "    Z     " },
  ],
};

const STATE_COLOR: Record<MascotState, string> = {
  idle:      colors.accent,
  think:     colors.orchid,
  type:      colors.cyan,
  tool:      colors.gold,
  error:     colors.danger,
  celebrate: colors.success,
  sleep:     colors.dim,
};

const INTERVALS: Record<MascotState, number> = {
  idle:      700,
  think:     200,
  type:      150,
  tool:      180,
  error:     300,
  celebrate: 120,
  sleep:     900,
};

export interface MascotProps {
  state?: MascotState;
  label?: string;
}

export function Mascot({ state = "idle", label }: MascotProps): React.ReactElement {
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    const frames = FRAMES[state];
    setFrameIdx(0);
    const id = setInterval(() => {
      setFrameIdx((i) => (i + 1) % frames.length);
    }, INTERVALS[state]);
    return () => clearInterval(id);
  }, [state]);

  const frames = FRAMES[state];
  const frame = frames[frameIdx % frames.length] ?? frames[0]!;
  const color = STATE_COLOR[state];

  return (
    <Box flexDirection="column" marginRight={1}>
      <Text color={color}>{frame.head}</Text>
      <Text color={color}>{frame.eyes}</Text>
      <Text color={color}>{frame.mouth}</Text>
      <Text color={color}>{frame.chin}</Text>
      <Text color={colors.muted}>{frame.aura}{label ? ` ${label}` : ""}</Text>
    </Box>
  );
}
