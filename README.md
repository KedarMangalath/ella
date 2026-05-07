# Ella

Ella is a TypeScript-first CLI coding agent inspired by Claude Code, OpenCode, and Gemini CLI.

It is built to be model-agnostic from day one: bring your own API key, choose a provider, pick a model, select a thinking mode, and work inside an interactive terminal agent with local coding tools.

## Status

Ella is early MVP software. The current build has the product spine: CLI commands, first-run setup, provider adapters, model selection, slash commands, permissioned local tools, and project initialization.

## Features

- First-run setup wizard for provider, API key, model, thinking mode, and approval mode
- Provider support for OpenAI, Anthropic, Gemini, and OpenRouter
- Stored API keys with modify/delete support
- Environment variable API key support
- Interactive terminal chat
- Non-interactive `ella ask` mode
- Persistent session history and resume
- Claude Code/OpenCode/Gemini CLI-style slash commands
- Project memory and todo list
- Agent shortcuts for planning, review, fixing, and explanation
- Local coding tools for reading, searching, editing, shell commands, and git inspection
- Permission modes with edit/shell previews for safer operation
- Project initialization with `ELLA.md`

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
node dist/cli.js config set-key openai
node dist/cli.js config set-key anthropic
node dist/cli.js config set-key gemini
node dist/cli.js config set-key openrouter
```

Delete a stored key:

```bash
node dist/cli.js config delete-key openai
```

Check key status:

```bash
node dist/cli.js config key-status
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
node dist/cli.js setup
node dist/cli.js commands
node dist/cli.js sessions
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
/plan <task>
/review [focus]
/fix <problem>
/explain <topic>
/base-url <provider> <url>
```

## Sessions

Ella saves interactive sessions under `~/.ella/sessions`.

```bash
node dist/cli.js sessions
node dist/cli.js resume
node dist/cli.js resume <session-id>
```

Inside interactive mode:

```text
/sessions
/resume <session-id>
/new
```

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
- Session history and resume
- Better terminal UI
- MCP client support
- Code-review-graph integration
- Project memory and compaction
- Subagents for planning, exploration, coding, review, and testing
- Safer patch previews
- Test/build auto-repair loop

## Security

Do not commit API keys. Ella stores local keys in `~/.ella/config.json` by default. You can remove them with:

```bash
node dist/cli.js config delete-key <provider>
```

For shared machines, prefer environment variables or a dedicated secret manager.

## Development

```bash
npm install
npm run build
npm run check
```
