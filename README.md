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
- Claude Code/OpenCode/Gemini CLI-style slash commands
- Project memory and todo list
- Agent shortcuts for planning, review, fixing, and explanation
- Purple-mauve terminal palette with `NO_COLOR` support
- Animated line-based Ella character during startup, thinking, and tool execution
- Accessibility settings for color, motion, contrast, and screen-reader-friendly mode
- Undo/redo for Ella file edits
- Lightweight repository graph for symbol/import/path search and impact checks
- Subagent profiles and swarm workflow prompts
- Local coding tools for reading, searching, editing, shell commands, and git inspection
- Permission modes with edit/shell previews for safer operation
- Project initialization with `ELLA.md`

## Easiest Path

Run Ella, paste your API key when prompted, then type naturally.

```bash
node dist/cli.js
```

You can also skip command memorization:

```bash
node dist/cli.js "fix the failing tests"
node dist/cli.js review
node dist/cli.js continue "keep going"
git diff | node dist/cli.js review
```

## Install

```bash
npm install
npm run build
```

Run locally:

```bash
node dist/cli.js
```

After publishing, the intended global command is:

```bash
ella
```

## First Run

Launch Ella:

```bash
node dist/cli.js
```

Ella prompts in the terminal:

```text
Provider (openai):
API key for openai [missing; Enter keep/skip]:
Model name or number (gpt-5.1):
Thinking mode (balanced) [fast/balanced/deep/max]:
Approval mode (ask) [ask/auto-edit/full-auto/read-only]:
```

The API key is remembered in your global Ella config.

## API Keys

Paste a key inside the CLI:

```bash
node dist/cli.js setup
```

Or set one directly:

```bash
node dist/cli.js key set openai
node dist/cli.js key set anthropic
node dist/cli.js key set gemini
node dist/cli.js key set openrouter
```

Delete a stored key:

```bash
node dist/cli.js key delete openai
```

Check key status:

```bash
node dist/cli.js key status
```

Environment variables also work:

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
```

## Commands

```bash
node dist/cli.js
node dist/cli.js ask "review this repo"
node dist/cli.js "fix the failing tests"
node dist/cli.js setup
node dist/cli.js commands
node dist/cli.js status
node dist/cli.js key status
node dist/cli.js key set [provider]
node dist/cli.js key delete [provider]
node dist/cli.js provider <provider>
node dist/cli.js model <name-or-number>
node dist/cli.js think <fast|balanced|deep|max>
node dist/cli.js approval <ask|auto-edit|full-auto|read-only>
node dist/cli.js base-url <provider> <url>
node dist/cli.js sessions
node dist/cli.js continue [prompt]
node dist/cli.js resume [session-id]
node dist/cli.js memory show
node dist/cli.js memory add "Use strict TypeScript."
node dist/cli.js todo list
node dist/cli.js todo add "Add streaming responses"
node dist/cli.js todo done <todo-id>
node dist/cli.js plan "Add MCP support"
node dist/cli.js review
node dist/cli.js fix "Tests fail in provider parsing"
node dist/cli.js explain "How tool permissions work"
node dist/cli.js undo
node dist/cli.js redo
node dist/cli.js history
node dist/cli.js graph build
node dist/cli.js graph stats
node dist/cli.js graph search "EllaAgent"
node dist/cli.js graph impact "src/tools.ts"
node dist/cli.js agents
node dist/cli.js swarm "Add MCP support"
git diff | node dist/cli.js review
node dist/cli.js accessibility show
node dist/cli.js accessibility set reducedMotion on
node dist/cli.js init
node dist/cli.js models
node dist/cli.js tools
node dist/cli.js doctor
node dist/cli.js config show
node dist/cli.js config set-key <provider>
node dist/cli.js config delete-key <provider>
node dist/cli.js config key-status
node dist/cli.js config set-base-url <provider> <url>
node dist/cli.js config set-provider <provider>
node dist/cli.js config set-model <model>
node dist/cli.js config set-thinking <fast|balanced|deep|max>
node dist/cli.js config set-approval <ask|auto-edit|full-auto|read-only>
```

## Terminal Theme

Ella uses a purple-mauve ANSI palette for prompts, headers, commands, status labels, success messages, warnings, errors, and tool activity.

Ella also renders a small line-based character in the CLI. The character is static on startup/setup and animated while Ella is thinking or running tools.

Disable color:

```bash
NO_COLOR=1 node dist/cli.js
```

Force color in environments that do not expose a TTY:

```bash
FORCE_COLOR=1 node dist/cli.js commands
```

Disable animation only:

```bash
ELLA_NO_ANIMATION=1 node dist/cli.js
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
node dist/cli.js sessions
node dist/cli.js continue
node dist/cli.js continue "Keep going from the last task"
node dist/cli.js resume
node dist/cli.js resume <session-id>
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
node dist/cli.js accessibility show
node dist/cli.js accessibility set noColor on
node dist/cli.js accessibility set reducedMotion on
node dist/cli.js accessibility set highContrast on
node dist/cli.js accessibility set screenReader on
```

Settings:

- `noColor`: disables ANSI colors
- `reducedMotion`: disables character animation
- `highContrast`: uses brighter mauve/lavender colors
- `screenReader`: disables animation and favors stable output

## Project Memory

Project memory is local to the current repo under `.ella/memory.md`.

```bash
node dist/cli.js memory show
node dist/cli.js memory add "Prefer small modules and strict types."
node dist/cli.js memory clear
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
node dist/cli.js todo list
node dist/cli.js todo add "Implement MCP support"
node dist/cli.js todo done <todo-id>
node dist/cli.js todo clear
```

## Undo And Redo

Ella records tool-driven file edits in `.ella/undo.json`.

```bash
node dist/cli.js history
node dist/cli.js undo
node dist/cli.js redo
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
node dist/cli.js graph build
node dist/cli.js graph stats
node dist/cli.js graph search "symbol-or-path"
node dist/cli.js graph impact "src/tools.ts"
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
node dist/cli.js agents
```

Run a swarm workflow:

```bash
node dist/cli.js swarm "Implement streaming output"
```

The swarm command asks Ella to coordinate the profiles through plan, context, changes, validation, risks, and next steps.

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
- `run_shell`
- `git_status`
- `git_diff`
- `graph_build`
- `graph_stats`
- `graph_search`
- `graph_impact`

Edit and shell tools are permissioned according to the active approval mode.

In `ask` mode, Ella previews edits and shell commands before running them.

## Project Init

Initialize a repo for Ella:

```bash
node dist/cli.js init
```

This creates:

- `ELLA.md` for project-specific instructions
- `.ella/project.json` for local project metadata

`.ella/` is local state and should not be committed.

## Roadmap

- Streaming model output
- MCP client support
- Project memory and compaction
- Safer patch previews
- Test/build auto-repair loop
- Real concurrent subagent execution
- Deeper code-review-graph integration

## Security

Do not commit API keys. Ella stores local keys in `~/.ella/config.json` by default. You can remove them with:

```bash
node dist/cli.js key delete <provider>
```

For shared machines, prefer environment variables or a dedicated secret manager.

## Development

```bash
npm install
npm run build
npm run check
```
