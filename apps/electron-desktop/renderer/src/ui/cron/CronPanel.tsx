import React from "react";
import { useSearchParams } from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import css from "./CronPanel.module.css";

type ChatEvent = {
  runId?: string;
  sessionKey?: string;
  state?: "delta" | "final" | "aborted" | "error";
  seq?: number;
  message?: unknown;
  errorMessage?: string;
};

type AgentEvent = {
  runId?: string;
  stream?: string;
  ts?: number;
  sessionKey?: string;
  data?: Record<string, unknown>;
};

type EventRow = {
  id: string;
  ts: number;
  event: string;
  agent: string;
  state: string;
  payload: unknown;
};

type ChatHistoryResult = {
  messages?: unknown[];
};

type TabKey = "events" | "agents" | "state";
type PanelPosition = "right" | "bottom";

const MAX_ROWS = 3000;

const panelStore: {
  rows: EventRow[];
  nextId: number;
  position: PanelPosition;
  live: boolean;
  loadedHistorySessions: Set<string>;
} = {
  rows: [],
  nextId: 0,
  position: "right",
  live: true,
  loadedHistorySessions: new Set<string>(),
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function shortText(value: unknown, max = 80): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) {
    return "";
  }
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractBlocks(message: unknown): Record<string, unknown>[] {
  const obj = asRecord(message);
  if (!obj) {
    return [];
  }
  const content = Array.isArray(obj.content) ? obj.content : null;
  const parts = Array.isArray(obj.parts) ? obj.parts : null;
  const source = content ?? parts;
  if (!source) {
    return [];
  }
  return source
    .map((block) => asRecord(block))
    .filter((block): block is Record<string, unknown> => Boolean(block));
}

function extractMessageText(message: unknown): string {
  const obj = asRecord(message);
  if (!obj) {
    return "";
  }
  if (typeof obj.text === "string") {
    return obj.text;
  }
  if (typeof obj.content === "string") {
    return obj.content;
  }
  const textParts = extractBlocks(message)
    .map((block) => {
      if (block.type === "text" && typeof block.text === "string") {
        return block.text;
      }
      return "";
    })
    .filter(Boolean);
  return textParts.join("\n");
}

function normalizeAgentName(payload: unknown): string {
  const obj = asRecord(payload);
  if (!obj) {
    return "orchestrator";
  }
  if (typeof obj.agent === "string" && obj.agent) {
    return obj.agent;
  }
  const data = asRecord(obj.data);
  if (data && typeof data.agent === "string" && data.agent) {
    return data.agent;
  }
  return "orchestrator";
}

function createRow(params: {
  ts: number;
  event: string;
  agent: string;
  state: string;
  payload: unknown;
  rowId: () => string;
}): EventRow {
  return {
    id: params.rowId(),
    ts: params.ts,
    event: params.event,
    agent: params.agent,
    state: params.state,
    payload: params.payload,
  };
}

function createRowsFromMessageParts(params: {
  message: unknown;
  ts: number;
  fallbackAgent: string;
  rowId: () => string;
}): EventRow[] {
  const rows: EventRow[] = [];
  for (const block of extractBlocks(params.message)) {
    const type = typeof block.type === "string" ? block.type : "";
    if (type === "data-agent-status") {
      const data = asRecord(block.data);
      const status = typeof data?.status === "string" ? data.status : "executing";
      const agent = typeof data?.agent === "string" ? data.agent : params.fallbackAgent;
      rows.push(
        createRow({
          ts: params.ts,
          event: `AGENT ${status.toUpperCase()} ${agent}`,
          agent,
          state: status,
          payload: block,
          rowId: params.rowId,
        })
      );
      continue;
    }

    if (type === "tool-call" || type === "tool_call" || type === "toolUse" || type === "tool_use") {
      const name = typeof block.name === "string" ? block.name : "tool";
      rows.push(
        createRow({
          ts: params.ts,
          event: `TOOL START ${name}`,
          agent: params.fallbackAgent,
          state: "start",
          payload: block,
          rowId: params.rowId,
        })
      );
      continue;
    }

    if (type === "text") {
      const text = shortText(block.text);
      if (text) {
        rows.push(
          createRow({
            ts: params.ts,
            event: `TEXT \"${text}\"`,
            agent: params.fallbackAgent,
            state: "text",
            payload: block,
            rowId: params.rowId,
          })
        );
      }
      continue;
    }

    if (type === "thinking") {
      rows.push(
        createRow({
          ts: params.ts,
          event: "THINKING",
          agent: params.fallbackAgent,
          state: "thinking",
          payload: block,
          rowId: params.rowId,
        })
      );
    }
  }
  return rows;
}

