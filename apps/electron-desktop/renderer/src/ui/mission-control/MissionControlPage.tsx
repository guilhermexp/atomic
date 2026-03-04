import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import type {
  ConfigGetResponse,
  ModelsListResponse,
  SessionEntry,
  SessionsListResponse,
} from "@gateway/types";
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
  status: "dispatched" | "running" | "completed" | "unknown";
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

const DEFAULT_DATA: MissionControlData = {
  decisions: [
    {
      id: "dec-001",
      title: "Ativar loop de self-improvement noturno",
      impact: "medium",
      status: "pending",
    },
    {
      id: "dec-002",
      title: "Publicar daily brief no Telegram às 09:00",
      impact: "low",
      status: "pending",
    },
    {
      id: "dec-003",
      title: "Permitir subagente autônomo para pesquisa noturna",
      impact: "high",
      status: "pending",
    },
  ],
  cronJobs: [
    {
      id: "job-001",
      name: "Daily GitHub Backup",
      schedule: "0 2 * * *",
      isolatedSession: true,
      status: "healthy",
      nextRun: "02:00",
      lastRun: "02:00",
    },
    {
      id: "job-002",
      name: "Morning Security Check",
      schedule: "0 9 * * *",
      isolatedSession: true,
      status: "warning",
      nextRun: "09:00",
      lastRun: "--",
    },
    {
      id: "job-003",
      name: "Projects Audit",
      schedule: "30 9 * * *",
      isolatedSession: true,
      status: "healthy",
      nextRun: "09:30",
      lastRun: "--",
    },
    {
      id: "job-004",
      name: "Self-Improvement",
      schedule: "45 3 * * *",
      isolatedSession: true,
      status: "paused",
      nextRun: "03:45",
      lastRun: "03:45",
    },
  ],
  systems: [
    {
      id: "sys-001",
      name: "OpenClaw Gateway",
      status: "online",
      health: 98,
      detail: "Sessões e roteamento",
    },
    {
      id: "sys-002",
      name: "Firewall + listeners",
      status: "warning",
      health: 84,
      detail: "Validar baseline",
    },
    {
      id: "sys-003",
      name: "Backup pipeline",
      status: "online",
      health: 96,
      detail: "Último restore OK",
    },
    {
      id: "sys-004",
      name: "Project audit",
      status: "online",
      health: 93,
      detail: "Inventário atualizado",
    },
  ],
  projects: [
    {
      id: "prj-001",
      name: "missioncontrol-macclaw-dashboard-design",
      status: "active",
      risk: "low",
      updated: "today",
    },
    { id: "prj-002", name: "atomicbot", status: "active", risk: "medium", updated: "today" },
    {
      id: "prj-003",
      name: "automation-scripts",
      status: "planning",
      risk: "low",
      updated: "yesterday",
    },
  ],
  orgDivisions: [
    {
      id: "org-001",
      division: "Core",
      lead: "O Brabo",
      agents: ["Security Sentinel", "Ops Runner"],
    },
    {
      id: "org-002",
      division: "Growth",
      lead: "Scout",
      agents: ["Social Repurpose", "Sponsor Planner"],
    },
    { id: "org-003", division: "Product", lead: "Builder", agents: ["UX Refiner", "QA Watcher"] },
  ],
  integrations: [
    { id: "int-001", name: "Webchat", status: "connected", channel: "webchat" },
    { id: "int-002", name: "Telegram", status: "pending", channel: "telegram" },
    { id: "int-003", name: "Discord", status: "pending", channel: "discord" },
  ],
  overnightTimeline: [
    "02:00 backup diário executado",
    "02:05 restore check concluído",
    "03:45 auto-improvement pausado por guardrail",
    "05:20 transcrição de referência consolidada",
    "06:30 pré-brief da manhã gerado",
  ],
  sponsorHub: { rateCardReady: true, mediaKitReady: false, pitchTemplates: 6, outreachLeads: 12 },
  contentLibrary: { items: 34, drafts: 7, published: 27 },
  runDispatches: [],
  brainDocs: [],
  fileTree: [],
  backupSnapshots: [],
  integrationErrors: [],
};

type ModelShare = { id: string; share: number };
type ActiveTab = "operations" | "brain";

function nowLabel() {
  return new Date().toLocaleTimeString();
}
function newSessionKey(): string {
  return `agent:main:main:${crypto.randomUUID().slice(0, 8)}`;
}

