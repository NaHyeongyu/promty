import {
  Activity,
  AlertTriangle,
  Bot,
  Database,
  Folder,
  KeyRound,
  RefreshCw,
  User,
} from "lucide-react";
import {
  formatCompactNumber,
  formatOptionalTimestamp,
  formatRelativeTimestamp,
} from "../../lib/formatters";
import type { AdminOverview } from "../../workspace/types";

export function AdminDashboard({
  errorMessage,
  isLoading,
  onRefresh,
  overview,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  onRefresh: () => void;
  overview: AdminOverview | null;
}) {
  const metrics = overview?.metrics;
  const metricCards = [
    {
      icon: User,
      label: "Users",
      sublabel: `${formatCompactNumber(metrics?.github_connections ?? 0)} GitHub links`,
      value: formatCompactNumber(metrics?.users ?? 0),
    },
    {
      icon: Folder,
      label: "Projects",
      sublabel: `${formatCompactNumber(metrics?.tracked_files ?? 0)} tracked files`,
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
      sublabel: `${formatCompactNumber(metrics?.responses ?? 0)} responses`,
      value: formatCompactNumber(metrics?.prompts ?? 0),
    },
    {
      icon: Database,
      label: "Memory",
      sublabel: `${formatCompactNumber(metrics?.sessions ?? 0)} sessions`,
      value: formatCompactNumber(metrics?.memory_artifacts ?? 0),
    },
    {
      icon: KeyRound,
      label: "Collectors",
      sublabel: "Active ingest tokens",
      value: formatCompactNumber(metrics?.active_collector_tokens ?? 0),
    },
  ];

  return (
    <section className="admin-console" aria-label="Admin console">
      <div className="admin-command-bar">
        <div>
          <span className="admin-kicker">Command surface</span>
          <h2>Operational control</h2>
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
        <section className="admin-panel is-span-2" aria-label="Recent projects">
          <div className="admin-panel-header">
            <h3>Project Operations</h3>
            <span>{overview?.recent_projects.length ?? 0} visible</span>
          </div>
          <div className="admin-table">
            <div className="admin-table-row is-head">
              <span>Project</span>
              <span>Owner</span>
              <span>Events</span>
              <span>State</span>
            </div>
            {(overview?.recent_projects ?? []).map((project) => (
              <div className="admin-table-row" key={project.id}>
                <span>
                  <strong>{project.name}</strong>
                  <small>
                    {project.latest_event_at
                      ? formatRelativeTimestamp(project.latest_event_at)
                      : "No activity"}
                  </small>
                </span>
                <span>{project.owner.username}</span>
                <span>{formatCompactNumber(project.counts.events)}</span>
                <span>
                  <span className="admin-state-dot" data-on={project.github_connected} />
                  {project.github_connected ? "Repo linked" : "No repo"}
                </span>
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

        <section className="admin-panel" aria-label="System controls">
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
              <dt>Community</dt>
              <dd>{overview?.system.published_flows_enabled ? "on" : "paused"}</dd>
            </div>
          </dl>
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

        <section className="admin-panel" aria-label="Recent users">
          <div className="admin-panel-header">
            <h3>Users</h3>
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
                  <small>{user.email ?? "No email"} · {user.project_count} projects</small>
                </div>
                <span className="admin-state-dot" data-on={user.github_connected} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
