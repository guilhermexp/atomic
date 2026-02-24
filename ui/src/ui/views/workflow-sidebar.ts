import { html } from "lit";
import { formatMs } from "../format.ts";
import { icons } from "../icons.ts";
import type { CronJob, SessionsListResult } from "../types.ts";

export type WorkflowSidebarProps = {
  loading: boolean;
  cronBusy: boolean;
  cronJobs: CronJob[];
  cronError: string | null;
  sessions: SessionsListResult | null;
  sessionsLoading: boolean;
  sessionsError: string | null;
  onRefresh: () => void;
  onClose: () => void;
  onCronRun: (job: CronJob) => void;
  onCronToggle: (job: CronJob, enabled: boolean) => void;
  onCronRemove: (job: CronJob) => void;
  onOpenCronTab: () => void;
  onOpenSessionsTab: () => void;
};

function cronScheduleSummary(job: CronJob): string {
  const schedule = job.schedule;
  if (schedule.kind === "at") {
    return `at ${schedule.at}`;
  }
  if (schedule.kind === "every") {
    return `every ${Math.max(1, Math.round(schedule.everyMs / 60_000))}m`;
  }
  return schedule.tz ? `${schedule.expr} (${schedule.tz})` : schedule.expr;
}

export function renderWorkflowSidebar(props: WorkflowSidebarProps) {
  const sessions = props.sessions?.sessions ?? [];
  const latestSessions = [...sessions]
    .toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 10);

  return html`
    <div class="sidebar-panel">
      <div class="sidebar-header">
        <div class="sidebar-title">Workflows</div>
        <button @click=${props.onClose} class="btn" title="Close sidebar">${icons.x}</button>
      </div>
      <div class="sidebar-content workflow-sidebar">
        <div class="workflow-toolbar">
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>Refresh</button>
          <button class="btn ghost" @click=${props.onOpenCronTab}>Open Cron Page</button>
          <button class="btn ghost" @click=${props.onOpenSessionsTab}>Open Sessions Page</button>
        </div>

        ${
          props.loading
            ? html`
                <div class="muted">Loading workflow data...</div>
              `
            : null
        }
        ${props.cronError ? html`<div class="callout danger">Cron: ${props.cronError}</div>` : null}
        ${
          props.sessionsError
            ? html`<div class="callout danger">Sessions: ${props.sessionsError}</div>`
            : null
        }

        <section class="workflow-section">
          <div class="workflow-section__title">Cron Jobs (${props.cronJobs.length})</div>
          ${
            props.cronJobs.length === 0
              ? html`
                  <div class="muted">No cron jobs found.</div>
                `
              : html`
                  <div class="list">
                    ${props.cronJobs.slice(0, 12).map(
                      (job) => html`
                        <article class="list-item workflow-item">
                          <div class="list-main">
                            <div class="list-title">${job.name}</div>
                            <div class="list-sub mono">${cronScheduleSummary(job)}</div>
                            <div class="list-sub">Next: ${formatMs(job.state?.nextRunAtMs)}</div>
                          </div>
                          <div class="workflow-actions">
                            <button
                              class="btn"
                              ?disabled=${props.cronBusy}
                              @click=${() => props.onCronRun(job)}
                            >
                              Run
                            </button>
                            <button
                              class="btn ghost"
                              ?disabled=${props.cronBusy}
                              @click=${() => props.onCronToggle(job, !job.enabled)}
                            >
                              ${job.enabled ? "Disable" : "Enable"}
                            </button>
                            <button
                              class="btn ghost danger"
                              ?disabled=${props.cronBusy}
                              @click=${() => props.onCronRemove(job)}
                            >
                              Remove
                            </button>
                          </div>
                        </article>
                      `,
                    )}
                  </div>
                `
          }
        </section>

        <section class="workflow-section">
          <div class="workflow-section__title">
            Subagents / Sessions (${props.sessions?.count ?? 0})
          </div>
          ${
            props.sessionsLoading
              ? html`
                  <div class="muted">Loading sessions...</div>
                `
              : null
          }
          ${
            latestSessions.length === 0
              ? html`
                  <div class="muted">No active sessions found.</div>
                `
              : html`
                  <div class="list">
                    ${latestSessions.map(
                      (session) => html`
                        <article class="list-item workflow-item workflow-item--session">
                          <div class="list-main">
                            <div class="list-title">${session.displayName || session.label || session.key}</div>
                            <div class="list-sub mono">${session.key}</div>
                          </div>
                          <div class="list-meta">
                            <div>${session.kind}</div>
                            <div title=${formatMs(session.updatedAt)}>
                              ${session.updatedAt ? formatMs(session.updatedAt) : "n/a"}
                            </div>
                          </div>
                        </article>
                      `,
                    )}
                  </div>
                `
          }
        </section>
      </div>
    </div>
  `;
}