function deriveIntegrationsFromConfig(config: Record<string, unknown> | undefined): Integration[] {
  const anyCfg = (config ?? {}) as Record<string, unknown>;
  const channels = (anyCfg.channels ?? {}) as Record<string, unknown>;
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
    return {
      id: `int-auto-${idx + 1}`,
      name: s.name,
      channel: s.channel,
      status: enabled ? "connected" : "disabled",
    } as Integration;
  });
}

function readMissionControl(config: Record<string, unknown> | undefined): MissionControlData {
  const anyCfg = (config ?? {}) as Record<string, unknown>;
  const incoming = (anyCfg.missionControl ?? {}) as Partial<MissionControlData>;
  const autoIntegrations = deriveIntegrationsFromConfig(config);
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
    backupSnapshots: Array.isArray(incoming.backupSnapshots)
      ? incoming.backupSnapshots
      : DEFAULT_DATA.backupSnapshots,
    integrationErrors: Array.isArray(incoming.integrationErrors)
      ? incoming.integrationErrors
      : DEFAULT_DATA.integrationErrors,
  };
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

  // Cron modal state
  const [cronModalOpen, setCronModalOpen] = React.useState(false);
  const [cronEditTarget, setCronEditTarget] = React.useState<CronJob | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, sess, mdl] = await Promise.all([
        gw.request<ConfigGetResponse>("config.get", {}),
        gw.request<SessionsListResponse>("sessions.list", {
          limit: 100,
          includeDerivedTitles: true,
        }),
        gw.request<ModelsListResponse>("models.list", {}).catch(() => ({ models: [] })),
      ]);
      setConfigHash(typeof cfg.hash === "string" ? cfg.hash : null);

      const parsed = readMissionControl((cfg.config as Record<string, unknown>) || {});
      const sessionRows = Array.isArray(sess.sessions) ? sess.sessions : [];
      setSessionsCount(sessionRows.length);
      setSessions(sessionRows);
      const withRuntimeSystems = {
        ...parsed,
        systems: deriveSystemsRuntime(
          parsed.systems,
          gw.connected,
          sessionRows.length,
          parsed.integrations
        ),
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
        setModels([
          { id: "gpt-5.3-codex", share: 80 },
          { id: "claude-opus", share: 15 },
          { id: "gemini-cli", share: 5 },
        ]);
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
  React.useEffect(() => {
    const off = gw.onEvent(() => {
      void load();
    });
    return off;
  }, [gw, load]);
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("tab") === "runs") {
      setActiveTab("operations");
      runsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (params.get("tab") === "brain") {
      setActiveTab("brain");
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
  const togglePauseJob = (id: string) => {
    updateAndPersist({
      ...data,
      cronJobs: data.cronJobs.map((j) => {
        if (j.id !== id) return j;
        return { ...j, status: (j.status === "paused" ? "healthy" : "paused") as JobStatus };
      }),
    });
  };

  const saveCronJob = (form: CronJobFormData) => {
    const existing = data.cronJobs.find((j) => j.id === form.id);
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

  const deleteCronJob = (id: string) => {
    updateAndPersist({ ...data, cronJobs: data.cronJobs.filter((j) => j.id !== id) });
    setCronModalOpen(false);
    setCronEditTarget(null);
  };

  const runNowJob = async (id: string) => {
    const target = data.cronJobs.find((j) => j.id === id);
    if (!target) return;
    const stamp = nowLabel();
    try {
      const sessionKey = newSessionKey();
      const message = [
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
          j.id === id ? { ...j, lastRun: stamp, status: "healthy" } : j
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

  /* ── Backup/restore actions ── */
  const addSnapshot = () => {
    const stamp = nowLabel();
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
        `${stamp} snapshot created: ${snap.label}`,
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
              {models.map((m) => (
                <div key={m.id}>
                  <div className={css.row}>
                    <span>{m.id}</span>
                    <span>{m.share}%</span>
                  </div>
                  <div className={css.bar}>
                    <i style={{ width: `${m.share}%` }} />
                  </div>
                </div>
              ))}
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
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  <tr>
                    <th>Rotina</th>
                    <th>Agenda</th>
                    <th>Isolada</th>
                    <th>Status</th>
                    <th>Próxima</th>
                    <th>Última</th>
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
                      <td className={css.mono}>{j.nextRun}</td>
                      <td className={css.mono}>{j.lastRun ?? "--"}</td>
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
                  <span className={css.meta}>
                    {intg.channel} · {intg.status}
                  </span>
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
