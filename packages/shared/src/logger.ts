import { stdout, stderr } from "node:process";
import { theme } from "./theme.js";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

function currentLevel(): LogLevel {
  const env = process.env.ELLA_LOG_LEVEL?.toLowerCase();
  if (env && env in LEVELS) return env as LogLevel;
  return process.env.DEBUG ? "debug" : "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel()];
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export const logger = {
  debug(...args: unknown[]) {
    if (!shouldLog("debug")) return;
    stdout.write(`${theme.muted(`[${timestamp()}]`)} ${theme.dim("DBG")} ${args.join(" ")}\n`);
  },
  info(...args: unknown[]) {
    if (!shouldLog("info")) return;
    stdout.write(`${theme.muted(`[${timestamp()}]`)} ${theme.cyan("INF")} ${args.join(" ")}\n`);
  },
  warn(...args: unknown[]) {
    if (!shouldLog("warn")) return;
    stderr.write(`${theme.muted(`[${timestamp()}]`)} ${theme.warning("WRN")} ${args.join(" ")}\n`);
  },
  error(...args: unknown[]) {
    if (!shouldLog("error")) return;
    stderr.write(`${theme.muted(`[${timestamp()}]`)} ${theme.danger("ERR")} ${args.join(" ")}\n`);
  },
};
