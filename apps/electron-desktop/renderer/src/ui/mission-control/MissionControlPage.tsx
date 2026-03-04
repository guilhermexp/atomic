import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import type {
  ConfigGetResponse,
  ModelsListResponse,
  SessionEntry,
  SessionsListResponse,
} from "@gateway/types";
import type { ChannelsStatusResult } from "../onboarding/hooks/types";
import { addToastError } from "@shared/toast";
import { routes } from "../app/routes";
import { CronJobModal, type CronJobFormData } from "./CronJobModal";
import { BrainTab } from "./BrainTab";
import css from "./MissionControlPage.module.css";

/* ── types ── */

type DecisionStatus = "pending" | "approved" | "rejected";
type JobStatus = "healthy" | "warning" | "paused";
type SystemStatus = "online" | "warning" | "offline";

type Decision = {
  id: string;
  title: string;
  impact: "low" | "medium" | "high";
  status: DecisionStatus;
};
type CronJob = {
  id: string;
  name: string;
  schedule: string;
  isolatedSession: boolean;
  status: JobStatus;
  nextRun: string;
  lastRun?: string;
  gatewayJobId?: string;
  failureCount?: number;
  lastFailure?: string;
};
type SystemCard = {
  id: string;
  name: string;
  status: SystemStatus;
  health: number;
  detail: string;
};
type Project = {
  id: string;
  name: string;
  status: "active" | "planning" | "paused";
  risk: "low" | "medium" | "high";
  updated: string;
};
type OrgDivision = { id: string; division: string; lead: string; agents: string[] };
type Integration = {
  id: string;
  name: string;
  status: "connected" | "pending" | "disabled";
  channel: string;
  lastActivity?: string;
  messagesCount24h?: number;
  errorsCount24h?: number;
};
type SponsorHub = {
  rateCardReady: boolean;
  mediaKitReady: boolean;
  pitchTemplates: number;
  outreachLeads: number;
};
type ContentLibrary = { items: number; drafts: number; published: number };
type RunDispatch = {
  id: string;
  jobId: string;
  jobName: string;
  sessionKey: string;
  requestedAt: string;
  status: "dispatched" | "running" | "completed" | "failed" | "unknown";
};

type EventSeverity = "info" | "success" | "warning" | "error";
type LiveEvent = {
  id: string;
  at: string;
  event: string;
  payload: unknown;
  severity: EventSeverity;
  sessionKey?: string;
  runId?: string;
};
type BrainDoc = { id: string; title: string; content: string };
type BackupSnapshot = { id: string; label: string; createdAt: string; restoreChecked: boolean };
type IntegrationError = { id: string; channel: string; message: string; timestamp: string };

type MissionControlData = {
  decisions: Decision[];
  cronJobs: CronJob[];
  systems: SystemCard[];
  projects: Project[];
  orgDivisions: OrgDivision[];
  integrations: Integration[];
  overnightTimeline: string[];
  sponsorHub: SponsorHub;
  contentLibrary: ContentLibrary;
  runDispatches: RunDispatch[];
  brainDocs: BrainDoc[];
  fileTree: string[];
  backupSnapshots: BackupSnapshot[];
  integrationErrors: IntegrationError[];
};

const AUTO_REFRESH_MS = 15000;
const DEBOUNCE_RELOAD_MS = 800;

const DEFAULT_DATA: MissionControlData = {
  decisions: [],
  cronJobs: [],
  systems: [],
  projects: [],
  orgDivisions: [],
  integrations: [],
  overnightTimeline: [],
  sponsorHub: { rateCardReady: false, mediaKitReady: false, pitchTemplates: 0, outreachLeads: 0 },
  contentLibrary: { items: 0, drafts: 0, published: 0 },
  runDispatches: [],
  brainDocs: [],
  fileTree: [],
  backupSnapshots: [],
  integrationErrors: [],
};

type ModelShare = { id: string; share: number };
type ActiveTab = "operations" | "brain" | "eventos";

type GatewayCronSchedule =
  | { kind: "cron"; expr?: string }
  | { kind: "every"; everyMs?: number }
  | { kind: "at"; at?: string };

type GatewayCronJob = {
  id: string;
  name: string;
  enabled: boolean;
  sessionTarget?: "main" | "isolated";
  schedule: GatewayCronSchedule;
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastError?: string;
  };
};

type CronListResponse = { jobs?: GatewayCronJob[] };

type CronRunEntry = {
  ts: number;
  jobId: string;
  jobName?: string;
  status?: "ok" | "error" | "skipped";
  summary?: string;
  sessionKey?: string;
};

type CronRunsPageResponse = { entries?: CronRunEntry[] };

function classifyEventSeverity(event: string, payload: unknown): EventSeverity {
  if (event.includes("error") || event.includes("fail")) return "error";
  if (event.includes("warn")) return "warning";
  if (event.includes("complete") || event.includes("success") || event.includes("connected"))
    return "success";
  const p = (payload ?? {}) as Record<string, unknown>;
  if (p.state === "error" || p.error) return "error";
  if (p.state === "final") return "success";
  return "info";
}

function nowLabel() {
  return new Date().toLocaleTimeString();
}
function newSessionKey(): string {
  return `agent:main:main:${crypto.randomUUID().slice(0, 8)}`;
}

function deriveIntegrationsFromConfig(
  config: Record<string, unknown> | undefined,
  statusProbe?: ChannelsStatusResult
): Integration[] {
  const anyCfg = (config ?? {}) as Record<string, unknown>;
  const channels = (anyCfg.channels ?? {}) as Record<string, unknown>;
  const channelAccounts = (statusProbe?.channelAccounts ?? {}) as Record<
    string,
    Array<{ configured?: boolean; lastError?: string }>
  >;
  const seeds = [
    { key: "webchat", name: "Webchat", channel: "webchat" },
    { key: "telegram", name: "Telegram", channel: "telegram" },
    { key: "discord", name: "Discord", channel: "discord" },
    { key: "slack", name: "Slack", channel: "slack" },
    { key: "signal", name: "Signal", channel: "signal" },
  ];
  return seeds.map((s, idx) => {
    const entry = (channels[s.key] ?? {}) as Record<string, unknown>;
    const enabled = entry.enabled === true;
    const accountRows = Array.isArray(channelAccounts[s.key]) ? channelAccounts[s.key] : [];
    const configuredCount = accountRows.filter((a) => a.configured).length;
    const errorCount = accountRows.filter((a) => !!a.lastError).length;
    const status: Integration["status"] = !enabled
      ? "disabled"
      : configuredCount > 0
        ? "connected"
        : "pending";
    return {
      id: `int-auto-${idx + 1}`,
      name: s.name,
      channel: s.channel,
      status,
      errorsCount24h: errorCount > 0 ? errorCount : undefined,
    } as Integration;
  });
}

