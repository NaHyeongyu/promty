import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import type { LucideProps } from "lucide-react";
import { BRAND_NAME } from "../../config";
import { setupCommandText, SetupCommandBlock } from "./SetupCommandBlock";

export function LoadingScreen() {
  return (
    <div
      aria-busy="true"
      aria-label={`Loading ${BRAND_NAME} workspace`}
      aria-live="polite"
      className="app-shell"
      role="status"
    >
      <LoadingSidebar />

      <main className="page">
        <header className="page-header">
          <div>
            <h1>Projects</h1>
          </div>
        </header>

        <section className="projects-section" aria-label="Projects">
          <ProjectListLoadingState />
        </section>
      </main>
    </div>
  );
}

function LoadingSidebar() {
  return (
    <aside className="sidebar sidebar-loading" aria-hidden="true">
      <div className="sidebar-header">
        <div className="sidebar-loading-brand">
          <span />
          <span />
        </div>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav" aria-label="Loading navigation">
        <div className="sidebar-loading-item">
          <span />
          <span />
        </div>
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-divider" />

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

export function EmptyProjectsState() {
  return (
    <section className="empty-projects-state" aria-labelledby="empty-projects-title">
      <div className="empty-projects-copy">
        <h2 id="empty-projects-title">No projects yet</h2>
        <p>Run this from a project directory to link the repository and install local AI tool hooks.</p>
      </div>
      <SetupCommandBlock command={setupCommandText()} />
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
    <div className="project-list-loading-state">
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
      className="projects-grid project-grid-skeleton"
      role="status"
    >
      {Array.from({ length: 12 }, (_, index) => (
        <article
          aria-hidden="true"
          className="project-card project-card-skeleton"
          key={index}
        >
          <div className="project-card-header">
            <span className="skeleton-line skeleton-line-title" />
            <span className="skeleton-pill" />
          </div>

          <div className="skeleton-stack">
            <span className="skeleton-line skeleton-line-sm" />
            <span className="skeleton-line skeleton-line-md" />
          </div>

          <div className="project-stats skeleton-stats">
            <span />
            <span />
            <span />
          </div>

          <div className="skeleton-badge-row">
            <span />
            <span />
            <span />
          </div>
        </article>
      ))}
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
