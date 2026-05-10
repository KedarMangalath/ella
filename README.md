
```
@@@@@@@@@@@@@@@@@@@@@@@@@@#+::::::=@@@@@@@@@@@@@@@
@@@@@@@@@@@@@@@@@@@@@#++**:.:=-.::..#@@@@@@@@@@@@@
@@@@@@@@@@@@@@@@@@@+..::....::...  .%*@@@@@@@@@@@@
@@@@@@@@@@@@@@@@@#:---. ...:-:....-%%@@@@@@@@@@@@@
@@@@@@@@@@@@@@@@-..:---*%%%+::..:.:#@@%%%@@@@@@@@@
@@@@@@@@@@#@@@@@@..::-*%%+=#*+.....+@@%%%@@@@@@@@@
@@@@@@@@@@*%%@@+.:-.-=+#%#*= ++:+#:#@%#@@@@@%*@@@@
@@@@@@@@@@@@@@@#+:...===%###**::-:%@@+#@@%@+%%@@@@
@@@@@@%%@@@@@@@@@+::.-*##*##++*=:+@%**%@@@@@@@@@@@
@@@@@@-::::--+@@=%=:@@- . -:-::.#@@%*##@@@@@@@@@@@
@@@@@@@:::-::-#@@@%+*@-.::..::::.@=+:@@@@%@@%@@@@@
@@@@@@@%-::-::=%@@@@%-::--:..:=:-:..*@@@@@@@@@@@@@
@@@@@@%@*--+=-:*@@@#....:-:.........@@#@@@@@@@@@@@
@@@@@@@@@@@%*+=-:...::..:=--.#....-%@++===+++%@@@@
@@@@@@@@@@@@@@@*=...-.:.::=--:-@@@@@@=++=====#@@@@
@@@@@@@@@@@%@@@@@@+ .....:.:::.-%@@@========*@@@@@
@@@@@@@@##@%%+@@@@=... ..:....:-%@@@@@@@@@%%%@@@@@
@@@@@@@@@@@@@@@@@@@:... .:::-:#@@@%@@@@@@@@@@@@@@@
@@@@@@@@@@@@@@@@@@@=....#:::..#*@@@@@@@@@@@@@@@@@@
```


# ELLA

**ella** is an agentic coding assistant that runs in your terminal.

---

## Install

```sh
git clone https://github.com/KedarMangalath/ella.git
cd ella
npm install
npm run build
```

Set your API key:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
```

Run:

```sh
node packages/cli/dist/main.js
```

Or alias it:

```sh
alias ella="node /path/to/ella/packages/cli/dist/main.js"
```

---

## Usage

```
ella                          interactive TUI
ella "fix the failing tests"  one-shot headless
ella init                     set up project
ella mcp add <n> <cmd>        add MCP server
ella config set <key> <val>   update config
```

Providers: `anthropic` · `openai` · `gemini` · `openrouter`

Switch at any time:

```sh
ella --provider openai --model gpt-4o
ella --provider gemini --model gemini-2.5-pro
```

---

## TUI

Four panels — switch with **Ctrl+1–4**:

| Panel | Key | What it shows |
|---|---|---|
| Chat | Ctrl+1 | conversation + streaming output |
| Heatmap | Ctrl+2 | which files ella has been writing |
| Tree | Ctrl+3 | session fork tree |
| Pair | Ctrl+4 | two providers, same prompt, side by side |

---

## Slash commands

```
/help              commands
/clear             clear chat
/model <name>      switch model
/provider <name>   switch provider
/mode <mode>       fast · balanced · deep · max
/fork [turn]       fork session at turn N
/tree              session fork tree
/heatmap           file touch heatmap
/pair <prompt>     two providers in parallel
/eval              replay session, score drift
/budget <usd>      cost cap — warns at 80%, stops at 100%
/undo              undo last file write
/redo              redo it
/remember <text>   save to project memory
/memory            show project memory
/skills            list loaded skills
/plugins           list loaded plugins
/mcp               list connected MCP tools
/plan              export .ella-plan.yaml
/cost              token + cost summary
/session list      list sessions
/bridge <task>     orchestrate external agents
/exit              quit
```

---

## Skills

Drop a `.md` file in `.ella/skills/`:

```markdown
---
name: no-any
description: never use any in TypeScript
---

Never use `any`. Use `unknown` and narrow.
Always provide explicit return types.
```

Skills are injected into the system prompt at session start.
Project skills (`.ella/skills/`) override global ones (`~/.ella/skills/`).

---

## MCP

```sh
ella mcp add filesystem npx @modelcontextprotocol/server-filesystem /workspace
ella mcp list
ella mcp remove filesystem
```

Discovered tools are available to the agent immediately.

---

## Bridge

Ella can orchestrate multiple external agents on the same project simultaneously.

```sh
ella --bridge "add tests for the auth module" --bridge-mode race
ella --bridge "refactor the db layer"         --bridge-mode debate
ella --bridge "explain this codebase"         --bridge-mode route
```

Modes:

- **route** — picks the best agent for the task type
- **race** — all agents answer, ella picks the winner
- **debate** — agents critique each other, ella adjudicates

---

## Plugins

Drop a `.js` file in `.ella/plugins/`:

```js
export default {
  name: "logger",
  async afterPrompt(prompt, response) {
    console.error(`[ella] prompt: ${prompt.slice(0, 80)}`);
  },
};
```

Hooks: `beforePrompt` · `afterPrompt` · `beforeTool` · `afterTool` · `onEvent`

---

## Sessions

Sessions are stored in `~/.ella/sessions/`. Every session is resumable:

```sh
ella --session <id>
```

Fork any session at any turn:

```
/fork 3
```

Then view the full branching tree with `/tree` or **Ctrl+3**.

---

## Config

```sh
ella config show
ella config set defaultProvider openai
ella config set providers.anthropic.apiKey sk-ant-...
```

Config is stored at `~/.ella/config.json`.

---

## Requirements

- Node.js ≥ 22

---

## License

MIT
