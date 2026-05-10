# ELLA — Model-Agnostic Agentic Coding CLI

**Ella** is an advanced, model-agnostic AI coding assistant for the terminal — purpose-built to outclass Codex, OpenCode, Claude Code, and Gemini CLI with features none of them ship individually.

```
✦ ELLA  ^1 Chat  ^2 Heatmap  ^3 Tree  ^4 Pair     ctrl+c exit  │  /help
┌──────────────┬────────────────────────────────────────────────────────┐
│  (◉_◉)      │  > refactor the auth module to use JWT                │
│   |▸|        │                                                        │
│  ready       │  Sure — reading the auth module first…               │
│              │  [read_file] src/auth/index.ts                        │
│              │  [replace_in_file] Replacing session tokens with JWT  │
└──────────────┴────────────────────────────────────────────────────────┘
  Provider: anthropic  Model: claude-sonnet-4-6  ↑12k ↓3k  $0.012
```

---

## Features

### Core
- **Multi-provider** — Anthropic, OpenAI, Gemini, OpenRouter — switch mid-session
- **Streaming agent loop** — full `AsyncGenerator<StreamEvent>` pipeline with thinking block support
- **Rich tool set** — `list_files`, `read_file`, `search_files`, `write_file`, `replace_in_file`, `run_shell`, `git_status`, `git_diff`, `git_log`
- **Permission system** — `ask | auto-edit | full-auto | read-only` modes with per-pattern rules
- **MCP client** — JSON-RPC over stdio; connect any MCP server
- **Session persistence** — resumable sessions with full message history, cost tracking, and tagging

### Advanced TUI
- **Animated ASCII mascot** — 7 states (idle / think / type / tool / error / celebrate / sleep), truecolor gradients, frame-animated
- **4-panel layout** — Chat · Heatmap · Session Tree · Pair Mode (Ctrl+1–4 to switch)
- **Streaming token display** — tokens appear live as the model generates

### Differentiating Features (not in any competing tool)

| Feature | Description |
|---|---|
| **Time-travel sessions** | Fork any session at any prior turn. Visualize the full branching tree. |
| **Session tree** | ASCII tree view of all sessions and their forks with cost per branch. |
| **File touch heatmap** | Per-file write counts visualized with heat bars (░▒▓█). See exactly what Ella has been editing. |
| **Pair mode** | Run the same prompt on two providers simultaneously. Side-by-side comparison with cost+timing. |
| **Replay evals** | Re-run any saved session against the current agent. Measures drift score per turn. |
| **Cost budgeter** | Set a USD cap per session. Warns at 80%, hard-aborts at 100%. |
| **Undo/redo** | Every file write is journaled. `/undo` + `/redo` across the entire session, persisted across restarts. |
| **Skills system** | Drop `.md` files in `.ella/skills/` — injected into the system prompt. Override globally or per-project. |
| **Memory with provenance** | `/remember <text>` stores with session ID + turn index for traceability. Auto-injected as context. |
| **Plan export** | `/plan` exports session as `.ella-plan-<id>.yaml` — importable for replay by Ella or other agents. |
| **Bridge mode** | Ella orchestrates OpenCode + Codex + Gemini-CLI simultaneously on the same project. Route/race/debate modes. |

### Bridge Mode
```bash
# Race mode — all three agents answer, Ella picks the best
ella --bridge "add comprehensive tests for the payments module" --bridge-mode race

# Debate mode — agents critique each other, Ella adjudicates
ella --bridge "refactor the database layer" --bridge-mode debate

# Route mode — Ella picks the best agent per task type
ella --bridge "explain this 10k line file" --bridge-mode route
```

---

## Monorepo Structure

```
ella/
  packages/
    shared/     # Theme, logger, ANSI palette
    core/       # Agent loop, providers, tools, sessions, undo, skills, plan, eval, pair
    tui/        # Ink/React TUI — animated mascot, chat, heatmap, tree, pair panes
    bridge/     # Coordinator + adapters (OpenCode, Gemini, Codex)
    mcp/        # MCP JSON-RPC client + manager
    cli/        # Entry point, slash commands, sub-commands
  scripts/
    build-all.mjs   # Sequential build: shared → core → mcp → bridge → tui → cli
```

---

## Installation

```bash
# Clone and build
git clone https://github.com/KedarMangalath/ella.git
cd ella
npm install
npm run build

# Run
node packages/cli/dist/main.js
# or alias it:
alias ella="node /path/to/ella/packages/cli/dist/main.js"
```

### Set your API key
```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
# or
export GEMINI_API_KEY=...
```

### Initialize a project
```bash
cd your-project
ella init
```

---

## Usage

```
ella [options] [prompt]
ella init                         set up .ella/ in current project
ella mcp list                     list configured MCP servers
ella mcp add <name> <cmd> [args]  add an MCP server
ella mcp remove <name>            remove an MCP server
ella config show                  show current config
ella config set <key> <value>     set a config value

Options:
  -p, --provider <name>    openai | anthropic | gemini | openrouter
  -m, --model <name>       model name (e.g. claude-opus-4-7, gpt-4o, gemini-2.5-pro)
  --mode <mode>            fast | balanced | deep | max
  --approval <mode>        ask | auto-edit | full-auto | read-only
  --bridge <prompt>        orchestrate opencode+codex+gemini on a prompt
  --bridge-mode <mode>     route | race | debate (default: race)
  --session <id>           resume a session by ID
```

### Interactive slash commands (inside TUI)

```
/help              show all commands
/clear             clear chat
/session list      list sessions
/fork [turn]       fork session at turn N
/tree              view session fork tree
/heatmap           view file touch heatmap
/pair <prompt>     run two providers side-by-side
/eval              replay session, measure drift
/budget <usd>      set cost budget (e.g. /budget 0.50)
/undo              undo last file write
/redo              redo last undone write
/remember <text>   add to project memory (with provenance)
/memory            show project memory
/skills            list loaded skills
/plan              export session as .ella-plan.yaml
/model <name>      switch model
/provider <name>   switch provider
/mode <mode>       change thinking mode
/bridge <task>     run bridge in TUI
/cost              show token + cost summary
/tag <label>       tag session
/exit              quit
```

---

## Skills

Create `.ella/skills/example.md`:

```markdown
---
name: strict-typescript
description: Enforce strict TS patterns
trigger: typescript
---

When writing TypeScript:
- Always use explicit return types
- Prefer `type` over `interface` for unions
- Never use `any` — use `unknown` and narrow
```

Skills are injected into the system prompt at session start. Project skills (`.ella/skills/`) override global ones (`~/.ella/skills/`).

---

## MCP Integration

```bash
# Add the filesystem MCP server
ella mcp add filesystem npx @modelcontextprotocol/server-filesystem /workspace

# Add the code-review-graph MCP server
ella mcp add code-review-graph node /path/to/graph-server/index.js

# List configured servers
ella mcp list
```

MCP tools are automatically discovered and made available to the agent.

---

## Session Time-Travel

```bash
# Inside TUI: fork session at turn 3 (rewind to that state)
/fork 3

# View the full branching tree
/tree

# Resume a fork from command line
ella --session <fork-id>
```

---

## Requirements

- Node.js ≥ 22
- npm ≥ 10
- At least one provider API key

---

## Supported Models

| Provider | Models |
|---|---|
| Anthropic | claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5 |
| OpenAI | o3, o4-mini, gpt-4o |
| Gemini | gemini-2.5-pro, gemini-2.5-flash |
| OpenRouter | Any model via openrouter.ai |

---

## License

MIT