function makeEventRows(
  evtName: string,
  payload: unknown,
  now: number,
  rowId: () => string
): EventRow[] {
  const rows: EventRow[] = [];

  if (evtName === "chat") {
    const chat = payload as ChatEvent;
    const state = chat.state ?? "delta";
    const agent = normalizeAgentName(chat.message);

    if (state === "delta") {
      rows.push(
        createRow({
          ts: now,
          event: "STREAM START",
          agent,
          state: "streaming",
          payload,
          rowId,
        })
      );
      return rows;
    }

    if (state === "final") {
      rows.push(
        createRow({
          ts: now,
          event: "STREAM DONE",
          agent,
          state: "done",
          payload,
          rowId,
        })
      );
      rows.push(
        ...createRowsFromMessageParts({
          message: chat.message,
          ts: now,
          fallbackAgent: agent,
          rowId,
        })
      );
      const messageText = shortText(extractMessageText(chat.message));
      if (messageText) {
        rows.push(
          createRow({
            ts: now,
            event: `TEXT END \"${messageText}\"`,
            agent,
            state: "final",
            payload,
            rowId,
          })
        );
      }
      return rows;
    }

    if (state === "error") {
      rows.push(
        createRow({
          ts: now,
          event: "STREAM ERROR",
          agent: "orchestrator",
          state: "error",
          payload,
          rowId,
        })
      );
      return rows;
    }

    rows.push(
      createRow({
        ts: now,
        event: "STREAM ABORTED",
        agent: "orchestrator",
        state: "aborted",
        payload,
        rowId,
      })
    );
    return rows;
  }

  if (evtName === "agent") {
    const agentEvt = payload as AgentEvent;
    const stream = typeof agentEvt.stream === "string" ? agentEvt.stream : "agent";
    const data = asRecord(agentEvt.data) ?? {};
    const agent = normalizeAgentName(data);

    if (stream === "tool") {
      const phase = typeof data.phase === "string" ? data.phase : "update";
      const toolName = typeof data.name === "string" ? data.name : "tool";
      rows.push(
        createRow({
          ts: now,
          event:
            phase === "start"
              ? `TOOL START ${toolName}`
              : `TOOL ${phase.toUpperCase()} ${toolName}`,
          agent,
          state: phase,
          payload,
          rowId,
        })
      );
      return rows;
    }

    if (stream === "lifecycle") {
      const phase = typeof data.phase === "string" ? data.phase : "update";
      const eventLabel =
        phase === "start"
          ? `AGENT START ${agent}`
          : phase === "end"
            ? `AGENT FINISH ${agent}`
            : `AGENT ${phase.toUpperCase()} ${agent}`;
      rows.push(
        createRow({
          ts: now,
          event: eventLabel,
          agent,
          state: phase,
          payload,
          rowId,
        })
      );
      return rows;
    }

    if (typeof data.status === "string") {
      rows.push(
        createRow({
          ts: now,
          event: `AGENT ${data.status.toUpperCase()} ${agent}`,
          agent,
          state: data.status,
          payload,
          rowId,
        })
      );
      return rows;
    }

    rows.push(
      createRow({
        ts: now,
        event: `${stream.toUpperCase()} EVENT`,
        agent,
        state: typeof data.phase === "string" ? data.phase : stream,
        payload,
        rowId,
      })
    );
    return rows;
  }

  rows.push(
    createRow({
      ts: now,
      event: evtName.toUpperCase(),
      agent: normalizeAgentName(payload),
      state: "event",
      payload,
      rowId,
    })
  );
  return rows;
}