/** Derive backup snapshots from config-level backup state if available. */
function deriveBackupSnapshots(
  config: Record<string, unknown> | undefined,
  existing: BackupSnapshot[]
): BackupSnapshot[] {
  const anyCfg = (config ?? {}) as Record<string, unknown>;
  const backup = (anyCfg.backup ?? {}) as Record<string, unknown>;
  const lastBackupAt = typeof backup.lastBackupAt === "string" ? backup.lastBackupAt : null;
  const lastRestoreAt = typeof backup.lastRestoreAt === "string" ? backup.lastRestoreAt : null;
  const existingIds = new Set(existing.map((s) => s.id));
  const derived: BackupSnapshot[] = [...existing];

  if (lastBackupAt) {
    const syntheticId = `backup-auto-${lastBackupAt}`;
    if (!existingIds.has(syntheticId)) {
      derived.unshift({
        id: syntheticId,
        label: `Backup automático ${lastBackupAt}`,
        createdAt: lastBackupAt,
        restoreChecked: !!lastRestoreAt,
      });
    }
  }
  return derived.slice(0, 30);
}

function readMissionControl(
  config: Record<string, unknown> | undefined,
  channelsStatus?: ChannelsStatusResult
): MissionControlData {
  const anyCfg = (config ?? {}) as Record<string, unknown>;
  const incoming = (anyCfg.missionControl ?? {}) as Partial<MissionControlData>;
  const autoIntegrations = deriveIntegrationsFromConfig(config, channelsStatus);
  const persistedSnapshots = Array.isArray(incoming.backupSnapshots)
    ? incoming.backupSnapshots
    : DEFAULT_DATA.backupSnapshots;
  return {
    ...DEFAULT_DATA,
    ...incoming,
    decisions: Array.isArray(incoming.decisions) ? incoming.decisions : DEFAULT_DATA.decisions,
    cronJobs: Array.isArray(incoming.cronJobs) ? incoming.cronJobs : DEFAULT_DATA.cronJobs,
    systems: Array.isArray(incoming.systems) ? incoming.systems : DEFAULT_DATA.systems,
    projects: Array.isArray(incoming.projects) ? incoming.projects : DEFAULT_DATA.projects,
    orgDivisions: Array.isArray(incoming.orgDivisions)
      ? incoming.orgDivisions
      : DEFAULT_DATA.orgDivisions,
    integrations:
      Array.isArray(incoming.integrations) && incoming.integrations.length > 0
        ? incoming.integrations
        : autoIntegrations.length > 0
          ? autoIntegrations
          : DEFAULT_DATA.integrations,
    overnightTimeline: Array.isArray(incoming.overnightTimeline)
      ? incoming.overnightTimeline
      : DEFAULT_DATA.overnightTimeline,
    sponsorHub: { ...DEFAULT_DATA.sponsorHub, ...(incoming.sponsorHub ?? {}) },
    contentLibrary: { ...DEFAULT_DATA.contentLibrary, ...(incoming.contentLibrary ?? {}) },
    runDispatches: Array.isArray(incoming.runDispatches)
      ? (incoming.runDispatches as RunDispatch[])
      : DEFAULT_DATA.runDispatches,
    brainDocs: Array.isArray(incoming.brainDocs) ? incoming.brainDocs : DEFAULT_DATA.brainDocs,
    fileTree: Array.isArray(incoming.fileTree) ? incoming.fileTree : DEFAULT_DATA.fileTree,
    backupSnapshots: deriveBackupSnapshots(config, persistedSnapshots),
    integrationErrors: Array.isArray(incoming.integrationErrors)
      ? incoming.integrationErrors
      : DEFAULT_DATA.integrationErrors,
  };
}

/** Derive file tree from session keys (workspace paths). */
function deriveFileTree(sessions: SessionEntry[], existing: string[]): string[] {
  const set = new Set(existing);
  for (const s of sessions) {
    // Session keys like "agent:main:workspace:/path/to/dir" carry workspace paths
    const parts = s.key.split(":");
    if (parts.length >= 4 && parts[2] !== "main") {
      set.add(parts.slice(2).join(":"));
    }
    // Also derive from session title when it looks like a file path
    if (s.title && (s.title.startsWith("/") || s.title.startsWith("./"))) {
      set.add(s.title);
    }
  }
  return Array.from(set).sort().slice(0, 200);
}

/** Derive projects from active sessions grouped by prefix. */
function formatMs(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return "--";
  return new Date(ms).toLocaleString();
}

function scheduleToLabel(schedule: GatewayCronSchedule): string {
  if (schedule.kind === "cron") return schedule.expr ?? "cron";
  if (schedule.kind === "every") return `a cada ${schedule.everyMs ?? 0}ms`;
  if (schedule.kind === "at") return schedule.at ?? "at";
  return "--";
}

function deriveCronInsights(entries: CronRunEntry[]): {
  failuresByJob: Record<string, number>;
  lastFailureByJob: Record<string, string>;
} {
  const failuresByJob: Record<string, number> = {};
  const lastFailureByJob: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.status !== "error") continue;
    failuresByJob[entry.jobId] = (failuresByJob[entry.jobId] ?? 0) + 1;
    if (!lastFailureByJob[entry.jobId]) {
      lastFailureByJob[entry.jobId] = entry.summary ?? "Falha sem resumo";
    }
  }
  return { failuresByJob, lastFailureByJob };
}

function deriveCronJobsFromGateway(
  gatewayJobs: GatewayCronJob[],
  existing: CronJob[],
  insights?: { failuresByJob: Record<string, number>; lastFailureByJob: Record<string, string> }
): CronJob[] {
  const manualOnly = existing.filter((j) => !j.gatewayJobId);
  const fromGateway: CronJob[] = gatewayJobs.map((job) => ({
    id: `gw:${job.id}`,
    gatewayJobId: job.id,
    name: job.name,
    schedule: scheduleToLabel(job.schedule),
    isolatedSession: job.sessionTarget !== "main",
    status: !job.enabled ? "paused" : job.state?.lastError ? "warning" : "healthy",
    nextRun: formatMs(job.state?.nextRunAtMs),
    lastRun: formatMs(job.state?.lastRunAtMs),
    failureCount: insights?.failuresByJob[job.id] ?? 0,
    lastFailure: insights?.lastFailureByJob[job.id],
  }));
  return [...fromGateway, ...manualOnly].slice(0, 100);
}

