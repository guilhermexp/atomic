import React from "react";
import { useGatewayRpc } from "@gateway/context";
import type { ConfigGetResponse, ModelsListResponse, SessionsListResponse } from "@gateway/types";
import { addToastError } from "@shared/toast";
import css from "./MissionControlPage.module.css";

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
};

type ModelShare = { id: string; share: number };

function nowLabel() {
  return new Date().toLocaleTimeString();
}

function deriveIntegrationsFromConfig(config: Record<string, unknown> | undefined): Integration[] {
  const anyCfg = (config ?? {}) as Record<string, unknown>;
  const channels = (anyCfg.channels ?? {}) as Record<string, unknown>;
  const seeds: Array<{ key: string; name: string; channel: string }> = [
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
  const [loading, setLoading] = React.useState(true);
  const [configHash, setConfigHash] = React.useState<string | null>(null);
  const [data, setData] = React.useState<MissionControlData>(DEFAULT_DATA);
  const [sessionsCount, setSessionsCount] = React.useState(0);
  const [models, setModels] = React.useState<ModelShare[]>([]);
  const [lastSyncAt, setLastSyncAt] = React.useState<string>("--:--:--");

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
      const visibleSessions = Array.isArray(sess.sessions) ? sess.sessions.length : 0;
      setSessionsCount(visibleSessions);
      const withRuntimeSystems = {
        ...parsed,
        systems: deriveSystemsRuntime(
          parsed.systems,
          gw.connected,
          visibleSessions,
          parsed.integrations
        ),
      };
      setData(withRuntimeSystems);

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

  const persist = React.useCallback(
    async (next: MissionControlData) => {
      try {
        const fresh = await gw.request<ConfigGetResponse>("config.get", {});
        const baseHash = typeof fresh.hash === "string" ? fresh.hash : configHash;
        if (!baseHash) {
          throw new Error("Config hash indisponível para persistir Mission Control");
        }
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

  const setDecision = (id: string, status: DecisionStatus) => {
    const next = {
      ...data,
      decisions: data.decisions.map((d) => (d.id === id ? { ...d, status } : d)),
    };
    setData(next);
    void persist(next);
  };

  const togglePauseJob = (id: string) => {
    const next = {
      ...data,
      cronJobs: data.cronJobs.map((j) => {
        if (j.id !== id) return j;
        if (j.status === "paused") return { ...j, status: "healthy" as JobStatus };
        return { ...j, status: "paused" as JobStatus };
      }),
    };
    setData(next);
    void persist(next);
  };

  const runNowJob = (id: string) => {
    const target = data.cronJobs.find((j) => j.id === id);
    if (!target) return;
    const stamp = nowLabel();
    const next = {
      ...data,
      cronJobs: data.cronJobs.map((j) =>
        j.id === id ? { ...j, lastRun: stamp, status: "healthy" } : j
      ),
      overnightTimeline: [
        `${stamp} execução manual: ${target.name}`,
        ...data.overnightTimeline,
      ].slice(0, 15),
    };
    setData(next);
    void persist(next);
  };

  const pending = data.decisions.filter((d) => d.status === "pending").length;
  const healthyJobs = data.cronJobs.filter((j) => j.status === "healthy").length;

  return (
    <div className={css.wrap}>
      <div className={css.header}>
        <h1>Mission Control</h1>
        <div className={css.headerRight}>
          <div className={css.syncMeta}>sync: {lastSyncAt}</div>
          <button className={css.refreshBtn} onClick={() => void load()} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      <div className={css.grid}>
        <section className={css.card}>
          <h3>Morning brief</h3>
          <div className={css.metrics}>
            <div>
              <span>Sessões</span>
              <strong>{sessionsCount}</strong>
            </div>
            <div>
              <span>Pendências</span>
              <strong>{pending}</strong>
            </div>
            <div>
              <span>Jobs saudáveis</span>
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
            Auto-refresh a cada {Math.floor(AUTO_REFRESH_MS / 1000)}s + eventos do gateway.
          </p>
        </section>

        <section className={css.card}>
          <h3>Models in use</h3>
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

        <section className={`${css.card} ${css.wide}`}>
          <h3>Blocked by Boss</h3>
          <div className={css.decisions}>
            {data.decisions.map((d) => (
              <div key={d.id} className={css.decision}>
                <div>
                  <div className={css.title}>{d.title}</div>
                  <div className={css.meta}>
                    Impacto: {d.impact} • Status: {d.status}
                  </div>
                </div>
                <div className={css.actions}>
                  <button onClick={() => setDecision(d.id, "approved")}>Go</button>
                  <button onClick={() => setDecision(d.id, "rejected")}>X</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${css.card} ${css.wide}`}>
          <h3>Cron center (isolated sessions)</h3>
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Schedule</th>
                  <th>Isolated</th>
                  <th>Status</th>
                  <th>Next</th>
                  <th>Last</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.cronJobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.name}</td>
                    <td className={css.mono}>{j.schedule}</td>
                    <td>{j.isolatedSession ? "yes" : "no"}</td>
                    <td>{j.status}</td>
                    <td className={css.mono}>{j.nextRun}</td>
                    <td className={css.mono}>{j.lastRun ?? "--"}</td>
                    <td>
                      <div className={css.inlineActions}>
                        <button className={css.smallBtn} onClick={() => runNowJob(j.id)}>
                          Run now
                        </button>
                        <button className={css.smallBtn} onClick={() => togglePauseJob(j.id)}>
                          {j.status === "paused" ? "Resume" : "Pause"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={css.card}>
          <h3>Systems</h3>
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
                  {s.status} • {s.detail}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={css.card}>
          <h3>Projects</h3>
          <ul className={css.list}>
            {data.projects.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <span className={css.meta}>
                  {p.status} • risk:{p.risk}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={css.card}>
          <h3>Org chart</h3>
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

        <section className={css.card}>
          <h3>Integrations</h3>
          <ul className={css.list}>
            {data.integrations.map((i) => (
              <li key={i.id}>
                <span>{i.name}</span>
                <span className={css.meta}>
                  {i.channel} • {i.status}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={css.card}>
          <h3>Sponsor hub</h3>
          <div className={css.metrics}>
            <div>
              <span>Rate card</span>
              <strong>{data.sponsorHub.rateCardReady ? "ok" : "todo"}</strong>
            </div>
            <div>
              <span>Media kit</span>
              <strong>{data.sponsorHub.mediaKitReady ? "ok" : "todo"}</strong>
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

        <section className={css.card}>
          <h3>Content library</h3>
          <div className={css.metrics}>
            <div>
              <span>Total</span>
              <strong>{data.contentLibrary.items}</strong>
            </div>
            <div>
              <span>Drafts</span>
              <strong>{data.contentLibrary.drafts}</strong>
            </div>
            <div>
              <span>Published</span>
              <strong>{data.contentLibrary.published}</strong>
            </div>
          </div>
        </section>

        <section className={`${css.card} ${css.wide}`}>
          <h3>Overnight activity</h3>
          <ul className={css.timeline}>
            {data.overnightTimeline.map((entry, idx) => (
              <li key={`${idx}-${entry}`}>{entry}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
