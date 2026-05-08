# Ella

Ella is a TypeScript-first CLI coding agent inspired by Claude Code, OpenCode, and Gemini CLI.

It is built to be model-agnostic from day one: bring your own API key, choose a provider, pick a model, select a thinking mode, and work inside an interactive terminal agent with local coding tools.

## Status

Ella is early sprint software with the main product spine in place: first-run setup, provider adapters, model selection, thinking modes, sessions, slash commands, local tools, undo/redo, repo graph helpers, accessibility settings, and swarm-style workflows.

## Features

- First-run setup wizard for provider, API key, model, thinking mode, and approval mode
- Provider support for OpenAI, Anthropic, Gemini, and OpenRouter
- Stored API keys with modify/delete support
- Environment variable API key support
- Interactive terminal chat
- Non-interactive `ella ask` mode, piped input, and plain-English top-level prompts
- Persistent session history, saved one-shot runs, and real continuation
- Central command registry for clean CLI help and slash commands
- Claude Code/OpenCode/Gemini CLI-style slash commands
- Project memory and todo list
- Agent shortcuts for planning, review, fixing, and explanation
- Purple-mauve terminal palette with `NO_COLOR` support
- Animated line-based Ella character during startup, thinking, and tool execution
- Proper responsive Ella ASCII wordmark
- Accessibility settings for color, motion, contrast, and screen-reader-friendly mode
- Undo/redo for Ella file edits
- Lightweight repository graph for symbol/import/path search and impact checks
- Subagent profiles and swarm workflow prompts
- MCP, skills, hooks, and extensions registry commands
- Local coding tools for reading, searching, patching, editing, shell commands, and git inspection
- OpenCode-style permission rules with allow, deny, and ask actions
- Permission modes with edit/shell previews for safer operation
- Project initialization with `ELLA.md`

## Easiest Path

Run Ella, paste your API key when prompted, then type naturally.

```bash
npm run install:global
ella
```

You can also skip command memorization:

```bash
ella "fix the failing tests"
ella review
ella continue "keep going"
git diff | ella review
```

## Install

```bash
npm install
npm run build
npm run install:global
```

On Windows, this also removes npm's generated `ella.ps1` shim so PowerShell can resolve the working `ella.cmd` command when script execution is disabled.

Run locally without linking:

```bash
ella
```

After linking, use:

```bash
ella
```

## First Run

Launch Ella:

```bash
ella
```

Ella prompts in the terminal:

```text
Provider (openai):
API key for openai [missing; Enter keep/skip]:
Model name or number (gpt-5.1):
Thinking mode (balanced) [fast/balanced/deep/max]:
Approval mode (ask) [ask/auto-edit/full-auto/read-only]:
```

The API key is remembered in `~/.ella/auth.json`.

## API Keys

Paste a key inside the CLI:

```bash
ella setup
```

Or set one directly:

```bash
ella key set openai
ella key set anthropic
ella key set gemini
ella key set openrouter
```

Delete a stored key:

```bash
ella key delete openai
```

Check key status:

```bash
ella key status
```

Keys use an OpenCode-style provider-keyed auth store at `~/.ella/auth.json`; general preferences stay in `~/.ella/config.json`.