function mapHistoryToRows(messages: unknown[], rowId: () => string): EventRow[] {
  const rows: EventRow[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const raw = messages[i];
    const msg = asRecord(raw);
    if (!msg) {
      continue;
    }

    const ts =
      typeof msg.timestamp === "number" && Number.isFinite(msg.timestamp)
        ? Math.floor(msg.timestamp)
        : Date.now() - (messages.length - i) * 10;

    const role = typeof msg.role === "string" ? msg.role : "unknown";
    const agent = normalizeAgentName(msg);

    if (role === "user") {
      const text = shortText(extractMessageText(msg));
      rows.push(
        createRow({
          ts,
          event: text ? `TEXT \"${text}\"` : "USER MESSAGE",
          agent: "user",
          state: "user",
          payload: msg,
          rowId,
        })
      );
      continue;
    }

    if (role === "toolResult" || role === "tool_result") {
      const toolName = typeof msg.toolName === "string" ? msg.toolName : "tool";
      rows.push(
        createRow({
          ts,
          event: `TOOL RESULT ${toolName}`,
          agent,
          state: typeof msg.details === "object" ? "result" : "result",
          payload: msg,
          rowId,
        })
      );
      continue;
    }

    if (role === "assistant") {
      const text = shortText(extractMessageText(msg));
      rows.push(
        createRow({
          ts,
          event: text ? `TEXT END \"${text}\"` : "ASSISTANT MESSAGE",
          agent,
          state: "final",
          payload: msg,
          rowId,
        })
      );
      rows.push(...createRowsFromMessageParts({ message: msg, ts, fallbackAgent: agent, rowId }));
      continue;
    }

    rows.push(
      createRow({
        ts,
        event: role ? role.toUpperCase() : "MESSAGE",
        agent,
        state: "history",
        payload: msg,
        rowId,
      })
    );
  }
  return rows;
}

function PanelIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M5 6h6M5 8h6M5 10h4" />
    </svg>
  );
}

function BrandMarkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M5.2 18.2 9.35 6h2.45L7.65 18.2z" fill="currentColor" />
      <path d="M16.35 18.2 12.2 6h2.45l4.15 12.2z" fill="currentColor" />
      <path d="M10.2 18.2 12 12.9l1.8 5.3z" fill="#0a0b0f" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}

