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
import { useAdminLocale } from "../../i18n/useAdminLocale";
import type { AdminOverview } from "../../workspace/types";

function severityLabel(value: string, korean: boolean) {
  if (value === "high") {
    return korean ? "심각" : "Critical";
  }
  if (value === "medium") {
    return korean ? "경고" : "Warning";
  }
  return korean ? "정보" : "Info";
}

export function AdminDashboard({
  errorMessage,
  isLoading,
  onOpenActionItem,
  onOpenProject,
  onRefresh,
  overview,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  onOpenActionItem?: (item: AdminOverview["action_items"][number]) => void;
  onOpenProject?: (projectId: string) => void;
  onRefresh: () => void;
  overview: AdminOverview | null;
}) {
  const { locale, serverText, text } = useAdminLocale();
  const metrics = overview?.metrics;
  const metricCards = [
    {
      icon: User,
      label: text("Users", "사용자"),
      sublabel: text(`${formatCompactNumber(metrics?.github_connections ?? 0)} GitHub linked`, `GitHub 연결 ${formatCompactNumber(metrics?.github_connections ?? 0)}개`),
      value: formatCompactNumber(metrics?.users ?? 0),
    },
    {
      icon: Folder,
      label: text("Projects", "프로젝트"),
      sublabel: text(`${formatCompactNumber(metrics?.projects_without_repo ?? 0)} without repo`, `저장소 없음 ${formatCompactNumber(metrics?.projects_without_repo ?? 0)}개`),
      value: formatCompactNumber(metrics?.projects ?? 0),
    },
    {
      icon: Activity,
      label: text("Events", "이벤트"),
      sublabel: text(`${formatCompactNumber(metrics?.events_24h ?? 0)} last 24h`, `최근 24시간 ${formatCompactNumber(metrics?.events_24h ?? 0)}개`),
      value: formatCompactNumber(metrics?.events ?? 0),
    },
    {
      icon: Bot,
      label: text("AI Traffic", "AI 활동"),
      sublabel: text(`${formatCompactNumber(overview?.ai_activity.response_gap ?? 0)} missing`, `응답 누락 ${formatCompactNumber(overview?.ai_activity.response_gap ?? 0)}개`),
      value: formatCompactNumber(metrics?.prompts ?? 0),
    },
    {
      icon: Database,
      label: text("Memory", "메모리"),
      sublabel: text(`${formatCompactNumber(metrics?.pending_memory_drafts ?? 0)} pending`, `대기 ${formatCompactNumber(metrics?.pending_memory_drafts ?? 0)}개`),
      value: formatCompactNumber(metrics?.memory_artifacts ?? 0),
    },
    {
      icon: ServerCog,
      label: text("Jobs", "작업"),
      sublabel: text(`${formatCompactNumber(metrics?.failed_jobs ?? 0)} failed`, `실패 ${formatCompactNumber(metrics?.failed_jobs ?? 0)}개`),
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
      <section className="admin-console" aria-label={text("Admin console", "관리자 콘솔")}>
        <div
          className="auth-message"
          data-error={errorMessage ? "true" : undefined}
          role={errorMessage ? "alert" : "status"}
        >
          {errorMessage ?? text("Loading administrator overview…", "관리자 개요를 불러오는 중…")}
        </div>
        {errorMessage ? (
          <button className="toolbar-button" onClick={onRefresh} type="button">
            <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>{text("Retry", "다시 시도")}</span>
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="admin-console" aria-label={text("Admin console", "관리자 콘솔")}>
      <div className="admin-command-bar">
        <div>
          <span className="admin-kicker">{text("Admin", "관리자")}</span>
          <h2>{text("Operations Dashboard", "운영 대시보드")}</h2>
        </div>
        <div className="admin-command-actions">
          <span className="status-pill">
            {overview?.generated_at
              ? text(`Updated ${formatOptionalTimestamp(overview.generated_at, "now")}`, `업데이트 ${formatOptionalTimestamp(overview.generated_at, "현재")}`)
              : text("Standing by", "대기 중")}
          </span>
          <button
            className="toolbar-button"
            disabled={isLoading}
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>{isLoading ? text("Refreshing", "새로고침 중") : text("Refresh", "새로고침")}</span>
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
        <section className="admin-panel is-span-2" aria-label={text("Action items", "조치 항목")}>
          <div className="admin-panel-header">
            <h3>{text("Needs Attention", "확인 필요")}</h3>
            <span>{actionItems.length}</span>
          </div>
          <div className="admin-action-list">
            {actionItems.length > 0 ? (
              actionItems.map((item) => (
                <button
                  className="admin-action-item"
                  data-severity={item.severity}
                  key={`${item.area}-${item.title}`}
                  onClick={() => onOpenActionItem?.(item)}
                  type="button"
                >
                  <AlertTriangle aria-hidden="true" size={17} strokeWidth={1.5} />
                  <div>
                    <span>
                      {severityLabel(item.severity, locale === "ko")} · {serverText(item.area)}
                    </span>
                    <strong>{serverText(item.title)}</strong>
                    <small>{serverText(item.detail)}</small>
                  </div>
                  {item.count !== null ? (
                    <strong className="admin-action-count">
                      {formatCompactNumber(item.count)}
                    </strong>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="admin-empty-line">
                <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.5} />
                {text("No urgent admin actions.", "긴급한 관리자 조치가 없습니다.")}
              </div>
            )}
          </div>
        </section>

        <section className="admin-panel" aria-label={text("System posture", "시스템 상태")}>
          <div className="admin-panel-header">
            <h3>{text("System Posture", "시스템 상태")}</h3>
            <span>{overview?.system.admin_configured ? text("Locked", "잠금") : text("Unconfigured", "미설정")}</span>
          </div>
          <dl className="admin-kv-list">
            <div>
              <dt>{text("Memory", "메모리")}</dt>
              <dd>
                {overview?.system.memory_generators
                  ? `${overview.system.memory_generators.draft ?? "unknown"} / ${
                      overview.system.memory_generators.project ?? "unknown"
                    }`
                  : text("unknown", "알 수 없음")}
              </dd>
            </div>
            <div>
              <dt>Gemini</dt>
              <dd>{overview?.system.gemini_configured ? text("configured", "설정됨") : text("off", "꺼짐")}</dd>
            </div>
            <div>
              <dt>OpenAI</dt>
              <dd>{overview?.system.openai_configured ? text("configured", "설정됨") : text("off", "꺼짐")}</dd>
            </div>
            <div>
              <dt>{text("Cookie", "쿠키")}</dt>
              <dd>{overview?.system.session_cookie_secure ? text("secure", "보안") : text("dev", "개발")}</dd>
            </div>
            <div>
              <dt>{text("Collectors", "수집기")}</dt>
              <dd>{text(`${formatCompactNumber(metrics?.active_collector_tokens ?? 0)} active`, `활성 ${formatCompactNumber(metrics?.active_collector_tokens ?? 0)}개`)}</dd>
            </div>
            <div>
              <dt>{text("Admin limit", "관리자 요청 제한")}</dt>
              <dd>
                {overview?.system.admin_rate_limit
                  ? `${overview.system.admin_rate_limit.requests}/${overview.system.admin_rate_limit.window_seconds}s`
                  : "unknown"}
              </dd>
            </div>
            <div>
              <dt>{text("Audit retention", "감사 로그 보존")}</dt>
              <dd>{text(`${overview?.system.admin_audit_retention_days ?? 0} days`, `${overview?.system.admin_audit_retention_days ?? 0}일`)}</dd>
            </div>
          </dl>
        </section>

        <section className="admin-panel is-span-2" aria-label={text("Administrator audit log", "관리자 감사 로그")}>
          <div className="admin-panel-header">
            <h3>{text("Administrator Audit", "관리자 감사")}</h3>
            <span>{text(`${recentAdminAuditLogs.length} recent`, `최근 ${recentAdminAuditLogs.length}개`)}</span>
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
                      {formatOptionalTimestamp(audit.created_at, text("Unknown", "알 수 없음"))}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-empty-line">{text("No administrator access has been recorded yet.", "아직 기록된 관리자 접근이 없습니다.")}</div>
            )}
          </div>
        </section>

        <section className="admin-panel is-span-2" aria-label={text("Recent projects", "최근 프로젝트")}>
          <div className="admin-panel-header">
            <h3>{text("Project Operations", "프로젝트 운영")}</h3>
            <span>{text(`${overview?.recent_projects.length ?? 0} visible`, `${overview?.recent_projects.length ?? 0}개 표시`)}</span>
          </div>
          <div className="admin-table">
            <div className="admin-table-row is-head">
              <span>{text("Project", "프로젝트")}</span>
              <span>{text("Owner", "소유자")}</span>
              <span>{text("Usage", "사용량")}</span>
              <span>{text("State", "상태")}</span>
            </div>
            {(overview?.recent_projects ?? []).map((project) => (
              <button
                aria-label={text(`Open ${project.name}`, `${project.name} 열기`)}
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
                      : text("No activity", "활동 없음")}
                  </small>
                </span>
                <span>{project.owner.username}</span>
                <span>
                  <strong>{text(`${formatCompactNumber(project.counts.prompts)} prompts`, `프롬프트 ${formatCompactNumber(project.counts.prompts)}개`)}</strong>
                  <small>{text(`${formatCompactNumber(project.counts.memory)} summaries`, `요약 ${formatCompactNumber(project.counts.memory)}개`)}</small>
                </span>
                <span>
                  <span className="admin-state-dot" data-on={project.github_connected} />
                  {project.failed_jobs > 0
                    ? text(`${project.failed_jobs} failed jobs`, `실패 작업 ${project.failed_jobs}개`)
                    : project.github_connected
                      ? text("Repo linked", "저장소 연결됨")
                      : text("No repo", "저장소 없음")}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-label={text("AI activity monitor", "AI 활동 모니터")}>
          <div className="admin-panel-header">
            <h3>{text("AI Activity", "AI 활동")}</h3>
            <span>{text(`${formatCompactNumber(overview?.ai_activity.prompts_24h ?? 0)} prompts 24h`, `24시간 프롬프트 ${formatCompactNumber(overview?.ai_activity.prompts_24h ?? 0)}개`)}</span>
          </div>
          <div className="admin-monitor-list">
            <div className="admin-monitor-summary">
              <div>
                <span>{text("Responses 24h", "24시간 응답")}</span>
                <strong>{formatCompactNumber(overview?.ai_activity.responses_24h ?? 0)}</strong>
              </div>
              <div>
                <span>{text("Missing total", "전체 누락")}</span>
                <strong>{formatCompactNumber(overview?.ai_activity.response_gap ?? 0)}</strong>
              </div>
            </div>
            {sessionGaps.length > 0 ? (
              sessionGaps.map((gap) => (
                <div className="admin-feed-item" key={gap.session_id}>
                  <span>{gap.project.name}</span>
                  <strong>{text(`${gap.missing_responses} missing`, `${gap.missing_responses}개 누락`)}</strong>
                  <small>
                    {gap.user.username} · {gap.tool ?? text("unknown", "알 수 없음")} ·{" "}
                    {formatOptionalTimestamp(gap.latest_event_at, text("Unknown", "알 수 없음"))}
                  </small>
                </div>
              ))
            ) : (
              <div className="admin-empty-line">
                <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.5} />
                {text("No response gaps detected.", "응답 누락이 감지되지 않았습니다.")}
              </div>
            )}
          </div>
        </section>

        <section className="admin-panel" aria-label={text("Memory monitor", "메모리 모니터")}>
          <div className="admin-panel-header">
            <h3>{text("Memory Monitor", "메모리 모니터")}</h3>
            <span>{text(`${formatCompactNumber(overview?.memory_monitor.pending_drafts ?? 0)} pending`, `대기 ${formatCompactNumber(overview?.memory_monitor.pending_drafts ?? 0)}개`)}</span>
          </div>
          <div className="admin-monitor-list">
            <div className="admin-monitor-summary">
              <div>
                <span>{text("Generated 24h", "24시간 생성")}</span>
                <strong>{formatCompactNumber(overview?.memory_monitor.summaries_24h ?? 0)}</strong>
              </div>
              <div>
                <span>{text("Failed jobs", "실패 작업")}</span>
                <strong>{formatCompactNumber(overview?.memory_monitor.failed_jobs ?? 0)}</strong>
              </div>
            </div>
            {recentMemory.length > 0 ? (
              recentMemory.map((artifact) => (
                <div className="admin-feed-item" key={artifact.id}>
                  <span>{artifact.project.name}</span>
                  <strong>{artifact.title}</strong>
                  <small>
                    {text(`${artifact.changed_file_count} files`, `파일 ${artifact.changed_file_count}개`)} ·{" "}
                    {formatOptionalTimestamp(artifact.updated_at, text("Unknown", "알 수 없음"))}
                  </small>
                </div>
              ))
            ) : (
              <div className="admin-empty-line">{text("No generated summaries yet.", "아직 생성된 요약이 없습니다.")}</div>
            )}
          </div>
        </section>

        <section className="admin-panel" aria-label={text("Recent users", "최근 사용자")}>
          <div className="admin-panel-header">
            <h3>{text("User Operations", "사용자 운영")}</h3>
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
                    {text(`${user.project_count} projects · ${formatCompactNumber(user.prompt_count)} prompts`, `프로젝트 ${user.project_count}개 · 프롬프트 ${formatCompactNumber(user.prompt_count)}개`)}
                  </small>
                  <small>
                    <Clock3 aria-hidden="true" size={12} strokeWidth={1.5} />
                    {user.latest_activity_at
                      ? formatRelativeTimestamp(user.latest_activity_at)
                      : text("No activity", "활동 없음")}
                  </small>
                </div>
                <span className="admin-state-dot" data-on={user.github_connected} />
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-label={text("Risk register", "위험 항목")}>
          <div className="admin-panel-header">
            <h3>{text("Risk Register", "위험 항목")}</h3>
            <span>{overview?.risks.length ?? 0}</span>
          </div>
          <div className="admin-risk-list">
            {(overview?.risks ?? []).length > 0 ? (
              overview?.risks.map((risk) => (
                <div className="admin-risk" data-severity={risk.severity} key={risk.title}>
                  <AlertTriangle aria-hidden="true" size={16} strokeWidth={1.5} />
                  <div>
                    <strong>{serverText(risk.title)}</strong>
                    <span>{serverText(risk.detail)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-empty-line">{text("No active configuration risks.", "현재 활성화된 설정 위험이 없습니다.")}</div>
            )}
          </div>
        </section>

        <section className="admin-panel" aria-label={text("Event types", "이벤트 유형")}>
          <div className="admin-panel-header">
            <h3>{text("Event Types", "이벤트 유형")}</h3>
            <span>{text("Ranked", "순위")}</span>
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

        <section className="admin-panel" aria-label={text("Recent events", "최근 이벤트")}>
          <div className="admin-panel-header">
            <h3>{text("Live Feed", "실시간 피드")}</h3>
            <span>{overview?.recent_events.length ?? 0}</span>
          </div>
          <div className="admin-feed">
            {(overview?.recent_events ?? []).map((event) => (
              <div className="admin-feed-item" key={event.id}>
                <span>{event.event_type}</span>
                <strong>{event.tool}</strong>
                <small>
                  #{event.sequence} · {formatOptionalTimestamp(event.created_at, text("Unknown", "알 수 없음"))}
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
