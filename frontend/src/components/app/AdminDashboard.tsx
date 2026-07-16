import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Folder,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  User,
} from "lucide-react";
import {
  formatCompactNumber,
  formatOptionalTimestamp,
  formatRelativeTimestamp,
} from "../../lib/formatters";
import type { AdminOverview } from "../../workspace/types";

function severityLabel(value: string) {
  if (value === "high") {
    return "Critical";
  }
  if (value === "medium") {
    return "Warning";
  }
  return "Info";
}

export function AdminDashboard({
  errorMessage,
  isLoading,
  onOpenProject,
  onRefresh,
  overview,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  onOpenProject?: (projectId: string) => void;
  onRefresh: () => void;
  overview: AdminOverview | null;
}) {
  const metrics = overview?.metrics;
  const metricCards = [
    {
      icon: User,
      label: "Users",
      sublabel: `${formatCompactNumber(metrics?.github_connections ?? 0)} GitHub linked`,
      value: formatCompactNumber(metrics?.users ?? 0),
    },
    {
      icon: Folder,
      label: "Projects",
      sublabel: `${formatCompactNumber(metrics?.projects_without_repo ?? 0)} without repo`,
      value: formatCompactNumber(metrics?.projects ?? 0),
    },
    {
      icon: Activity,
      label: "Events",
      sublabel: `${formatCompactNumber(metrics?.events_24h ?? 0)} last 24h`,
      value: formatCompactNumber(metrics?.events ?? 0),
    },
    {
      icon: Bot,
      label: "AI Traffic",
      sublabel: `${formatCompactNumber(overview?.ai_activity.response_gap ?? 0)} missing`,
      value: formatCompactNumber(metrics?.prompts ?? 0),
    },
    {
      icon: Database,
      label: "Memory",
      sublabel: `${formatCompactNumber(metrics?.pending_memory_drafts ?? 0)} pending`,
      value: formatCompactNumber(metrics?.memory_artifacts ?? 0),
    },
    {
      icon: ServerCog,
      label: "Jobs",
      sublabel: `${formatCompactNumber(metrics?.failed_jobs ?? 0)} failed`,
      value: formatCompactNumber(
        (metrics?.pending_jobs ?? 0) + (metrics?.running_jobs ?? 0),
      ),
    },
  ];
  const actionItems = overview?.action_items ?? [];
  const sessionGaps = overview?.ai_activity.session_gaps ?? [];
  const recentMemory = overview?.memory_monitor.recent_artifacts ?? [];
  const recentAdminAuditLogs = overview?.recent_admin_audit_logs ?? [];

  if (!overview) {
    return (
      <section className="admin-console" aria-label="Admin console">
        <div
          className="auth-message"
          data-error={errorMessage ? "true" : undefined}
          role={errorMessage ? "alert" : "status"}
        >
          {errorMessage ?? "Loading administrator overview…"}
        </div>
        {errorMessage ? (
          <button className="toolbar-button" onClick={onRefresh} type="button">
            <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>Retry</span>
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="admin-console" aria-label="Admin console">
      <div className="admin-command-bar">
        <div>
          <span className="admin-kicker">Admin</span>
          <h2>Operations Dashboard</h2>
        </div>
        <div className="admin-command-actions">
          <span className="status-pill">
            {overview?.generated_at
              ? `Updated ${formatOptionalTimestamp(overview.generated_at, "now")}`
              : "Standing by"}
          </span>
          <button
            className="toolbar-button"
            disabled={isLoading}
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>{isLoading ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="auth-message" data-error="true">
          {errorMessage}
        </div>
      ) : null}

      <div className="admin-metric-grid">
        {metricCards.map((metric) => {
          const MetricIcon = metric.icon;
          return (
            <div className="admin-metric" key={metric.label}>
              <MetricIcon aria-hidden="true" size={18} strokeWidth={1.5} />
              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.sublabel}</small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="admin-grid">
        <section className="admin-panel is-span-2" aria-label="Action items">
          <div className="admin-panel-header">
            <h3>Needs Attention</h3>
            <span>{actionItems.length}</span>
          </div>
          <div className="admin-action-list">
            {actionItems.length > 0 ? (
              actionItems.map((item) => (
                <div
                  className="admin-action-item"
                  data-severity={item.severity}
                  key={`${item.area}-${item.title}`}
                >
                  <AlertTriangle aria-hidden="true" size={17} strokeWidth={1.5} />
                  <div>
                    <span>
                      {severityLabel(item.severity)} · {item.area}
                    </span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  {item.count !== null ? (
                    <strong className="admin-action-count">
                      {formatCompactNumber(item.count)}
                    </strong>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="admin-empty-line">
                <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.5} />
                No urgent admin actions.
              </div>
            )}
          </div>
        </section>

        <section className="admin-panel" aria-label="System posture">
          <div className="admin-panel-header">
            <h3>System Posture</h3>
            <span>{overview?.system.admin_configured ? "Locked" : "Unconfigured"}</span>
          </div>
          <dl className="admin-kv-list">
            <div>
              <dt>Memory</dt>
              <dd>
                {overview?.system.memory_generators
                  ? `${overview.system.memory_generators.draft ?? "unknown"} / ${
                      overview.system.memory_generators.project ?? "unknown"
                    }`
                  : "unknown"}
              </dd>
            </div>
            <div>
              <dt>Gemini</dt>
              <dd>{overview?.system.gemini_configured ? "configured" : "off"}</dd>
            </div>
            <div>
              <dt>OpenAI</dt>
              <dd>{overview?.system.openai_configured ? "configured" : "off"}</dd>
            </div>
            <div>
              <dt>Cookie</dt>
              <dd>{overview?.system.session_cookie_secure ? "secure" : "dev"}</dd>
            </div>
            <div>
              <dt>Collectors</dt>
              <dd>{formatCompactNumber(metrics?.active_collector_tokens ?? 0)} active</dd>
            </div>
            <div>
              <dt>Admin limit</dt>
              <dd>
                {overview?.system.admin_rate_limit
                  ? `${overview.system.admin_rate_limit.requests}/${overview.system.admin_rate_limit.window_seconds}s`
                  : "unknown"}
              </dd>
            </div>
            <div>
              <dt>Audit retention</dt>
              <dd>{overview?.system.admin_audit_retention_days ?? 0} days</dd>
            </div>
          </dl>
        </section>

        <section className="admin-panel is-span-2" aria-label="Administrator audit log">
          <div className="admin-panel-header">
            <h3>Administrator Audit</h3>
            <span>{recentAdminAuditLogs.length} recent</span>
          </div>
          <div className="admin-audit-list">
            {recentAdminAuditLogs.length > 0 ? (
              recentAdminAuditLogs.map((audit) => (
                <div className="admin-audit-row" key={audit.id}>
                  <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
                  <div>
                    <strong>{audit.action}</strong>
                    <span>{audit.request_path}</span>
                    <small>
                      {audit.actor.username} · {audit.request_method} · HTTP {audit.status_code} ·{" "}
                      {formatOptionalTimestamp(audit.created_at, "Unknown")}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-empty-line">No administrator access has been recorded yet.</div>
            )}
          </div>
        </section>

        <section className="admin-panel is-span-2" aria-label="Recent projects">
          <div className="admin-panel-header">
            <h3>Project Operations</h3>
            <span>{overview?.recent_projects.length ?? 0} visible</span>
          </div>
          <div className="admin-table">
            <div className="admin-table-row is-head">
              <span>Project</span>
              <span>Owner</span>
              <span>Usage</span>
              <span>State</span>
            </div>
            {(overview?.recent_projects ?? []).map((project) => (
              <button
                aria-label={`Open ${project.name}`}
                className="admin-table-row admin-table-action-row"
                disabled={!onOpenProject}
                key={project.id}
                onClick={() => onOpenProject?.(project.id)}
                type="button"
              >
                <span>
                  <strong>{project.name}</strong>
                  <small>
                    {project.latest_event_at
                      ? formatRelativeTimestamp(project.latest_event_at)
                      : "No activity"}
                  </small>
                </span>
                <span>{project.owner.username}</span>
                <span>
                  <strong>{formatCompactNumber(project.counts.prompts)} prompts</strong>
                  <small>{formatCompactNumber(project.counts.memory)} summaries</small>
                </span>
                <span>
                  <span className="admin-state-dot" data-on={project.github_connected} />
                  {project.failed_jobs > 0
                    ? `${project.failed_jobs} failed jobs`
                    : project.github_connected
                      ? "Repo linked"
                      : "No repo"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-label="AI activity monitor">
          <div className="admin-panel-header">
            <h3>AI Activity</h3>
            <span>{formatCompactNumber(overview?.ai_activity.prompts_24h ?? 0)} prompts 24h</span>
          </div>
          <div className="admin-monitor-list">
            <div className="admin-monitor-summary">
              <div>
                <span>Responses 24h</span>
                <strong>{formatCompactNumber(overview?.ai_activity.responses_24h ?? 0)}</strong>
              </div>
              <div>
                <span>Missing total</span>
                <strong>{formatCompactNumber(overview?.ai_activity.response_gap ?? 0)}</strong>
              </div>
            </div>
            {sessionGaps.length > 0 ? (
              sessionGaps.map((gap) => (
                <div className="admin-feed-item" key={gap.session_id}>
                  <span>{gap.project.name}</span>
                  <strong>{gap.missing_responses} missing</strong>
                  <small>
                    {gap.user.username} · {gap.tool ?? "unknown"} ·{" "}
                    {formatOptionalTimestamp(gap.latest_event_at, "Unknown")}
                  </small>
                </div>
              ))
            ) : (
              <div className="admin-empty-line">
                <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.5} />
                No response gaps detected.
              </div>
            )}
          </div>
        </section>

        <section className="admin-panel" aria-label="Memory monitor">
          <div className="admin-panel-header">
            <h3>Memory Monitor</h3>
            <span>{formatCompactNumber(overview?.memory_monitor.pending_drafts ?? 0)} pending</span>
          </div>
          <div className="admin-monitor-list">
            <div className="admin-monitor-summary">
              <div>
                <span>Generated 24h</span>
                <strong>{formatCompactNumber(overview?.memory_monitor.summaries_24h ?? 0)}</strong>
              </div>
              <div>
                <span>Failed jobs</span>
                <strong>{formatCompactNumber(overview?.memory_monitor.failed_jobs ?? 0)}</strong>
              </div>
            </div>
            {recentMemory.length > 0 ? (
              recentMemory.map((artifact) => (
                <div className="admin-feed-item" key={artifact.id}>
                  <span>{artifact.project.name}</span>
                  <strong>{artifact.title}</strong>
                  <small>
                    {artifact.changed_file_count} files ·{" "}
                    {formatOptionalTimestamp(artifact.updated_at, "Unknown")}
                  </small>
                </div>
              ))
            ) : (
              <div className="admin-empty-line">No generated summaries yet.</div>
            )}
          </div>
        </section>

        <section className="admin-panel" aria-label="Recent users">
          <div className="admin-panel-header">
            <h3>User Operations</h3>
            <span>{overview?.recent_users.length ?? 0}</span>
          </div>
          <div className="admin-user-list">
            {(overview?.recent_users ?? []).map((user) => (
              <div className="admin-user-row" key={user.id}>
                <span className="sidebar-avatar" aria-hidden="true">
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{user.username}</strong>
                  <small>
                    {user.project_count} projects · {formatCompactNumber(user.prompt_count)} prompts
                  </small>
                  <small>
                    <Clock3 aria-hidden="true" size={12} strokeWidth={1.5} />
                    {user.latest_activity_at
                      ? formatRelativeTimestamp(user.latest_activity_at)
                      : "No activity"}
                  </small>
                </div>
                <span className="admin-state-dot" data-on={user.github_connected} />
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-label="Risk register">
          <div className="admin-panel-header">
            <h3>Risk Register</h3>
            <span>{overview?.risks.length ?? 0}</span>
          </div>
          <div className="admin-risk-list">
            {(overview?.risks ?? []).length > 0 ? (
              overview?.risks.map((risk) => (
                <div className="admin-risk" data-severity={risk.severity} key={risk.title}>
                  <AlertTriangle aria-hidden="true" size={16} strokeWidth={1.5} />
                  <div>
                    <strong>{risk.title}</strong>
                    <span>{risk.detail}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-empty-line">No active configuration risks.</div>
            )}
          </div>
        </section>

        <section className="admin-panel" aria-label="Event types">
          <div className="admin-panel-header">
            <h3>Event Types</h3>
            <span>Ranked</span>
          </div>
          <div className="admin-breakdown">
            {(overview?.breakdowns.events_by_type ?? []).map((item) => (
              <div key={item.key}>
                <span>{item.key}</span>
                <strong>{formatCompactNumber(item.count)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-label="Recent events">
          <div className="admin-panel-header">
            <h3>Live Feed</h3>
            <span>{overview?.recent_events.length ?? 0}</span>
          </div>
          <div className="admin-feed">
            {(overview?.recent_events ?? []).map((event) => (
              <div className="admin-feed-item" key={event.id}>
                <span>{event.event_type}</span>
                <strong>{event.tool}</strong>
                <small>
                  #{event.sequence} · {formatOptionalTimestamp(event.created_at, "Unknown")}
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