export function CronToggleButton({
  open,
  onClick,
  compact = false,
  className = "",
  title = "Open workflows",
  ariaLabel = "Toggle workflows",
}: {
  open: boolean;
  onClick: () => void;
  compact?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  const classes = [
    css.CronToggle,
    compact ? css.CronToggleCompact : "",
    open ? css.CronToggleOpen : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
    >
      <BrandMarkIcon size={compact ? 12 : 18} />
    </button>
  );
}

export function CronPanel({ onClose }: { onClose: () => void }) {
  const { connected, onEvent, request } = useGatewayRpc();
  const [searchParams] = useSearchParams();
  const [live, setLive] = React.useState(panelStore.live);
  const [tab, setTab] = React.useState<TabKey>("events");
  const [position, setPosition] = React.useState<PanelPosition>(panelStore.position);
  const [rows, setRows] = React.useState<EventRow[]>(panelStore.rows);
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<EventRow | null>(null);

  const makeId = React.useCallback(() => {
    panelStore.nextId += 1;
    return `evt-${panelStore.nextId}`;
  }, []);

  const pushRows = React.useCallback((incoming: EventRow[]) => {
    if (incoming.length === 0) {
      return;
    }
    setRows((prev) => {
      const next = [...incoming, ...prev].slice(0, MAX_ROWS);
      panelStore.rows = next;
      return next;
    });
  }, []);

  React.useEffect(() => {
    panelStore.live = live;
  }, [live]);

  React.useEffect(() => {
    panelStore.position = position;
  }, [position]);

  React.useEffect(() => {
    if (!connected || !live) {
      return;
    }
    return onEvent((evt) => {
      const now = Date.now();
      const newRows = makeEventRows(evt.event, evt.payload, now, makeId);
      pushRows(newRows);
    });
  }, [connected, live, onEvent, makeId, pushRows]);

  React.useEffect(() => {
    const sessionKey = searchParams.get("session")?.trim();
    if (!sessionKey || panelStore.loadedHistorySessions.has(sessionKey)) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const history = await request<ChatHistoryResult>("chat.history", {
          sessionKey,
          limit: 400,
        });
        if (cancelled) {
          return;
        }
        const historyMessages = Array.isArray(history.messages) ? history.messages : [];
        const historyRows = mapHistoryToRows(historyMessages, makeId);
        pushRows(historyRows.reverse());
        panelStore.loadedHistorySessions.add(sessionKey);
      } catch {
        // Keep panel resilient if history backfill fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, request, makeId, pushRows]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return rows;
    }
    return rows.filter((row) => {
      return (
        row.event.toLowerCase().includes(q) ||
        row.agent.toLowerCase().includes(q) ||
        row.state.toLowerCase().includes(q) ||
        toJson(row.payload).toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  const agentStats = React.useMemo(() => {
    const map = new Map<string, { count: number; firstTs: number; lastTs: number }>();
    for (const row of rows) {
      const found = map.get(row.agent);
      if (!found) {
        map.set(row.agent, { count: 1, firstTs: row.ts, lastTs: row.ts });
      } else {
        found.count += 1;
        found.firstTs = Math.min(found.firstTs, row.ts);
        found.lastTs = Math.max(found.lastTs, row.ts);
      }
    }
    return [...map.entries()].map(([name, stat]) => ({
      name,
      count: stat.count,
      durationMs: Math.max(0, stat.lastTs - stat.firstTs),
    }));
  }, [rows]);

  return (
    <>
      <aside
        className={`${css.CronPanel} ${position === "bottom" ? css.CronPanelBottom : css.CronPanelRight}`}
        aria-label="Workflows panel"
      >
        <div className={css.CronPanelHeader}>
          <input
            className={css.SearchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`${filtered.length} total events found...`}
          />
          <button
            type="button"
            className={css.TopAction}
            onClick={() => setLive((v) => !v)}
            aria-pressed={live}
          >
            {live ? "II Live" : "▶ Live"}
          </button>
          <button
            type="button"
            className={css.TopAction}
            onClick={() => {
              setRows([]);
              panelStore.rows = [];
              panelStore.loadedHistorySessions.clear();
            }}
          >
            × clear
          </button>
          <button type="button" className={css.TopAction}>
            <PanelIcon />
          </button>
          <button
            type="button"
            className={css.TopAction}
            onClick={() => setPosition((p) => (p === "right" ? "bottom" : "right"))}
            title={position === "right" ? "Move to bottom" : "Move to side"}
            aria-label={position === "right" ? "Move panel to bottom" : "Move panel to side"}
          >
            {position === "right" ? "▤" : "▥"}
          </button>
          <button type="button" className={css.CronPanelClose} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className={css.Tabs}>
          <button
            type="button"
            className={`${css.Tab} ${tab === "events" ? css.TabActive : ""}`}
            onClick={() => setTab("events")}
          >
            Events
          </button>
          <button
            type="button"
            className={`${css.Tab} ${tab === "agents" ? css.TabActive : ""}`}
            onClick={() => setTab("agents")}
          >
            Agents
          </button>
          <button
            type="button"
            className={`${css.Tab} ${tab === "state" ? css.TabActive : ""}`}
            onClick={() => setTab("state")}
          >
            State
          </button>
        </div>

        {tab === "events" ? (
          <div className={css.TableWrap}>
            <div className={css.TableHead}>
              <span>Events</span>
              <span>Agents</span>
              <span>State</span>
              <span />
            </div>
            <div className={css.TableBody}>
              {filtered.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`${css.TableRow} ${selected?.id === row.id ? css.TableRowSelected : ""}`}
                  onClick={() => {
                    setSelected(row);
                    setTab("state");
                  }}
                >
                  <span className={css.EventText}>{row.event}</span>
                  <span>{row.agent}</span>
                  <span>{row.state}</span>
                  <span className={css.EventTime}>{formatTime(row.ts)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "agents" ? (
          <div className={css.AgentCanvas}>
            {agentStats.length === 0 ? (
              <div className={css.Empty}>No agents yet</div>
            ) : (
              agentStats.map((agent) => (
                <div key={agent.name} className={css.AgentCard}>
                  <div className={css.AgentLabel}>AGENT</div>
                  <div className={css.AgentName}>{agent.name} ▶</div>
                  <div className={css.AgentMeta}>{agent.count} events</div>
                  <div className={css.AgentDuration}>
                    Duration <span>{(agent.durationMs / 1000).toFixed(2)}s</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "state" ? (
          <div className={css.StatePane}>
            <pre>{selected ? toJson(selected.payload) : "Select an event in the Events tab."}</pre>
          </div>
        ) : null}

        <div className={css.Footer}>
          <span>{filtered.length} events</span>
          <span>{agentStats.length} agents</span>
          <span>{live ? "live" : "paused"}</span>
        </div>
      </aside>
    </>
  );
}
