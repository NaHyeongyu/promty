import { type ReactNode, useRef } from "react";
import {
  ArrowRight,
  CircleAlert,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { formatCompactNumber } from "../../lib/formatters";
import type { EventRecord, Project, ProjectSortMode } from "../../workspace/types";
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
  onFirstEvent,
  onboardingPollingEnabled,
  onOpenProject,
  onOpenReviewQueue,
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
  onFirstEvent: (event: EventRecord) => void;
  onboardingPollingEnabled: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenReviewQueue: (
    projectId: string,
    returnFocusElement: HTMLElement,
  ) => void;
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
            <span>Add project</span>
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
          <EmptyProjectsState
            onFirstEvent={onFirstEvent}
            pollingEnabled={onboardingPollingEnabled}
          />
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
                className="project-table loading-cascade"
                data-loading={isEventsLoading ? "true" : undefined}
              >
                <div className="project-table-header" aria-hidden="true">
                  <span>Project</span>
                  <span>Last work</span>
                  <span>Memory</span>
                  <span>Activity</span>
                  <span />
                </div>
                <div className="project-table-body">
                  {visibleProjects.map((project) => (
                    <ProjectRow
                      key={project.id}
                      onOpen={onOpenProject}
                      onOpenReviewQueue={onOpenReviewQueue}
                      project={project}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function ProjectRow({
  onOpen,
  onOpenReviewQueue,
  project,
}: {
  onOpen: (projectId: string) => void;
  onOpenReviewQueue: (
    projectId: string,
    returnFocusElement: HTMLElement,
  ) => void;
  project: Project;
}) {
  const openProjectButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <article className="project-row">
      <button
        aria-label={`Open ${project.name}`}
        className="project-row-open-target"
        onClick={() => onOpen(project.id)}
        ref={openProjectButtonRef}
        type="button"
      />
      <div className="project-row-main">
        <span className="project-row-name">
          <strong>{project.name}</strong>
          <small>{project.models.join(", ") || "Model not captured"}</small>
        </span>
        <span className="project-row-cell">
          <strong>{project.latestActivityLabel}</strong>
          <small>{project.sessions} sessions</small>
        </span>
        {project.pendingMemoryCount > 0 ? (
          <button
            aria-label={`Open ${project.name} review queue`}
            className="project-row-cell project-row-review-action"
            data-attention="true"
            onClick={(event) =>
              onOpenReviewQueue(
                project.id,
                openProjectButtonRef.current ?? event.currentTarget,
              )
            }
            type="button"
          >
            <strong>
              <CircleAlert aria-hidden="true" size={14} strokeWidth={1.5} />
              {`${project.pendingMemoryCount} to review`}
            </strong>
            <small>Open review queue</small>
          </button>
        ) : (
          <span className="project-row-cell">
            <strong>{project.memoryCount} saved</strong>
            <small>
              {project.latestMemoryAt ? "Memory up to date" : "No memory yet"}
            </small>
          </span>
        )}
        <span className="project-row-cell">
          <strong>{formatCompactNumber(project.prompts)} prompts</strong>
          <small>{formatCompactNumber(project.trackedFiles)} files</small>
        </span>
        <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} />
      </div>

      {project.githubUrl ? (
        <a
          aria-label={`Open ${project.name} on GitHub`}
          className="project-row-repository"
          href={project.githubUrl}
          rel="noreferrer"
          target="_blank"
          title="Open GitHub repository"
        >
          <GitHubIcon />
          <ExternalLink aria-hidden="true" size={12} strokeWidth={1.5} />
        </a>
      ) : null}
    </article>
  );
}
