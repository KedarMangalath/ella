import { stdout } from "node:process";

type Rgb = readonly [number, number, number];

const palette = {
  plum:     [92,  42,  105] as unknown as Rgb,
  mauve:    [183, 132, 167] as unknown as Rgb,
  orchid:   [202, 129, 213] as unknown as Rgb,
  lavender: [222, 203, 247] as unknown as Rgb,
  rose:     [232, 162, 190] as unknown as Rgb,
  ink:      [245, 240, 248] as unknown as Rgb,
  muted:    [174, 153, 181] as unknown as Rgb,
  success:  [132, 210, 173] as unknown as Rgb,
  warning:  [236, 197, 121] as unknown as Rgb,
  danger:   [244, 131, 151] as unknown as Rgb,
  cyan:     [129, 218, 215] as unknown as Rgb,
  gold:     [246, 214, 120] as unknown as Rgb,
};

const highContrastPalette = {
  ...palette,
  mauve:    [255, 179, 240] as unknown as Rgb,
  orchid:   [239, 166, 255] as unknown as Rgb,
  lavender: [255, 235, 255] as unknown as Rgb,
  rose:     [255, 190, 220] as unknown as Rgb,
  muted:    [230, 214, 236] as unknown as Rgb,
};

function activePalette(): typeof palette {
  return process.env.ELLA_HIGH_CONTRAST ? highContrastPalette : palette;
}

export function colorEnabled(): boolean {
  return !process.env.NO_COLOR && (Boolean(process.env.FORCE_COLOR) || stdout.isTTY);
}

function esc(code: string): string {
  return `\x1b[${code}m`;
}

function rgb([r, g, b]: Rgb): string {
  return esc(`38;2;${r};${g};${b}`);
}

function paint(color: Rgb, text: string): string {
  if (!colorEnabled()) return text;
  return `${rgb(color)}${text}${esc("0")}`;
}

function style(code: string, text: string): string {
  if (!colorEnabled()) return text;
  return `${esc(code)}${text}${esc("0")}`;
}

export const theme = {
  palette,
  enabled: colorEnabled,
  bold:    (t: string) => style("1", t),
  dim:     (t: string) => style("2", t),
  italic:  (t: string) => style("3", t),
  header:  (t: string) => theme.bold(paint(activePalette().orchid, t)),
  brand:   (t: string) => theme.bold(paint(activePalette().lavender, t)),
  accent:  (t: string) => paint(activePalette().mauve, t),
  command: (t: string) => paint(activePalette().orchid, t),
  prompt:  (t: string) => paint(activePalette().rose, t),
  label:   (t: string) => paint(activePalette().lavender, t),
  value:   (t: string) => paint(activePalette().ink, t),
  muted:   (t: string) => paint(activePalette().muted, t),
  success: (t: string) => paint(activePalette().success, t),
  warning: (t: string) => paint(activePalette().warning, t),
  danger:  (t: string) => paint(activePalette().danger, t),
  tool:    (t: string) => theme.bold(paint(activePalette().mauve, t)),
  code:    (t: string) => paint(activePalette().lavender, t),
  cyan:    (t: string) => paint(activePalette().cyan, t),
  gold:    (t: string) => paint(activePalette().gold, t),
};

export function kv(label: string, value: string): string {
  return `${theme.label(`${label}:`)} ${theme.value(value)}`;
}