function deriveBrainDocsFromConfig(config: Record<string, unknown> | undefined): BrainDoc[] {
  const anyCfg = (config ?? {}) as Record<string, unknown>;
  const channels = ((anyCfg.channels ?? {}) as Record<string, unknown>) || {};
  const enabledChannels = Object.entries(channels)
    .filter(([, v]) => (v as Record<string, unknown>)?.enabled === true)
    .map(([k]) => k)
    .slice(0, 8);
  const auth = (anyCfg.auth ?? {}) as Record<string, unknown>;
  const authProfiles = Array.isArray(auth.order) ? auth.order.length : 0;
  return [
    {
      id: "brain:config:channels",
      title: "Configuração ativa de canais",
      content:
        enabledChannels.length > 0
          ? `Canais habilitados: ${enabledChannels.join(", ")}`
          : "Nenhum canal habilitado detectado.",
    },
    {
      id: "brain:config:auth",
      title: "Perfis de autenticação",
      content: `Total de perfis em auth.order: ${authProfiles}`,
    },
  ];
}

function deriveBrainDocsFromSessions(sessions: SessionEntry[], existing: BrainDoc[]): BrainDoc[] {
  const seen = new Set(existing.map((d) => d.id));
  const derived = [...existing];
  for (const s of sessions) {
    if (!s.title?.trim()) continue;
    if (!/memory|memo|cron|missão|mission|deploy|bug|fix/i.test(s.title)) continue;
    const id = `sess:${s.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    derived.unshift({
      id,
      title: s.title,
      content: `Sessão ${s.key} • atualizada em ${s.updatedAt ?? "--"}`,
    });
  }
  return derived.slice(0, 40);
}

function deriveRunDispatchesFromCronRuns(
  entries: CronRunEntry[],
  existing: RunDispatch[]
): RunDispatch[] {
  const normalized = entries.map((entry) => ({
    id: `cronrun:${entry.jobId}:${entry.ts}`,
    jobId: entry.jobId,
    jobName: entry.jobName ?? entry.jobId,
    sessionKey: entry.sessionKey ?? `cron:${entry.jobId}`,
    requestedAt: formatMs(entry.ts),
    status:
      entry.status === "ok"
        ? ("completed" as const)
        : entry.status === "error"
          ? ("failed" as const)
          : entry.status === "skipped"
            ? ("unknown" as const)
            : ("unknown" as const),
  }));
  const merged = [...normalized, ...existing];
  const seen = new Set<string>();
  const out: RunDispatch[] = [];
  for (const row of merged) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out.slice(0, 30);
}

function deriveProjects(sessions: SessionEntry[], existing: Project[]): Project[] {
  const existingIds = new Set(existing.map((p) => p.id));
  const derived: Project[] = [...existing];

  // Group sessions by agent prefix to detect active projects
  const prefixCounts = new Map<string, number>();
  for (const s of sessions) {
    const parts = s.key.split(":");
    const prefix = parts.length >= 2 ? parts.slice(0, 2).join(":") : s.key;
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }
  for (const [prefix, count] of prefixCounts) {
    const projectId = `proj-auto-${prefix}`;
    if (!existingIds.has(projectId) && count >= 1) {
      derived.push({
        id: projectId,
        name: prefix,
        status: "active",
        risk: count > 5 ? "medium" : "low",
        updated: new Date().toISOString().slice(0, 10),
      });
    }
  }
  return derived.slice(0, 30);
}

function deriveIntegrationErrorsFromStatus(statusProbe?: ChannelsStatusResult): IntegrationError[] {
  const rows = statusProbe?.channelAccounts ?? {};
  const out: IntegrationError[] = [];
  for (const [channel, accounts] of Object.entries(rows)) {
    for (const account of accounts ?? []) {
      if (!account?.lastError) continue;
      out.push({
        id: crypto.randomUUID(),
        channel,
        message: account.lastError,
        timestamp: nowLabel(),
      });
    }
  }
  return out.slice(0, 50);
}

function mergeIntegrationErrors(
  incoming: IntegrationError[],
  existing: IntegrationError[]
): IntegrationError[] {
  const seen = new Set<string>();
  const merged: IntegrationError[] = [];
  for (const err of [...incoming, ...existing]) {
    const key = `${err.channel}:${err.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(err);
  }
  return merged.slice(0, 50);
}

function deriveSystemsRuntime(
  base: SystemCard[],
  connected: boolean,
  sessionsCount: number,
  integrations: Integration[]
): SystemCard[] {
  const gatewaySystem: SystemCard = {
    id: "sys-gateway-live",
    name: "Gateway Link",
    status: connected ? "online" : "offline",
    health: connected ? 100 : 35,
    detail: connected ? "WebSocket conectado" : "Sem conexão com gateway",
  };
  const sessionsSystem: SystemCard = {
    id: "sys-sessions-live",
    name: "Session Fabric",
    status: sessionsCount > 0 ? "online" : "warning",
    health: sessionsCount > 0 ? Math.min(100, 70 + sessionsCount) : 55,
    detail: `${sessionsCount} sessões visíveis no runtime`,
  };
  const connectedIntegrations = integrations.filter((i) => i.status === "connected").length;
  const integrationSystem: SystemCard = {
    id: "sys-integrations-live",
    name: "Channel Integrations",
    status: connectedIntegrations > 0 ? "online" : "warning",
    health: Math.max(40, Math.min(100, 40 + connectedIntegrations * 20)),
    detail: `${connectedIntegrations}/${integrations.length} canais conectados`,
  };
  const withoutReplaced = base.filter(
    (s) => !["sys-gateway-live", "sys-sessions-live", "sys-integrations-live"].includes(s.id)
  );
  return [gatewaySystem, sessionsSystem, integrationSystem, ...withoutReplaced];
}

export function MissionControlPage() {
  const gw = useGatewayRpc();
  const navigate = useNavigate();
  const location = useLocation();
  const runsSectionRef = React.useRef<HTMLElement | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [configHash, setConfigHash] = React.useState<string | null>(null);
  const [data, setData] = React.useState<MissionControlData>(DEFAULT_DATA);
  const [sessionsCount, setSessionsCount] = React.useState(0);
  const [sessions, setSessions] = React.useState<SessionEntry[]>([]);
  const [models, setModels] = React.useState<ModelShare[]>([]);
  const [lastSyncAt, setLastSyncAt] = React.useState<string>("--:--:--");
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("operations");
  const [liveEvents, setLiveEvents] = React.useState<LiveEvent[]>([]);
  const [eventFilter, setEventFilter] = React.useState("");

  // Cron modal state
  const [cronModalOpen, setCronModalOpen] = React.useState(false);
  const [cronEditTarget, setCronEditTarget] = React.useState<CronJob | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, sess, mdl, chStatus, cronPage, cronRuns] = await Promise.all([
        gw.request<ConfigGetResponse>("config.get", {}),
        gw.request<SessionsListResponse>("sessions.list", {
          limit: 100,
          includeDerivedTitles: true,
        }),
        gw.request<ModelsListResponse>("models.list", {}).catch(() => ({ models: [] })),
        gw
          .request<ChannelsStatusResult>("channels.status", { probe: false, timeoutMs: 4000 })
          .catch(() => ({ channelAccounts: {} })),
        gw
          .request<CronListResponse>("cron.list", { includeDisabled: true, limit: 100 })
          .catch(() => ({ jobs: [] })),
        gw
          .request<CronRunsPageResponse>("cron.runs", { scope: "all", limit: 30 })
          .catch(() => ({ entries: [] })),
      ]);
      setConfigHash(typeof cfg.hash === "string" ? cfg.hash : null);

      const rawConfig = (cfg.config as Record<string, unknown>) || {};
      const parsed = readMissionControl(rawConfig, chStatus);
      const sessionRows = Array.isArray(sess.sessions) ? sess.sessions : [];
      setSessionsCount(sessionRows.length);
      setSessions(sessionRows);
      const statusErrors = deriveIntegrationErrorsFromStatus(chStatus);
      const cronRunEntries = Array.isArray(cronRuns.entries) ? cronRuns.entries : [];
      const cronInsights = deriveCronInsights(cronRunEntries);
      const withRuntimeSystems = {
        ...parsed,
        systems: deriveSystemsRuntime(
          parsed.systems,
          gw.connected,
          sessionRows.length,
          parsed.integrations
        ),
        fileTree: deriveFileTree(sessionRows, parsed.fileTree),
        projects: deriveProjects(sessionRows, parsed.projects),
        cronJobs: deriveCronJobsFromGateway(
          Array.isArray(cronPage.jobs) ? cronPage.jobs : [],
          parsed.cronJobs,
          cronInsights
        ),
        runDispatches: deriveRunDispatchesFromCronRuns(cronRunEntries, parsed.runDispatches),
        brainDocs: deriveBrainDocsFromSessions(sessionRows, [
          ...deriveBrainDocsFromConfig(rawConfig),
          ...parsed.brainDocs,
        ]),
        overnightTimeline: [
          ...cronRunEntries.slice(0, 5).map((r) => {
            const outcome = r.status === "ok" ? "ok" : r.status === "error" ? "falhou" : "skip";
            return `${formatMs(r.ts)} cron ${r.jobName ?? r.jobId}: ${outcome}`;
          }),
          ...parsed.overnightTimeline,
        ].slice(0, 15),
        integrationErrors: mergeIntegrationErrors(statusErrors, parsed.integrationErrors),
      };
      const withRunStatuses = {
        ...withRuntimeSystems,
        runDispatches: withRuntimeSystems.runDispatches.map((run) => {
          const found = sessionRows.some((s) => s.key === run.sessionKey);
          if (!found) return { ...run, status: "unknown" as const };
          if (run.status === "completed") return run;
          return { ...run, status: "running" as const };
        }),
      };
      setData(withRunStatuses);

      const modelList = Array.isArray(mdl.models) ? mdl.models : [];
      if (!modelList.length) {
        setModels([]);
      } else {
        const pct = Math.max(1, Math.floor(100 / modelList.length));
        setModels(modelList.slice(0, 4).map((m) => ({ id: m.id, share: pct })));
      }
      setLastSyncAt(nowLabel());
    } catch (err) {
      addToastError(err);
    } finally {
      setLoading(false);
    }
  }, [gw]);

  React.useEffect(() => {
    void load();
  }, [load]);
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  // Debounced reload: múltiplos eventos rápidos disparam apenas um load()
  const debouncedLoadRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = React.useCallback(() => {
    if (debouncedLoadRef.current) clearTimeout(debouncedLoadRef.current);
    debouncedLoadRef.current = setTimeout(() => {
      void load();
      debouncedLoadRef.current = null;
    }, DEBOUNCE_RELOAD_MS);
  }, [load]);
  React.useEffect(() => {
    return () => {
      if (debouncedLoadRef.current) clearTimeout(debouncedLoadRef.current);
    };
  }, []);

  React.useEffect(() => {
    const off = gw.onEvent((evt) => {
      const stamp = nowLabel();
      const evtPayload = (evt.payload ?? {}) as Record<string, unknown>;
      setLiveEvents((prev) =>
        [
          {
            id: crypto.randomUUID(),
            at: stamp,
            event: evt.event,
            payload: evt.payload,
            severity: classifyEventSeverity(evt.event, evt.payload),
            sessionKey:
              typeof evtPayload.sessionKey === "string" ? evtPayload.sessionKey : undefined,
            runId: typeof evtPayload.runId === "string" ? evtPayload.runId : undefined,
          },
          ...prev,
        ].slice(0, 300)
      );

      // Atualização incremental por tipo de evento
      if (evt.event === "chat") {
        const payload = (evt.payload ?? {}) as { sessionKey?: string; state?: string };
        if (payload.sessionKey) {
          setData((curr) => ({
            ...curr,
            runDispatches: curr.runDispatches.map((r) =>
              r.sessionKey !== payload.sessionKey
                ? r
                : {
                    ...r,
                    status:
                      payload.state === "final"
                        ? "completed"
                        : payload.state === "error"
                          ? "failed"
                          : "running",
                  }
            ),
          }));
        }
      }

      // Atualizar contadores de canal em tempo real
      if (evt.event === "chat" || evt.event === "message" || evt.event === "channel.deliver") {
        const msgPayload = (evt.payload ?? {}) as { channel?: string };
        if (msgPayload.channel) {
          setData((curr) => ({
            ...curr,
            integrations: curr.integrations.map((intg) =>
              intg.channel !== msgPayload.channel
                ? intg
                : {
                    ...intg,
                    lastActivity: stamp,
                    messagesCount24h: (intg.messagesCount24h ?? 0) + 1,
                  }
            ),
          }));
        }
      }

      if (evt.event === "channel.error") {
        const errPayload = (evt.payload ?? {}) as { channel?: string; message?: string };
        if (errPayload.channel) {
          setData((curr) => ({
            ...curr,
            integrationErrors: [
              {
                id: crypto.randomUUID(),
                channel: errPayload.channel!,
                message: errPayload.message ?? "Erro desconhecido",
                timestamp: stamp,
              },
              ...curr.integrationErrors,
            ].slice(0, 50),
            integrations: curr.integrations.map((intg) =>
              intg.channel !== errPayload.channel
                ? intg
                : { ...intg, errorsCount24h: (intg.errorsCount24h ?? 0) + 1 }
            ),
          }));
        }
      }

      // Fallback: reload completo debounced ao invés de imediato
      scheduleReload();
    });
    return off;
  }, [gw, scheduleReload]);
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("tab") === "runs") {
      setActiveTab("operations");
      runsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (params.get("tab") === "brain") {
      setActiveTab("brain");
    } else if (params.get("tab") === "eventos") {
      setActiveTab("eventos");
    }
  }, [location.search]);

  const persist = React.useCallback(
    async (next: MissionControlData) => {
      try {
        const fresh = await gw.request<ConfigGetResponse>("config.get", {});
        const baseHash = typeof fresh.hash === "string" ? fresh.hash : configHash;
        if (!baseHash) throw new Error("Config hash indisponível para persistir Mission Control");
        await gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify({ missionControl: next }, null, 2),
          note: "Mission Control: update persisted dashboard state",
        });
        setConfigHash(baseHash);
      } catch (err) {
        addToastError(err);
      }
    },
    [gw, configHash]
  );

  const updateAndPersist = (next: MissionControlData) => {
    setData(next);
    void persist(next);
  };

  /* ── Decision actions ── */
  const setDecision = (id: string, status: DecisionStatus) => {
    updateAndPersist({
      ...data,
      decisions: data.decisions.map((d) => (d.id === id ? { ...d, status } : d)),
    });
  };

  /* ── Cron CRUD ── */
  const togglePauseJob = async (id: string) => {
    const target = data.cronJobs.find((j) => j.id === id);
    if (!target) return;
    if (target.gatewayJobId) {
      try {
        const enable = target.status === "paused";
        await gw.request("cron.update", { id: target.gatewayJobId, patch: { enabled: enable } });
        await load();
        return;
      } catch (err) {
        addToastError(err);
      }
    }
    updateAndPersist({
      ...data,
      cronJobs: data.cronJobs.map((j) => {
        if (j.id !== id) return j;
        return { ...j, status: (j.status === "paused" ? "healthy" : "paused") as JobStatus };
      }),
    });
  };

  const saveCronJob = async (form: CronJobFormData) => {
    const existing = data.cronJobs.find((j) => j.id === form.id);
    try {
      if (existing?.gatewayJobId) {
        await gw.request("cron.update", {
          id: existing.gatewayJobId,
          patch: {
            name: form.name,
            schedule: { kind: "cron", expr: form.schedule },
            sessionTarget: form.isolatedSession ? "isolated" : "main",
          },
        });
        setCronModalOpen(false);
        setCronEditTarget(null);
        await load();
        return;
      }
      if (!existing) {
        await gw.request("cron.add", {
          name: form.name,
          schedule: { kind: "cron", expr: form.schedule },
          sessionTarget: form.isolatedSession ? "isolated" : "main",
          wakeMode: "next-heartbeat",
          payload: form.isolatedSession
            ? { kind: "agentTurn", message: `Executar rotina: ${form.name}` }
            : { kind: "systemEvent", text: `Executar rotina: ${form.name}` },
        });
        setCronModalOpen(false);
        setCronEditTarget(null);
        await load();
        return;
      }
    } catch (err) {
      addToastError(err);
    }

    let nextJobs: CronJob[];
    if (existing) {
      nextJobs = data.cronJobs.map((j) =>
        j.id === form.id
          ? {
              ...j,
              name: form.name,
              schedule: form.schedule,
              isolatedSession: form.isolatedSession,
            }
          : j
      );
    } else {
      nextJobs = [
        ...data.cronJobs,
        {
          id: form.id,
          name: form.name,
          schedule: form.schedule,
          isolatedSession: form.isolatedSession,
          status: "healthy" as JobStatus,
          nextRun: "--",
          lastRun: undefined,
        },
      ];
    }
    updateAndPersist({ ...data, cronJobs: nextJobs });
    setCronModalOpen(false);
    setCronEditTarget(null);
  };

  const deleteCronJob = async (id: string) => {
    const target = data.cronJobs.find((j) => j.id === id);
    if (target?.gatewayJobId) {
      try {
        await gw.request("cron.remove", { id: target.gatewayJobId });
        setCronModalOpen(false);
        setCronEditTarget(null);
        await load();
        return;
      } catch (err) {
        addToastError(err);
      }
    }
    updateAndPersist({ ...data, cronJobs: data.cronJobs.filter((j) => j.id !== id) });
    setCronModalOpen(false);
    setCronEditTarget(null);
  };

  const runNowJob = async (id: string) => {
    const target = data.cronJobs.find((j) => j.id === id);
    if (!target) return;
    const stamp = nowLabel();
    try {
      if (target.gatewayJobId) {
        await gw.request("cron.run", { id: target.gatewayJobId, mode: "force" });
        const next = {
          ...data,
          overnightTimeline: [
            `${stamp} execução manual disparada (cron.run): ${target.name}`,
            ...data.overnightTimeline,
          ].slice(0, 15),
        };
        setData(next);
        await persist(next);
        await load();
        return;
      }

      const sessionKey = newSessionKey();
      const message = [
        `[RUNNOW] ${target.name}`,
        "MISSION_CONTROL_RUNNOW",
        `Job: ${target.name}`,
        `Schedule: ${target.schedule}`,
        `RequestedAt: ${stamp}`,
        "Execute this routine now in this isolated session and return a short completion summary.",
      ].join("\n");
      await gw.request("chat.send", {
        sessionKey,
        message,
        deliver: false,
        idempotencyKey: crypto.randomUUID(),
      });
      const next = {
        ...data,
        cronJobs: data.cronJobs.map((j) =>
          j.id === id ? { ...j, lastRun: stamp, status: "healthy" as JobStatus } : j
        ),
        runDispatches: [
          {
            id: crypto.randomUUID(),
            jobId: target.id,
            jobName: target.name,
            sessionKey,
            requestedAt: stamp,
            status: "dispatched" as const,
          },
          ...data.runDispatches,
        ].slice(0, 20),
        overnightTimeline: [
          `${stamp} execução manual disparada: ${target.name}`,
          ...data.overnightTimeline,
        ].slice(0, 15),
      };
      setData(next);
      await persist(next);
    } catch (err) {
      addToastError(err);
    }
  };

  const openSession = (sessionKey: string) => {
    void navigate(`${routes.chat}?session=${encodeURIComponent(sessionKey)}`, { replace: true });
  };

  const markRunCompleted = (runId: string) => {
    updateAndPersist({
      ...data,
      runDispatches: data.runDispatches.map((r) =>
        r.id === runId ? { ...r, status: "completed" as const } : r
      ),
    });
  };

  const retryFailedJob = async (job: CronJob) => {
    await runNowJob(job.id);
  };

  /* ── Backup/restore actions ── */
  const addSnapshot = async () => {
    const stamp = nowLabel();
    try {
      const result = await window.desktopApi?.createBackup?.();
      if (result && !result.ok && !result.cancelled) {
        addToastError(result.error || "Falha ao criar backup");
        return;
      }
      if (result?.cancelled) return;
    } catch (err) {
      addToastError(err);
      return;
    }

    const snap: BackupSnapshot = {
      id: crypto.randomUUID(),
      label: `Snapshot ${stamp}`,
      createdAt: stamp,
      restoreChecked: false,
    };
    updateAndPersist({
      ...data,
      backupSnapshots: [snap, ...data.backupSnapshots].slice(0, 30),
      overnightTimeline: [
        `${stamp} snapshot criado (arquivo salvo): ${snap.label}`,
        ...data.overnightTimeline,
      ].slice(0, 15),
    });
  };

  const markRestoreChecked = (snapId: string) => {
    const stamp = nowLabel();
    updateAndPersist({
      ...data,
      backupSnapshots: data.backupSnapshots.map((s) =>
        s.id === snapId ? { ...s, restoreChecked: true } : s
      ),
      overnightTimeline: [`${stamp} restore-check passed`, ...data.overnightTimeline].slice(0, 15),
    });
  };

  /* ── Integration error log ── */
  const clearIntegrationErrors = () => {
    updateAndPersist({ ...data, integrationErrors: [] });
  };

  /* ── Brain tab actions ── */
  const addBrainDoc = (doc: BrainDoc) => {
    updateAndPersist({ ...data, brainDocs: [...data.brainDocs, doc] });
  };
  const deleteBrainDoc = (id: string) => {
    updateAndPersist({ ...data, brainDocs: data.brainDocs.filter((d) => d.id !== id) });
  };

  const pending = data.decisions.filter((d) => d.status === "pending").length;
  const healthyJobs = data.cronJobs.filter((j) => j.status === "healthy").length;
  const warningJobs = data.cronJobs.filter((j) => j.status === "warning").length;
  const topProblematicJobs = [...data.cronJobs]
    .filter((j) => (j.failureCount ?? 0) > 0)
    .sort((a, b) => (b.failureCount ?? 0) - (a.failureCount ?? 0))
    .slice(0, 3);
  const completedRuns = data.runDispatches.filter((r) => r.status === "completed").length;
  const failedRuns = data.runDispatches.filter((r) => r.status === "failed").length;
  const totalRuns = completedRuns + failedRuns;
  const successRate = totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : null;
  const filteredEvents = liveEvents.filter((e) => {
    if (!eventFilter.trim()) return true;
    const q = eventFilter.toLowerCase();
    return (
      e.event.toLowerCase().includes(q) ||
      (e.sessionKey ?? "").toLowerCase().includes(q) ||
      (e.runId ?? "").toLowerCase().includes(q) ||
      e.severity.includes(q) ||
      JSON.stringify(e.payload).toLowerCase().includes(q)
    );
  });

  return (
    <div className={css.wrap}>
      <div className={css.header}>
        <h1>Centro de Missão</h1>
        <div className={css.headerRight}>
          <div className={css.tabBar}>
            <button
              className={`${css.tabBtn} ${activeTab === "operations" ? css.tabActive : ""}`}
              onClick={() => setActiveTab("operations")}
            >
              Operações
            </button>
            <button
              className={`${css.tabBtn} ${activeTab === "brain" ? css.tabActive : ""}`}
              onClick={() => setActiveTab("brain")}
            >
              Cérebro
            </button>
            <button
              className={`${css.tabBtn} ${activeTab === "eventos" ? css.tabActive : ""}`}
              onClick={() => setActiveTab("eventos")}
            >
              Eventos
            </button>
          </div>
          <div className={css.syncMeta}>sincronia: {lastSyncAt}</div>
          <button className={css.refreshBtn} onClick={() => void load()} disabled={loading}>
            {loading ? "Sincronizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {activeTab === "brain" ? (
        <BrainTab
          docs={data.brainDocs}
          sessions={sessions}
          fileTree={data.fileTree}
          onAddDoc={addBrainDoc}
          onDeleteDoc={deleteBrainDoc}
        />
      ) : activeTab === "eventos" ? (
        <div className={css.grid}>
          <section className={`${css.card} ${css.wide}`}>
            <div className={css.cardHeader}>
              <h3>Eventos em tempo real</h3>
              <button className={css.smallBtn} onClick={() => setLiveEvents([])}>
                Limpar feed
              </button>
            </div>
            <input
              className={css.inputLike}
              placeholder="Filtrar por evento, sessionKey, runId, severidade (info/success/warning/error)"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            />
            <div className={css.eventStats}>
              <span className={`${css.eventBadge} ${css.badgeInfo}`}>
                info: {liveEvents.filter((e) => e.severity === "info").length}
              </span>
              <span className={`${css.eventBadge} ${css.badgeSuccess}`}>
                sucesso: {liveEvents.filter((e) => e.severity === "success").length}
              </span>
              <span className={`${css.eventBadge} ${css.badgeWarning}`}>
                aviso: {liveEvents.filter((e) => e.severity === "warning").length}
              </span>
              <span className={`${css.eventBadge} ${css.badgeError}`}>
                erro: {liveEvents.filter((e) => e.severity === "error").length}
              </span>
            </div>
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  <tr>
                    <th>Horário</th>
                    <th>Tipo</th>
                    <th>Evento</th>
                    <th>Sessão / RunId</th>
                    <th>Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.slice(0, 200).map((ev) => (
                    <tr key={ev.id}>
                      <td className={css.mono}>{ev.at}</td>
                      <td>
                        <span className={`${css.eventBadge} ${css[`badge_${ev.severity}`]}`}>
                          {ev.severity}
                        </span>
                      </td>
                      <td>{ev.event}</td>
                      <td className={css.mono}>
                        {ev.sessionKey && (
                          <span
                            className={css.clickable}
                            onClick={() => setEventFilter(ev.sessionKey!)}
                            title="Filtrar por esta sessão"
                          >
                            {ev.sessionKey.slice(0, 24)}
                          </span>
                        )}
                        {ev.runId && (
                          <span
                            className={css.clickable}
                            onClick={() => setEventFilter(ev.runId!)}
                            title="Filtrar por este runId"
                          >
                            {ev.sessionKey ? " · " : ""}
                            {ev.runId.slice(0, 12)}
                          </span>
                        )}
                        {!ev.sessionKey && !ev.runId && <span className={css.muted}>--</span>}
                      </td>
                      <td className={css.mono}>{JSON.stringify(ev.payload).slice(0, 200)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredEvents.length === 0 && (
              <p className={css.muted}>Nenhum evento no stream até agora.</p>
            )}
          </section>
        </div>
      ) : (
        <div className={css.grid}>
          {/* Morning brief */}
          <section className={css.card}>
            <h3>Resumo da manhã</h3>
            <div className={css.metrics}>
              <div>
                <span>Sessões</span>
                <strong>{sessionsCount}</strong>
              </div>
              <div>
                <span>Pendentes</span>
                <strong>{pending}</strong>
              </div>
              <div>
                <span>Rotinas saudáveis</span>
                <strong>
                  {healthyJobs}/{data.cronJobs.length}
                </strong>
              </div>
              <div>
                <span>Projetos</span>
                <strong>{data.projects.length}</strong>
              </div>
              <div>
                <span>Rotinas com alerta</span>
                <strong>{warningJobs}</strong>
              </div>
              <div>
                <span>Taxa de sucesso</span>
                <strong>{successRate === null ? "--" : `${successRate}%`}</strong>
              </div>
            </div>
            <p className={css.muted}>
              Atualização automática a cada {Math.floor(AUTO_REFRESH_MS / 1000)}s + eventos do
              gateway.
            </p>
          </section>

          {/* Models */}
          <section className={css.card}>
            <h3>Modelos em uso</h3>
            <div className={css.modelList}>
              {models.length === 0 ? (
                <p className={css.muted}>Nenhum modelo ativo detectado.</p>
              ) : (
                models.map((m) => (
                  <div key={m.id}>
                    <div className={css.row}>
                      <span>{m.id}</span>
                      <span>{m.share}%</span>
                    </div>
                    <div className={css.bar}>
                      <i style={{ width: `${m.share}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Decisions */}
          <section className={`${css.card} ${css.wide}`}>
            <h3>Bloqueado pelo Boss</h3>
            <div className={css.decisions}>
              {data.decisions.map((d) => (
                <div key={d.id} className={css.decision}>
                  <div>
                    <div className={css.title}>{d.title}</div>
                    <div className={css.meta}>
                      Impacto: {d.impact} · Status: {d.status}
                    </div>
                  </div>
                  <div className={css.actions}>
                    <button onClick={() => setDecision(d.id, "approved")}>Aprovar</button>
                    <button onClick={() => setDecision(d.id, "rejected")}>X</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Cron center with CRUD */}
          <section className={`${css.card} ${css.wide}`}>
            <div className={css.cardHeader}>
              <h3>Central de cron (sessões isoladas)</h3>
              <button
                className={css.smallBtn}
                onClick={() => {
                  setCronEditTarget(null);
                  setCronModalOpen(true);
                }}
              >
                + Adicionar rotina
              </button>
            </div>
            {topProblematicJobs.length > 0 && (
              <div className={css.muted} style={{ marginBottom: 8 }}>
                Mais problemáticas:{" "}
                {topProblematicJobs.map((j) => `${j.name} (${j.failureCount} falhas)`).join(" · ")}
              </div>
            )}
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  <tr>
                    <th>Rotina</th>
                    <th>Agenda</th>
                    <th>Isolada</th>
                    <th>Status</th>
                    <th>Falhas</th>
                    <th>Próxima</th>
                    <th>Última</th>
                    <th>Última causa</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.cronJobs.map((j) => (
                    <tr key={j.id}>
                      <td>{j.name}</td>
                      <td className={css.mono}>{j.schedule}</td>
                      <td>{j.isolatedSession ? "sim" : "não"}</td>
                      <td>{j.status}</td>
                      <td className={css.mono}>{j.failureCount ?? 0}</td>
                      <td className={css.mono}>{j.nextRun}</td>
                      <td className={css.mono}>{j.lastRun ?? "--"}</td>
                      <td title={j.lastFailure ?? ""}>{j.lastFailure ?? "--"}</td>
                      <td>
                        <div className={css.inlineActions}>
                          <button className={css.smallBtn} onClick={() => runNowJob(j.id)}>
                            Executar agora
                          </button>
                          <button className={css.smallBtn} onClick={() => togglePauseJob(j.id)}>
                            {j.status === "paused" ? "Retomar" : "Pausar"}
                          </button>
                          <button
                            className={css.smallBtn}
                            onClick={() => {
                              setCronEditTarget(j);
                              setCronModalOpen(true);
                            }}
                          >
                            Editar
                          </button>
                          {j.status === "warning" && (
                            <button className={css.smallBtn} onClick={() => void retryFailedJob(j)}>
                              Reprocessar erro
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Run-now dispatches */}
          <section ref={runsSectionRef} className={`${css.card} ${css.wide}`}>
            <h3>Despachos de execução manual</h3>
            {!data.runDispatches.length ? (
              <p className={css.muted}>Nenhuma execução manual disparada ainda.</p>
            ) : (
              <div className={css.tableWrap}>
                <table className={css.table}>
                  <thead>
                    <tr>
                      <th>Rotina</th>
                      <th>Status</th>
                      <th>Solicitada em</th>
                      <th>Sessão</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runDispatches.map((r) => (
                      <tr key={r.id}>
                        <td>{r.jobName}</td>
                        <td>{r.status}</td>
                        <td className={css.mono}>{r.requestedAt}</td>
                        <td className={css.mono}>{r.sessionKey}</td>
                        <td>
                          <div className={css.inlineActions}>
                            <button
                              className={css.smallBtn}
                              onClick={() => openSession(r.sessionKey)}
                            >
                              Abrir sessão
                            </button>
                            {r.status !== "completed" && (
                              <button
                                className={css.smallBtn}
                                onClick={() => markRunCompleted(r.id)}
                              >
                                Marcar como concluída
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Backup / Restore timeline */}
          <section className={`${css.card} ${css.wide}`}>
            <div className={css.cardHeader}>
              <h3>Backup / Restauração</h3>
              <button className={css.smallBtn} onClick={addSnapshot}>
                + Snapshot
              </button>
            </div>
            {data.backupSnapshots.length === 0 ? (
              <p className={css.muted}>
                Ainda não há snapshots. Crie um para começar o histórico de backups.
              </p>
            ) : (
              <div className={css.snapshotList}>
                {data.backupSnapshots.map((snap) => (
                  <div key={snap.id} className={css.snapshotCard}>
                    <div>
                      <div className={css.title}>{snap.label}</div>
                      <div className={css.meta}>
                        Criado em: {snap.createdAt} · Verificação de restauração:{" "}
                        {snap.restoreChecked ? "ok" : "pendente"}
                      </div>
                    </div>
                    {!snap.restoreChecked && (
                      <button className={css.smallBtn} onClick={() => markRestoreChecked(snap.id)}>
                        Marcar restauração OK
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Systems */}
          <section className={css.card}>
            <h3>Sistemas</h3>
            <div className={css.systems}>
              {data.systems.map((s) => (
                <div key={s.id} className={css.system}>
                  <div className={css.row}>
                    <span>{s.name}</span>
                    <span>{s.health}%</span>
                  </div>
                  <div className={css.bar}>
                    <i style={{ width: `${s.health}%` }} />
                  </div>
                  <div className={css.meta}>
                    {s.status} · {s.detail}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Integrations operational panel */}
          <section className={css.card}>
            <h3>Integrações</h3>
            <ul className={css.list}>
              {data.integrations.map((intg) => (
                <li key={intg.id}>
                  <div className={css.integrationRow}>
                    <span className={`${css.statusDot} ${css[`dot_${intg.status}`]}`} />
                    <span>{intg.name}</span>
                  </div>
                  <div className={css.integrationMeta}>
                    <span className={css.meta}>
                      {intg.channel} · {intg.status}
                    </span>
                    {(intg.messagesCount24h ?? 0) > 0 && (
                      <span className={css.meta}>{intg.messagesCount24h} msgs</span>
                    )}
                    {(intg.errorsCount24h ?? 0) > 0 && (
                      <span className={css.errorMeta}>{intg.errorsCount24h} erros</span>
                    )}
                    {intg.lastActivity && (
                      <span className={css.meta}>última: {intg.lastActivity}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {data.integrationErrors.length > 0 && (
              <div className={css.errorLog}>
                <div className={css.cardHeader}>
                  <div className={css.meta}>Erros recentes ({data.integrationErrors.length})</div>
                  <button className={css.tinyBtn} onClick={clearIntegrationErrors}>
                    Limpar
                  </button>
                </div>
                {data.integrationErrors.slice(0, 5).map((err) => (
                  <div key={err.id} className={css.errorEntry}>
                    <span className={css.mono}>{err.timestamp}</span>
                    <span>
                      {err.channel}: {err.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Projects */}
          <section className={css.card}>
            <h3>Projetos</h3>
            <ul className={css.list}>
              {data.projects.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <span className={css.meta}>
                    {p.status} · risco:{p.risk}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Org chart */}
          <section className={css.card}>
            <h3>Organograma</h3>
            <ul className={css.list}>
              {data.orgDivisions.map((o) => (
                <li key={o.id}>
                  <span>
                    {o.division} ({o.lead})
                  </span>
                  <span className={css.meta}>{o.agents.length} agentes</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Sponsor hub */}
          <section className={css.card}>
            <h3>Hub de patrocínio</h3>
            <div className={css.metrics}>
              <div>
                <span>Tabela de preços</span>
                <strong>{data.sponsorHub.rateCardReady ? "ok" : "a fazer"}</strong>
              </div>
              <div>
                <span>Mídia kit</span>
                <strong>{data.sponsorHub.mediaKitReady ? "ok" : "a fazer"}</strong>
              </div>
              <div>
                <span>Templates</span>
                <strong>{data.sponsorHub.pitchTemplates}</strong>
              </div>
              <div>
                <span>Leads</span>
                <strong>{data.sponsorHub.outreachLeads}</strong>
              </div>
            </div>
          </section>

          {/* Content library */}
          <section className={css.card}>
            <h3>Biblioteca de conteúdo</h3>
            <div className={css.metrics}>
              <div>
                <span>Total</span>
                <strong>{data.contentLibrary.items}</strong>
              </div>
              <div>
                <span>Rascunhos</span>
                <strong>{data.contentLibrary.drafts}</strong>
              </div>
              <div>
                <span>Publicados</span>
                <strong>{data.contentLibrary.published}</strong>
              </div>
            </div>
          </section>

          {/* Overnight activity */}
          <section className={`${css.card} ${css.wide}`}>
            <h3>Atividade da madrugada</h3>
            <ul className={css.timeline}>
              {data.overnightTimeline.map((entry, idx) => (
                <li key={`${idx}-${entry}`}>{entry}</li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* Cron CRUD modal */}
      <CronJobModal
        open={cronModalOpen}
        onClose={() => {
          setCronModalOpen(false);
          setCronEditTarget(null);
        }}
        onSave={saveCronJob}
        onDelete={cronEditTarget ? () => deleteCronJob(cronEditTarget.id) : undefined}
        initial={
          cronEditTarget
            ? {
                id: cronEditTarget.id,
                name: cronEditTarget.name,
                schedule: cronEditTarget.schedule,
                isolatedSession: cronEditTarget.isolatedSession,
              }
            : undefined
        }
      />
    </div>
  );
}
