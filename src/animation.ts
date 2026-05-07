import { stdout } from "node:process";
import { theme } from "./theme.js";

const FRAME_HEIGHT = 4;

const THINK_FRAMES = [
  ["  /-----\\", " | o   o |", " |   ^   |", "  \\_..._/"],
  ["  /-----\\", " | -   o |", " |   ^   |", "  \\_..._/"],
  ["  /-----\\", " | o   - |", " |   ^   |", "  \\_..._/"],
  ["  /-----\\", " | O   O |", " |   -   |", "  \\_..._/"],
];

const TOOL_FRAMES = [
  ["  /-----\\", " | >   < |", " |   _   |", "  \\_===_/"],
  ["  /-----\\", " | >   < |", " |   o   |", "  \\_===_/"],
  ["  /-----\\", " | >   < |", " |   O   |", "  \\_===_/"],
  ["  /-----\\", " | >   < |", " |   o   |", "  \\_===_/"],
];

export type AnimationKind = "think" | "tool";

export interface EllaAnimator {
  start(): void;
  stop(): void;
}

export function ellaStill(label = "ready"): string {
  const [head, eyes, mouth, chin] = THINK_FRAMES[0];
  return [
    theme.accent(head || ""),
    `${theme.accent(eyes || "")} ${theme.muted(label)}`,
    theme.accent(mouth || ""),
    theme.accent(chin || ""),
  ].join("\n");
}

function animationEnabled(): boolean {
  return Boolean(stdout.isTTY && !process.env.ELLA_NO_ANIMATION);
}

function clearFrame(): void {
  stdout.write(`\x1b[${FRAME_HEIGHT}F\x1b[J`);
}

function hideCursor(): void {
  stdout.write("\x1b[?25l");
}

function showCursor(): void {
  stdout.write("\x1b[?25h");
}

function renderFrame(frame: string[], label: string): void {
  const [head, eyes, mouth, chin] = frame;
  stdout.write(
    [
      theme.accent(head || ""),
      `${theme.accent(eyes || "")} ${theme.muted(label)}`,
      theme.accent(mouth || ""),
      theme.accent(chin || ""),
    ].join("\n") + "\n",
  );
}

export function createEllaAnimator(label: string, kind: AnimationKind = "think"): EllaAnimator {
  if (!animationEnabled()) {
    return {
      start() {},
      stop() {},
    };
  }

  const frames = kind === "tool" ? TOOL_FRAMES : THINK_FRAMES;
  let index = 0;
  let timer: NodeJS.Timeout | null = null;
  let rendered = false;

  function draw(): void {
    if (rendered) clearFrame();
    renderFrame(frames[index % frames.length] || frames[0], label);
    rendered = true;
    index += 1;
  }

  return {
    start() {
      if (timer) return;
      hideCursor();
      draw();
      timer = setInterval(draw, 160);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (rendered) {
        clearFrame();
        rendered = false;
      }
      showCursor();
    },
  };
}

export async function withEllaAnimation<T>(
  label: string,
  kind: AnimationKind,
  action: () => Promise<T>,
): Promise<T> {
  const animator = createEllaAnimator(label, kind);
  animator.start();
  try {
    return await action();
  } finally {
    animator.stop();
  }
}
