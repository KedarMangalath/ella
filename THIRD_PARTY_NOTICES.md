# Third-Party Notices

Ella includes code and structural adaptations from local open-source projects in `../Agentic`.

## OpenCode

- Source: `../Agentic/opencode`
- License: MIT
- Used/adapted:
  - CLI logo module shape from `packages/opencode/src/cli/logo.ts`
  - Auth-store pattern from `packages/opencode/src/auth/index.ts`
  - Provider/model listing flow from `packages/opencode/src/cli/cmd/models.ts`
  - Patch-tool structure from `packages/opencode/src/tool/apply_patch.ts`
  - Patch parsing and file-operation ideas from `packages/opencode/src/patch/index.ts`
  - Permission rule evaluation concepts from `packages/opencode/src/permission/index.ts`, `packages/opencode/src/permission/evaluate.ts`, and `packages/opencode/src/permission/arity.ts`
  - Shell permission pattern ideas from `packages/opencode/src/tool/bash.ts`

MIT license text is available in `../Agentic/opencode/LICENSE`.

## Gemini CLI

- Source: `../Agentic/gemini-cli`
- License: Apache-2.0
- Used/adapted: command grouping patterns from `packages/cli/src/commands/mcp.ts` and `packages/cli/src/commands/skills.tsx`.

Apache-2.0 license text is available in `../Agentic/gemini-cli/LICENSE`.

## Claude Code Main Folder

- Source inspected: `../Agentic/claude-code-main/src`
- Status: no root license file was present in the local folder during this sprint.
- Use in Ella: command taxonomy and feature targets were inspected, but code was not copied into Ella until license attribution can be represented cleanly.
