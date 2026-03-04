import React from "react";
import { useGatewayRpc } from "@gateway/context";
import type { ConfigGetResponse, SessionsListResponse, ModelsListResponse } from "@gateway/types";
import { addToastError } from "@shared/toast";
import css from "./MissionControlPage.module.css";

type Decision = {
  id: string;
  title: string;
  impact: "low" | "medium" | "high";
  status: "pending" | "approved" | "rejected";
};

const DEFAULT_DECISIONS: Decision[] = [
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
];

type ModelShare = { id: string; share: number };

export function MissionControlPage() {
  const gw = useGatewayRpc();
  const [loading, setLoading] = React.useState(true);
  const [decisions, setDecisions] = React.useState<Decision[]>(DEFAULT_DECISIONS);
  const [sessionsCount, setSessionsCount] = React.useState(0);
  const [models, setModels] = React.useState<ModelShare[]>([]);
  const [configHash, setConfigHash] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, sess, mdl] = await Promise.all([
        gw.request<ConfigGetResponse>("config.get", {}),
        gw.request<SessionsListResponse>("sessions.list", {
          limit: 50,
          includeDerivedTitles: true,
        }),
        gw.request<ModelsListResponse>("models.list", {}).catch(() => ({ models: [] })),
      ]);

      setConfigHash(typeof cfg.hash === "string" ? cfg.hash : null);
      const cfgAny = (cfg.config ?? {}) as Record<string, unknown>;
      const missionControl = (cfgAny.missionControl ?? {}) as Record<string, unknown>;
      const cfgDecisions = Array.isArray(missionControl.decisions)
        ? (missionControl.decisions as Decision[])
        : DEFAULT_DECISIONS;
      setDecisions(cfgDecisions);

      const sCount = Array.isArray(sess.sessions) ? sess.sessions.length : 0;
      setSessionsCount(sCount);

      const modelList = Array.isArray(mdl.models) ? mdl.models : [];
      const safe = modelList.slice(0, 4);
      const fallback = [
        { id: "gpt-5.3-codex", share: 80 },
        { id: "claude-opus", share: 15 },
        { id: "gemini-cli", share: 5 },
      ];
      if (!safe.length) {
        setModels(fallback);
      } else {
        const total = safe.length;
        const even = Math.max(1, Math.floor(100 / total));
        setModels(safe.map((m) => ({ id: m.id, share: even })));
      }
    } catch (err) {
      addToastError(err);
    } finally {
      setLoading(false);
    }
  }, [gw]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const persistDecisions = React.useCallback(
    async (next: Decision[]) => {
      try {
        const fresh = await gw.request<ConfigGetResponse>("config.get", {});
        const baseHash = typeof fresh.hash === "string" ? fresh.hash : configHash;
        if (!baseHash) {
          throw new Error("Config hash não disponível");
        }
        await gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify({ missionControl: { decisions: next } }, null, 2),
          note: "Mission Control: update blocked decisions",
        });
        setConfigHash(baseHash);
      } catch (err) {
        addToastError(err);
      }
    },
    [gw, configHash]
  );

  const setDecision = (id: string, status: Decision["status"]) => {
    const next = decisions.map((d) => (d.id === id ? { ...d, status } : d));
    setDecisions(next);
    void persistDecisions(next);
  };

  const pending = decisions.filter((d) => d.status === "pending").length;

  return (
    <div className={css.wrap}>
      <div className={css.header}>
        <h1>Mission Control</h1>
        <button className={css.refreshBtn} onClick={() => void load()} disabled={loading}>
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <div className={css.grid}>
        <section className={css.card}>
          <h3>Overview</h3>
          <div className={css.metrics}>
            <div>
              <span>Sessões</span>
              <strong>{sessionsCount}</strong>
            </div>
            <div>
              <span>Pendências</span>
              <strong>{pending}</strong>
            </div>
          </div>
          <p className={css.muted}>
            Persistência via config do OpenClaw (DB/config nativo do AtomicBot).
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
            {decisions.map((d) => (
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
      </div>
    </div>
  );
}
