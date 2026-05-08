import { stdout } from "node:process";
import { theme } from "./theme.js";

// Adapted from OpenCode's tiny split-logo module shape, but with Ella's own ASCII wordmark.
const LOGO = {
  full: [
    "  ______ _ _       ",
    " |  ____| | |      ",
    " | |__  | | | __ _ ",
    " |  __| | | |/ _` |",
    " | |____| | | (_| |",
    " |______|_|_|\\__,_|",
  ],
  compact: [
    "  ___ _ _       ",
    " | __| | | __ _ ",
    " | _|| | |/ _` |",
    " |___|_|_|\\__,_|",
  ],
};

function terminalWidth(): number {
  return stdout.columns || 80;
}

export function renderEllaLogo(caption?: string): string {
  if (process.env.ELLA_SCREEN_READER) {
    return caption ? `Ella - ${caption}` : "Ella";
  }
  const lines = terminalWidth() < 52 ? LOGO.compact : LOGO.full;
  const logo = lines
    .map((line, index) => index % 2 === 0 ? theme.brand(line) : theme.accent(line))
    .join("\n");
  return caption ? `${logo}\n${theme.muted(caption)}` : logo;
}
