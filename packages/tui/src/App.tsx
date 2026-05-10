import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Mascot, type MascotState } from "./components/Mascot.js";
import { ChatPane, type ChatEntry } from "./components/ChatPane.js";
import { InputBar } from "./components/InputBar.js";
import { StatusBar } from "./components/StatusBar.js";
import { TodoStrip, type TodoItem } from "./components/TodoStrip.js";
import { HeatmapPane, type HeatEntry } from "./components/HeatmapPane.js";
import { SessionTreePane, type TreeNode } from "./components/SessionTreePane.js";
import { PairPane, type PairEntry } from "./components/PairPane.js";
import { ToolApproval, type ToolRisk } from "./components/ToolApproval.js";
import { DiffViewer } from "./components/DiffViewer.js";
import { colors } from "./theme.js";

export type ActiveView = "chat" | "heatmap" | "tree" | "pair";

export interface AppConfig {
  provider: string;
  model: string;
  thinkingMode: string;
  cwd: string;
  sessionId?: string;
}

export interface EllaEvent {
  kind: "token" | "thinking" | "tool_start" | "tool_end" | "done" | "error" | "cost" | "budget_warn" | "budget_exceeded";
  text?: string;
  toolName?: string;
  toolResult?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

type ChatAction =
  | { type: "add"; entry: ChatEntry }
  | { type: "stream"; text: string }
  | { type: "streamEnd" }
  | { type: "clear" };

interface ChatState {
  entries: ChatEntry[];
  streaming: string | undefined;
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "add":
      return { ...state, entries: [...state.entries, action.entry], streaming: undefined };
    case "stream":
      return { ...state, streaming: (state.streaming ?? "") + action.text };
    case "streamEnd": {
      if (!state.streaming) return state;
      const entry: ChatEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: "assistant",
        text: state.streaming,
        timestamp: Date.now(),
      };
      return { entries: [...state.entries, entry], streaming: undefined };
    }
    case "clear":
      return { entries: [], streaming: undefined };
  }
}

let counter = 0;
function nextId(): string { return `e${++counter}`; }

interface ApprovalRequest {
  reason: string;
  risk: ToolRisk;
  preview?: string;
}

export interface AppHandlers {
  dispatch: (action: ChatAction) => void;
  setMascot: (state: MascotState, label: string) => void;
  setTokens: (input: number, output: number, cost: number) => void;
  setTodos: (todos: TodoItem[]) => void;
  setBusy: (busy: boolean) => void;
  setView: (view: ActiveView) => void;
  setHeatmap: (entries: HeatEntry[]) => void;
  setSessionTree: (roots: TreeNode[], activeId?: string) => void;
  addPairEntry: (entry: PairEntry) => void;
  setBudgetWarning: (msg: string) => void;
  requestApproval: (req: ApprovalRequest, resolve: (ok: boolean) => void) => void;
}

export interface AppProps {
  config: AppConfig;
  onPrompt: (prompt: string) => Promise<void>;
  onReady?: (handlers: AppHandlers) => void;
  initialEntries?: ChatEntry[];
}

const VIEWS: ActiveView[] = ["chat", "heatmap", "tree", "pair"];
const VIEW_LABELS: Record<ActiveView, string> = {
  chat: "^1 Chat",
  heatmap: "^2 Heatmap",
  tree: "^3 Tree",
  pair: "^4 Pair",
};

