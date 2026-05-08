import type { PermissionAction, PermissionRule } from "./types.js";

export interface PermissionDecision {
  action: PermissionAction | null;
  rule?: PermissionRule;
  pattern?: string;
}

export const DEFAULT_PERMISSION_RULES: PermissionRule[] = [
  { permission: "read_file", pattern: "*.env", action: "ask" },
  { permission: "read_file", pattern: "*.env.*", action: "ask" },
  { permission: "read_file", pattern: "*.env.example", action: "allow" },
  { permission: "write_file", pattern: "*.env", action: "ask" },
  { permission: "replace_in_file", pattern: "*.env", action: "ask" },
  { permission: "apply_patch", pattern: "*.env", action: "ask" },
  { permission: "run_shell", pattern: "rm", action: "ask" },
  { permission: "run_shell", pattern: "del", action: "ask" },
  { permission: "run_shell", pattern: "Remove-Item", action: "ask" },
  { permission: "run_shell", pattern: "git push", action: "ask" },
];

function normalize(value: string): string {
  return value.trim().replaceAll("\\", "/").toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function wildcardMatch(pattern: string, value: string): boolean {
  const normalizedPattern = normalize(pattern || "*");
  const normalizedValue = normalize(value || "");
  const source = normalizedPattern
    .split("*")
    .map((part) => part.split("?").map(escapeRegex).join("."))
    .join(".*");
  return new RegExp(`^${source}$`, "i").test(normalizedValue);
}

export function parsePermissionAction(value: string): PermissionAction | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "allow" || normalized === "deny" || normalized === "ask") return normalized;
  return null;
}

export function activePermissionRules(userRules: PermissionRule[]): PermissionRule[] {
  return [...DEFAULT_PERMISSION_RULES, ...userRules];
}

export function evaluatePermission(
  permission: string,
  patterns: string[],
  rules: PermissionRule[],
): PermissionDecision {
  let decision: PermissionDecision = { action: null };
  const safePatterns = patterns.length ? patterns : ["*"];
  for (const rule of rules) {
    if (!wildcardMatch(rule.permission, permission)) continue;
    const matchedPattern = safePatterns.find((pattern) => wildcardMatch(rule.pattern, pattern));
    if (!matchedPattern) continue;
    decision = { action: rule.action, rule, pattern: matchedPattern };
  }
  return decision;
}

export function upsertPermissionRule(
  rules: PermissionRule[],
  action: PermissionAction,
  permission: string,
  pattern: string,
): PermissionRule[] {
  const normalizedPermission = permission.trim();
  const normalizedPattern = pattern.trim() || "*";
  const next = rules.filter((rule) => (
    normalize(rule.permission) !== normalize(normalizedPermission) ||
    normalize(rule.pattern) !== normalize(normalizedPattern)
  ));
  next.push({ permission: normalizedPermission, pattern: normalizedPattern, action });
  return next;
}

export function removePermissionRule(
  rules: PermissionRule[],
  permission: string,
  pattern: string,
): PermissionRule[] {
  return rules.filter((rule) => (
    normalize(rule.permission) !== normalize(permission) ||
    normalize(rule.pattern) !== normalize(pattern || "*")
  ));
}

export function formatPermissionRules(rules: PermissionRule[], includeDefaults = true): string {
  const sections: string[] = [];
  if (includeDefaults) {
    sections.push([
      "Built-in safety rules:",
      ...DEFAULT_PERMISSION_RULES.map((rule) => `- ${rule.action} ${rule.permission} ${rule.pattern}`),
    ].join("\n"));
  }
  sections.push(rules.length
    ? [
      "Configured rules:",
      ...rules.map((rule, index) => `${index + 1}. ${rule.action} ${rule.permission} ${rule.pattern}`),
    ].join("\n")
    : "Configured rules: none");
  return sections.join("\n\n");
}
