import type { ReactNode } from "react";
import {
  Bot,
  Clock,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { formatCompactNumber } from "../../lib/formatters";
import type { Project, ProjectSortMode } from "../../workspace/types";
import { AiModelBadge } from "../project-detail";
import { GitHubIcon } from "./Branding";
import {
  EmptyProjectsState,
  EmptyState,
  ProjectListLoadingState,
} from "./WorkspaceStates";

export function ProjectsPage({
  activeTitle,
  displayProjects,
  errorMessage,
  isEventsLoading,
  onClearSearch,
  onOpenProject,
  onOpenRepositoryConnector,
  onRetry,
  onSearchChange,
  onSortModeChange,
  previewEmptyProjects,
  previewProjectLoading,
  projectSearchQuery,
  projectSortMode,
  repositoryConnector,
  visibleProjects,
}: {
  activeTitle: string;
  displayProjects: Project[];
  errorMessage: string | null;
  isEventsLoading: boolean;
  onClearSearch: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenRepositoryConnector: () => void;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  onSortModeChange: (mode: ProjectSortMode) => void;
  previewEmptyProjects: boolean;
  previewProjectLoading: boolean;
  projectSearchQuery: string;
  projectSortMode: ProjectSortMode;
  repositoryConnector: ReactNode;
  visibleProjects: Project[];
}) {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>{activeTitle}</h1>
        </div>
        <div className="page-actions">
          <button
            className="toolbar-button"
            onClick={onOpenRepositoryConnector}
            type="button"
          >
            <Plus aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>New Project</span>
          </button>
        </div>
      </header>

      {repositoryConnector}

      <section className="projects-section" aria-label="Projects">
        {previewProjectLoading ? (
          <ProjectListLoadingState delayMs={0} />
        ) : isEventsLoading && displayProjects.length === 0 && !previewEmptyProjects ? (
          <ProjectListLoadingState />
        ) : errorMessage ? (
          <EmptyState
            description={errorMessage}
            eyebrow="Sync issue"
            icon={RefreshCw}
            title="Could not load events"
          >
            <button
              className="empty-state-button"
              disabled={isEventsLoading}
              onClick={onRetry}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>{isEventsLoading ? "Retrying" : "Retry"}</span>
            </button>
          </EmptyState>
        ) : displayProjects.length === 0 ? (
          <EmptyProjectsState />
        ) : (
          <>
            <div className="project-controls">
              <label className="project-search-control">
                <span className="bh-visually-hidden">Search projects</span>
                <Search aria-hidden="true" size={16} strokeWidth={1.5} />
                <input
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Search projects"
                  type="search"
                  value={projectSearchQuery}
                />
              </label>

              <div className="project-sort-control" aria-label="Sort projects">
                <button
                  aria-pressed={projectSortMode === "recent"}
                  data-active={projectSortMode === "recent"}
                  onClick={() => onSortModeChange("recent")}
                  type="button"
                >
                  Recent work
                </button>
                <button
                  aria-pressed={projectSortMode === "added"}
                  data-active={projectSortMode === "added"}
                  onClick={() => onSortModeChange("added")}
                  type="button"
                >
                  Added
                </button>
              </div>
            </div>

            {visibleProjects.length === 0 ? (
              <section
                className="project-search-empty"
                aria-labelledby="project-search-empty-title"
              >
                <div className="project-search-empty-icon" aria-hidden="true">
                  <Search size={18} strokeWidth={1.5} />
                </div>
                <div className="project-search-empty-copy">
                  <span>No matches</span>
                  <h2 id="project-search-empty-title">No projects found</h2>
                  <p>
                    No project names match <code>{projectSearchQuery.trim()}</code>.
                  </p>
                </div>
                <button className="toolbar-button" onClick={onClearSearch} type="button">
                  <X aria-hidden="true" size={15} strokeWidth={1.5} />
                  <span>Clear search</span>
                </button>
              </section>
            ) : (
              <div
                aria-busy={isEventsLoading || undefined}
                className="projects-grid loading-cascade"
                data-loading={isEventsLoading ? "true" : undefined}
              >
                {visibleProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    onOpen={onOpenProject}
                    project={project}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function ProjectCard({
  onOpen,
  project,
}: {
  onOpen: (projectId: string) => void;
  project: Project;
}) {
  const openProject = () => onOpen(project.id);

  return (
    <article
      aria-label={`Open ${project.name} details`}
      className="project-card"
      onClick={openProject}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openProject();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="project-card-header">
        <h3>{project.name}</h3>
        {project.githubUrl ? (
          <a
            aria-label={`Open ${project.name} on GitHub`}
            className="github-button"
            href={project.githubUrl}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            rel="noreferrer"
            target="_blank"
          >
            <GitHubIcon />
            <span>GitHub</span>
            <ExternalLink aria-hidden="true" size={14} strokeWidth={1.5} />
          </a>
        ) : (
          <span className="github-button is-unlinked">
            <GitHubIcon />
            <span>Not linked</span>
          </span>
        )}
      </div>

      <dl className="project-meta">
        <div>
          <dt>
            <Clock aria-hidden="true" size={15} strokeWidth={1.5} />
            Last activity
          </dt>
          <dd>
            <strong>{project.latestActivityLabel}</strong>
            <span>{project.latestUpdatedAt}</span>
          </dd>
        </div>
      </dl>

      <dl className="project-stats" aria-label="Project activity">
        <div>
          <dt>Sessions</dt>
          <dd>{project.sessions}</dd>
        </div>
        <div>
          <dt>Prompts</dt>
          <dd>{formatCompactNumber(project.prompts)}</dd>
        </div>
        <div>
          <dt>Tracked files</dt>
          <dd>{formatCompactNumber(project.trackedFiles)}</dd>
        </div>
      </dl>

      <div className="model-group" aria-label="AI models used">
        <span className="model-group-label">
          <Bot aria-hidden="true" size={15} strokeWidth={1.5} />
          AI model
        </span>
        <div className="model-list">
          {project.models.length > 0 ? (
            project.models.map((model) => (
              <AiModelBadge className="is-compact" key={model} model={model} />
            ))
          ) : (
            <span className="ai-model-badge is-compact is-muted">
              Model unknown
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