export function App({ config, onPrompt, onReady, initialEntries }: AppProps): React.ReactElement {
  useApp();

  const [mascotState, setMascotState] = useState<MascotState>("idle");
  const [mascotLabel, setMascotLabel] = useState("ready");
  const [busy, setBusy] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [costUsd, setCostUsd] = useState(0);
  const [chat, dispatchChat] = useReducer(chatReducer, {
    entries: initialEntries ?? [],
    streaming: undefined,
  });
  const [activeView, setActiveView] = useState<ActiveView>("chat");
  const [heatEntries, setHeatEntries] = useState<HeatEntry[]>([]);
  const [treeRoots, setTreeRoots] = useState<TreeNode[]>([]);
  const [treeActiveId, setTreeActiveId] = useState<string | undefined>(config.sessionId);
  const [pairEntries, setPairEntries] = useState<PairEntry[]>([]);
  const [budgetWarning, setBudgetWarning] = useState<string | null>(null);
  const [approvalReq, setApprovalReq] = useState<ApprovalRequest | null>(null);
  const [activeDiff, setActiveDiff] = useState<{ title?: string; diff: string } | null>(null);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const approvalResolver = useRef<((ok: boolean) => void) | null>(null);

  useInput((input, key) => {
    if (key.ctrl && input === "1") setActiveView("chat");
    if (key.ctrl && input === "2") setActiveView("heatmap");
    if (key.ctrl && input === "3") setActiveView("tree");
    if (key.ctrl && input === "4") setActiveView("pair");
    // Dismiss diff overlay
    if (activeDiff && key.escape) setActiveDiff(null);
  });

  useEffect(() => {
    if (!onReady) return;
    onReady({
      dispatch: dispatchChat,
      setMascot: (s, l) => { setMascotState(s); setMascotLabel(l); },
      setTokens: (i, o, c) => {
        setInputTokens((x) => x + i);
        setOutputTokens((x) => x + o);
        setCostUsd((x) => x + c);
      },
      setTodos,
      setBusy,
      setView: setActiveView,
      setHeatmap: setHeatEntries,
      setSessionTree: (roots, activeId) => {
        setTreeRoots(roots);
        if (activeId) setTreeActiveId(activeId);
      },
      addPairEntry: (entry) => setPairEntries((prev) => [...prev, entry]),
      setBudgetWarning: (msg) => {
        setBudgetWarning(msg);
        setTimeout(() => setBudgetWarning(null), 5000);
      },
      requestApproval: (req, resolve) => {
        approvalResolver.current = resolve;
        setApprovalReq(req);
      },
    });
  }, [onReady]);

  const handlePrompt = useCallback(async (prompt: string) => {
    if (busy) return;

    setInputHistory((h) => {
      if (h.at(-1) === prompt) return h;
      return [...h, prompt].slice(-200);
    });

    dispatchChat({ type: "add", entry: {
      id: nextId(),
      role: "user",
      text: prompt,
      timestamp: Date.now(),
    }});

    setBusy(true);
    setMascotState("think");
    setMascotLabel("thinking…");
    if (activeView !== "chat") setActiveView("chat");

    try {
      await onPrompt(prompt);
      setMascotState("celebrate");
      setMascotLabel("done!");
      // Terminal bell on task complete
      process.stdout.write("\x07");
      setTimeout(() => { setMascotState("idle"); setMascotLabel("ready"); }, 2000);
    } catch (err) {
      dispatchChat({ type: "add", entry: {
        id: nextId(),
        role: "error",
        text: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      }});
      setMascotState("error");
      setMascotLabel("error");
      setTimeout(() => { setMascotState("idle"); setMascotLabel("ready"); }, 3000);
    } finally {
      setBusy(false);
      dispatchChat({ type: "streamEnd" });
    }
  }, [busy, onPrompt, activeView]);

  const handleApproval = useCallback((ok: boolean) => {
    approvalResolver.current?.(ok);
    approvalResolver.current = null;
    setApprovalReq(null);
  }, []);

  const rows = process.stdout.rows ?? 40;

  return (
    <Box flexDirection="column" height={rows}>
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderColor={colors.orchid} justifyContent="space-between">
        <Text color={colors.orchid} bold>{"✦ ELLA"}</Text>
        <Box flexDirection="row" gap={2}>
          {VIEWS.map((v) => (
            <Text key={v} color={activeView === v ? colors.orchid : colors.dim} bold={activeView === v}>
              {VIEW_LABELS[v]}
            </Text>
          ))}
        </Box>
        <Text color={colors.dim}>ctrl+c exit  │  /help</Text>
      </Box>

      {/* Budget warning */}
      {budgetWarning && (
        <Box paddingX={2} borderStyle="single" borderColor="yellow">
          <Text color="yellow" bold>⚠ {budgetWarning}</Text>
        </Box>
      )}

      {/* Diff overlay */}
      {activeDiff && (
        <Box flexDirection="column" borderStyle="single" borderColor={colors.orchid} paddingX={1}>
          <DiffViewer diff={activeDiff.diff} title={activeDiff.title} maxLines={20} />
          <Text color={colors.dim}>Esc to dismiss</Text>
        </Box>
      )}

      {/* Tool approval overlay */}
      {approvalReq && (
        <ToolApproval
          reason={approvalReq.reason}
          risk={approvalReq.risk}
          preview={approvalReq.preview}
          onRespond={handleApproval}
        />
      )}

      {/* Main area */}
      <Box flexGrow={1} flexDirection="row" overflow="hidden">
        {/* Mascot sidebar */}
        <Box
          flexDirection="column"
          width={14}
          paddingTop={1}
          paddingLeft={1}
          borderStyle="single"
          borderColor={colors.dim}
        >
          <Mascot state={mascotState} label="" />
          <Box marginTop={1} flexDirection="column">
            <Text color={colors.dim} dimColor>{mascotLabel}</Text>
          </Box>
        </Box>

        {/* Content pane */}
        <Box flexGrow={1} flexDirection="column" overflow="hidden">
          {activeView === "chat" && (
            <ChatPane
              entries={chat.entries}
              streaming={chat.streaming}
              onShowDiff={(diff, title) => setActiveDiff({ diff, title })}
            />
          )}
          {activeView === "heatmap" && <HeatmapPane entries={heatEntries} />}
          {activeView === "tree"    && <SessionTreePane roots={treeRoots} activeId={treeActiveId} />}
          {activeView === "pair"    && <PairPane entries={pairEntries} />}
        </Box>
      </Box>

      {/* Todos */}
      {todos.length > 0 && <TodoStrip todos={todos} />}

      {/* Input */}
      <InputBar disabled={busy || !!approvalReq} onSubmit={handlePrompt} history={inputHistory} />

      {/* Status bar */}
      <StatusBar
        provider={config.provider}
        model={config.model}
        mode={config.thinkingMode}
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        costUsd={costUsd}
        cwd={config.cwd}
        sessionId={config.sessionId}
      />
    </Box>
  );
}
