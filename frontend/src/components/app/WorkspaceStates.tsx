import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import type { LucideProps } from "lucide-react";
import { BRAND_NAME } from "../../config";
import { useI18n } from "../../i18n/I18nProvider";
import { navigateToAppUrl } from "../../routing";
import type { EventRecord } from "../../workspace/types";
import { FirstRunOnboarding } from "./CollectorOnboarding";

export function LoadingScreen() {
  const { t } = useI18n();
  return (
    <div
      aria-busy="true"
      aria-label={`${BRAND_NAME} · ${t("auth.loading")}`}
      aria-live="polite"
      className="app-shell"
      role="status"
    >
      <LoadingSidebar loadingLabel={t("auth.loading")} />

      <main className="page">
        <header className="page-header">
          <div>
            <h1>{t("project.projects")}</h1>
          </div>
        </header>

        <section className="projects-section" aria-label={t("project.projects")}>
          <ProjectListLoadingState />
        </section>
      </main>
    </div>
  );
}

function LoadingSidebar({ loadingLabel }: { loadingLabel: string }) {
  return (
    <aside className="sidebar sidebar-loading" aria-hidden="true">
      <div className="sidebar-header">
        <div className="sidebar-loading-brand">
          <span />
          <span />
        </div>
      </div>

      <div className="sidebar-content">
        <div className="sidebar-divider" />

        <nav className="sidebar-nav" aria-label={loadingLabel}>
          <div className="sidebar-loading-item">
            <span />
            <span />
          </div>
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <div className="sidebar-loading-item is-profile">
            <span />
            <span />
          </div>
          <div className="sidebar-loading-item">
            <span />
            <span />
          </div>
        </div>
      </div>
    </aside>
  );
}

export function EmptyState({
  children,
  description,
  eyebrow,
  icon: EmptyIcon,
  title,
}: {
  children?: ReactNode;
  description: string;
  eyebrow?: string;
  icon: ComponentType<LucideProps>;
  title: string;
}) {
  return (
    <section className="empty-state" aria-label={title}>
      <div className="empty-state-icon">
        <EmptyIcon aria-hidden="true" size={22} strokeWidth={1.5} />
      </div>
      <div className="empty-state-copy">
        {eyebrow ? <span className="empty-state-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children ? <div className="empty-state-body">{children}</div> : null}
    </section>
  );
}

export function EmptyProjectsState({
  onFirstEvent,
  pollingEnabled,
}: {
  onFirstEvent?: (event: EventRecord) => void;
  pollingEnabled?: boolean;
} = {}) {
  const isPreview =
    new URLSearchParams(window.location.search).get("preview") === "empty-projects";
  const openFirstActivity = onFirstEvent ?? ((event: EventRecord) => {
    const search = new URLSearchParams({
      project: event.project_id,
      tab: "ai-activity",
    });
    window.setTimeout(() => {
      const href = `${window.location.pathname}?${search.toString()}`;
      if (!navigateToAppUrl(href)) {
        window.location.assign(href);
      }
    }, 650);
  });

  return (
    <section
      className="empty-projects-state onboarding-shell"
      aria-labelledby="empty-projects-title"
    >
      <FirstRunOnboarding
        onFirstEvent={openFirstActivity}
        pollingEnabled={pollingEnabled ?? !isPreview}
      />
    </section>
  );
}

export function ProjectListLoadingState({ delayMs = 500 }: { delayMs?: number }) {
  const [shouldShow, setShouldShow] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setShouldShow(true);
      return;
    }

    setShouldShow(false);
    const timer = window.setTimeout(() => {
      setShouldShow(true);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="project-list-loading-state project-list-panel">
      <div className="project-loading-controls" aria-hidden="true">
        <div className="project-loading-search" />
        <div className="project-loading-sort" />
      </div>
      <ProjectGridSkeleton />
    </div>
  );
}

function ProjectGridSkeleton() {
  return (
    <div
      aria-label="Loading projects"
      aria-live="polite"
      className="project-table project-table-skeleton"
      role="status"
    >
      <div className="project-table-header" aria-hidden="true">
        <span>Project</span>
        <span>Last work</span>
        <span>Memory</span>
        <span>Activity</span>
        <span />
      </div>
      <div className="project-table-body">
        {Array.from({ length: 8 }, (_, index) => (
          <article aria-hidden="true" className="project-row" key={index}>
            <div className="project-row-main">
              {Array.from({ length: 4 }, (_, cellIndex) => (
                <span className="project-row-cell" key={cellIndex}>
                  <span className="skeleton-line skeleton-line-md" />
                  <span className="skeleton-line skeleton-line-sm" />
                </span>
              ))}
              <span className="skeleton-icon" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function RepositoryOptionsSkeleton() {
  return (
    <div
      aria-label="Loading GitHub repositories"
      aria-live="polite"
      className="repository-option-list repository-option-list-skeleton"
      role="status"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="repository-option repository-option-skeleton" key={index}>
          <span className="repository-option-main">
            <span className="skeleton-line skeleton-line-title" />
            <span className="skeleton-line skeleton-line-md" />
          </span>
          <span className="repository-option-meta">
            <span className="skeleton-pill skeleton-pill-count" />
            <span className="skeleton-pill" />
            <span className="skeleton-pill skeleton-pill-action" />
          </span>
        </div>
      ))}
    </div>
  );
}
