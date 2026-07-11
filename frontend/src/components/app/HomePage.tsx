import {
  ArrowRight,
  BookOpen,
  CircleAlert,
  Clock3,
  FolderPlus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { formatRelativeTimestamp } from "../../lib/formatters";
import type { EventRecord, Project } from "../../workspace/types";
import { EmptyProjectsState, EmptyState } from "./WorkspaceStates";

export function HomePage({
  errorMessage,
  isLoading,
  onAddProject,
  onFirstEvent,
  onboardingPollingEnabled,
  onOpenProject,
  onOpenProjectMemory,
  onOpenReviews,
  onRetry,
  projects,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  onAddProject: () => void;
  onFirstEvent: (event: EventRecord) => void;
  onboardingPollingEnabled: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenProjectMemory: (projectId: string) => void;
  onOpenReviews: () => void;
  onRetry: () => void;
  projects: Project[];
}) {
  const latestProject = projects[0] ?? null;
  const reviewCount = projects.reduce(
    (total, project) => total + project.pendingMemoryCount,
    0,
  );
  const attentionProjects = projects.filter(
    (project) => project.pendingMemoryCount > 0,
  );
  const recentMemoryProjects = [...projects]
    .filter((project) => project.latestMemoryAt)
    .sort(
      (first, second) =>
        Date.parse(second.latestMemoryAt ?? "") -
        Date.parse(first.latestMemoryAt ?? ""),
    )
    .slice(0, 4);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Home</h1>
        </div>
        <div className="page-actions">
          <button className="toolbar-button" onClick={onAddProject} type="button">
            <FolderPlus aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>Add project</span>
          </button>
        </div>
      </header>

      {isLoading && projects.length === 0 ? (
        <div
          aria-label="Loading workspace"
          aria-live="polite"
          className="home-loading-state"
          role="status"
        >
          <span className="skeleton-line skeleton-line-heading" />
          <span className="skeleton-line skeleton-line-description" />
          <div>
            {Array.from({ length: 4 }, (_, index) => (
              <span className="skeleton-line skeleton-line-md" key={index} />
            ))}
          </div>
        </div>
      ) : errorMessage ? (
        <EmptyState
          description={errorMessage}
          eyebrow="Sync issue"
          icon={RefreshCw}
          title="Workspace could not be loaded"
        >
          <button className="empty-state-button" onClick={onRetry} type="button">
            <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>Retry</span>
          </button>
        </EmptyState>
      ) : projects.length === 0 ? (
        <EmptyProjectsState
          onFirstEvent={onFirstEvent}
          pollingEnabled={onboardingPollingEnabled}
        />
      ) : (
        <div className="home-workspace">
          {latestProject ? (
            <section className="home-resume" aria-labelledby="home-resume-title">
              <div className="home-section-heading">
                <span>Continue work</span>
                <h2 id="home-resume-title">{latestProject.name}</h2>
                <p>
                  Last active {latestProject.latestActivityLabel}. Resume with the latest
                  project context and evidence.
                </p>
              </div>
              <div className="home-resume-meta" aria-label="Project status">
                <span>
                  <Clock3 aria-hidden="true" size={15} strokeWidth={1.5} />
                  {latestProject.sessions} sessions
                </span>
                <span>
                  <Sparkles aria-hidden="true" size={15} strokeWidth={1.5} />
                  {latestProject.memoryCount} memories
                </span>
                {latestProject.pendingMemoryCount > 0 ? (
                  <span data-tone="attention">
                    <CircleAlert aria-hidden="true" size={15} strokeWidth={1.5} />
                    {latestProject.pendingMemoryCount} to review
                  </span>
                ) : null}
              </div>
              <button
                className="home-primary-action"
                onClick={() => onOpenProject(latestProject.id)}
                type="button"
              >
                <span>Open project</span>
                <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} />
              </button>
            </section>
          ) : null}

          <section className="home-section" aria-labelledby="home-attention-title">
            <div className="home-section-header">
              <div>
                <span>Needs attention</span>
                <h2 id="home-attention-title">
                  {reviewCount > 0 ? `${reviewCount} memories to review` : "You are up to date"}
                </h2>
              </div>
              {reviewCount > 0 ? (
                <button className="text-action" onClick={onOpenReviews} type="button">
                  Review memory
                  <ArrowRight aria-hidden="true" size={15} strokeWidth={1.5} />
                </button>
              ) : null}
            </div>
            {attentionProjects.length > 0 ? (
              <div className="home-attention-list">
                {attentionProjects.slice(0, 4).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => onOpenProject(project.id)}
                    type="button"
                  >
                    <span>
                      <strong>{project.name}</strong>
                      <small>
                        {project.pendingMemoryCount} memory items need review
                      </small>
                    </span>
                    <ArrowRight aria-hidden="true" size={15} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="home-calm-state">
                No captured work is waiting for review.
              </p>
            )}
          </section>

          {recentMemoryProjects.length > 0 ? (
            <section className="home-section" aria-labelledby="home-memory-title">
              <div className="home-section-header">
                <div>
                  <span>Recent memory</span>
                  <h2 id="home-memory-title">Project context</h2>
                </div>
              </div>
              <div className="home-memory-list">
                {recentMemoryProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => onOpenProjectMemory(project.id)}
                    type="button"
                  >
                    <BookOpen aria-hidden="true" size={17} strokeWidth={1.5} />
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.memoryCount} memory items</small>
                    </span>
                    <span>
                      {formatRelativeTimestamp(project.latestMemoryAt) ?? "Updated recently"}
                    </span>
                    <ArrowRight aria-hidden="true" size={15} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="home-section" aria-labelledby="home-recent-title">
            <div className="home-section-header">
              <div>
                <span>Recent work</span>
                <h2 id="home-recent-title">Projects</h2>
              </div>
            </div>
            <div className="home-project-list">
              {projects.slice(0, 6).map((project) => (
                <button
                  key={project.id}
                  onClick={() => onOpenProject(project.id)}
                  type="button"
                >
                  <span className="home-project-name">
                    <strong>{project.name}</strong>
                    <small>{project.models.join(", ") || "Model not captured"}</small>
                  </span>
                  <span>{project.latestActivityLabel}</span>
                  <span>{project.memoryCount} memories</span>
                  <ArrowRight aria-hidden="true" size={15} strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