Environment variables also work:

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
```

## Commands

```bash
ella
ella ask "review this repo"
ella "fix the failing tests"
ella setup
ella commands
ella status
ella key status
ella key set [provider]
ella key delete [provider]
ella provider <provider>
ella model <name-or-number>
ella think <fast|balanced|deep|max>
ella approval <ask|auto-edit|full-auto|read-only>
ella permissions
ella permissions allow run_shell npm
ella permissions deny read_file "*.env"
ella patch --dry-run
ella base-url <provider> <url>
ella sessions
ella continue [prompt]
ella resume [session-id]
ella memory show
ella memory add "Use strict TypeScript."
ella todo list
ella todo add "Add streaming responses"
ella todo done <todo-id>
ella plan "Add MCP support"
ella review
ella fix "Tests fail in provider parsing"
ella explain "How tool permissions work"
ella undo
ella redo
ella history
ella graph build
ella graph stats
ella graph search "EllaAgent"
ella graph impact "src/tools.ts"
ella mcp list
ella mcp add local "node server.js"
ella skills list
ella skills install reviewer ./skills/reviewer
ella hooks add prebuild "npm run check"
ella extensions install sample ./extension
ella agents
ella swarm "Add MCP support"
git diff | ella review
ella accessibility show
ella accessibility set reducedMotion on
ella init
ella models
ella tools
ella doctor
ella config show
ella config set-key <provider>
ella config delete-key <provider>
ella config key-status
ella config set-base-url <provider> <url>
ella config set-provider <provider>
ella config set-model <model>
ella config set-thinking <fast|balanced|deep|max>
ella config set-approval <ask|auto-edit|full-auto|read-only>
```

## Terminal Theme

Ella uses a purple-mauve ANSI palette for prompts, headers, commands, status labels, success messages, warnings, errors, and tool activity.

Ella also renders a small line-based character in the CLI. The character is static on startup/setup and animated while Ella is thinking or running tools.

Disable color:

```bash
NO_COLOR=1 ella
```

Force color in environments that do not expose a TTY:

```bash
FORCE_COLOR=1 ella commands
```

Disable animation only:

```bash
ELLA_NO_ANIMATION=1 ella
```

Providers:

```text
openai
anthropic
gemini
openrouter
```

Approval modes:

```text
ask
auto-edit
full-auto
read-only
```

## Slash Commands

Inside interactive mode:

```text
/commands, /help
/exit, /quit
/setup
/status
/sessions
/continue [prompt]
/resume [session-id]
/new
/config
/tools
/permissions
/permissions allow <permission> <pattern>
/permissions deny <permission> <pattern>
/permissions ask <permission> <pattern>
/permissions remove <permission> <pattern>
/patch <patch-text>
/models [provider]
/provider <openai|anthropic|gemini|openrouter>
/model <name-or-number>
/think <fast|balanced|deep|max>
/approval <ask|auto-edit|full-auto|read-only>
/key status
/key set [provider]
/key delete [provider]
/memory show|add|clear
/todo list|add|done|clear
/undo
/redo
/history
/graph build|stats|search|impact
/mcp <list|add|remove|enable|disable>
/skills <list|install|link|uninstall|enable|disable>
/hooks <list|add|remove|enable|disable>
/extensions <list|install|link|uninstall|enable|disable>
/agents
/swarm <task>
/accessibility <setting> <on|off>
/plan <task>
/review [focus]
/fix <problem>
/explain <topic>
/base-url <provider> <url>
```

## Sessions

Ella saves interactive sessions under `~/.ella/sessions`.

One-shot prompts are saved too, so `continue` works after both interactive and non-interactive runs.

```bash
ella sessions
ella continue
ella continue "Keep going from the last task"
ella resume
ella resume <session-id>
```

Inside interactive mode:

```text
/sessions
/continue
/resume <session-id>
/new
```

## Accessibility

Ella has persistent accessibility settings:

```bash
ella accessibility show
ella accessibility set noColor on
ella accessibility set reducedMotion on
ella accessibility set highContrast on
ella accessibility set screenReader on
```

Settings:

- `noColor`: disables ANSI colors
- `reducedMotion`: disables character animation
- `highContrast`: uses brighter mauve/lavender colors
- `screenReader`: disables animation and favors stable output

## Project Memory

Project memory is local to the current repo under `.ella/memory.md`.

```bash
ella memory show
ella memory add "Prefer small modules and strict types."
ella memory clear
```

Inside interactive mode:

```text
/memory show
/memory add Prefer small modules and strict types.
/memory clear
```

Ella automatically includes project memory in future prompts.

## Todos

Todos are stored under `.ella/todos.json` and injected into future prompts.

```bash
ella todo list
ella todo add "Implement MCP support"
ella todo done <todo-id>
ella todo clear
```

## Undo And Redo

Ella records tool-driven file edits in `.ella/undo.json`.

```bash
ella history
ella undo
ella redo
```

Inside interactive mode:

```text
/history
/undo
/redo
```

## Repo Graph

Ella includes a lightweight repository graph inspired by code-review-graph. It indexes paths, imports, symbols, and file sizes.

```bash
ella graph build
ella graph stats
ella graph search "symbol-or-path"
ella graph impact "src/tools.ts"
```

The model can also use graph tools:

- `graph_build`
- `graph_stats`
- `graph_search`
- `graph_impact`

## Subagents And Swarm

Ella includes built-in subagent profiles:

- `planner`
- `explorer`
- `coder`
- `reviewer`
- `tester`

List them:

```bash
ella agents
```

Run a swarm workflow:

```bash
ella swarm "Implement streaming output"
```

The swarm command asks Ella to coordinate the profiles through plan, context, changes, validation, risks, and next steps.

## MCP, Skills, Hooks, Extensions

Ella has Gemini CLI-style management commands for local integration entries. They are stored in `~/.ella/integrations.json`.

```bash
ella mcp list
ella mcp add local "node server.js"
ella mcp disable local
ella skills install reviewer ./skills/reviewer
ella hooks add prebuild "npm run check"
ella extensions install sample ./extension
```

Inside interactive mode:

```text
/mcp list
/skills list
/hooks list
/extensions list
```

## Local Tools

Ella exposes tools to the model using XML-like tool blocks:

```xml
<ella_tool name="read_file">{"path":"src/index.ts"}</ella_tool>
```

Current tools:

- `list_files`
- `read_file`
- `search_files`
- `write_file`
- `replace_in_file`
- `apply_patch`
- `run_shell`
- `git_status`
- `git_diff`
- `graph_build`
- `graph_stats`
- `graph_search`
- `graph_impact`

Edit and shell tools are permissioned according to the active approval mode and configured permission rules.

In `ask` mode, Ella previews edits and shell commands before running them.

## Permissions

Ella has OpenCode-style permission rules. Rules are stored in `~/.ella/config.json` and are evaluated after built-in safety rules, so your explicit rule wins.

```bash
ella permissions
ella permissions allow run_shell npm
ella permissions ask apply_patch "src/**"
ella permissions deny read_file "*.env"
ella permissions remove run_shell npm
ella permissions clear
```

Supported actions:

- `allow`: run without prompting unless `read-only` mode blocks edits/shell
- `ask`: always show a preview and wait for confirmation
- `deny`: block the tool for the matching pattern

Common permission names include `read_file`, `search_files`, `write_file`, `replace_in_file`, `apply_patch`, `run_shell`, `git_diff`, and the `graph_*` tools.

## Apply Patch

Ella can apply patch blocks from the model or from your terminal. Patch edits are recorded in undo history.

```bash
ella patch --dry-run < my-change.patch
ella patch < my-change.patch
ella undo
```

Patch format:

```text
*** Begin Patch
*** Update File: src/example.ts
@@
-old text
+new text
*** End Patch
```

## Project Init

Initialize a repo for Ella:

```bash
ella init
```

This creates:

- `ELLA.md` for project-specific instructions
- `.ella/project.json` for local project metadata

`.ella/` is local state and should not be committed.

## Roadmap

- Streaming model output
- MCP client support
- Execute configured hooks and extensions
- Project memory and compaction
- Safer patch previews
- Test/build auto-repair loop
- Real concurrent subagent execution
- Deeper code-review-graph integration

## Security

Do not commit API keys. Ella stores local keys in `~/.ella/auth.json` by default. You can remove them with:

```bash
ella key delete <provider>
```

For shared machines, prefer environment variables or a dedicated secret manager.

## Development

```bash
npm install
npm run build
npm run install:global
npm run check
```
