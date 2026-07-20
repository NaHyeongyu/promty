import { type ReactNode, useRef } from "react";
import {
  ArrowRight,
  Bookmark,
  CircleAlert,
  Folder,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { formatCompactNumber } from "../../lib/formatters";
import { useI18n } from "../../i18n/I18nProvider";
import type { EventRecord, Project, ProjectSortMode } from "../../workspace/types";
import { AiModelBadge } from "../project-detail";
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
  onBrowseProjects,
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
  view = "all",
}: {
  activeTitle: string;
  displayProjects: Project[];
  errorMessage: string | null;
  isEventsLoading: boolean;
  onBrowseProjects?: () => void;
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
  view?: "all" | "pinned";
}) {
  const { t } = useI18n();
  return (
    <>
      <header className="page-header">
        <div className="projects-page-header-copy">
          <h1>{activeTitle}</h1>
          <p>
            {previewProjectLoading ||
            (isEventsLoading && displayProjects.length === 0)
              ? t("project.loading")
              : displayProjects.length === 1
                ? t("project.projectCountOne")
                : t("project.projectCount", { count: displayProjects.length })}
          </p>
        </div>
        {view === "pinned" && displayProjects.length === 0 ? null : (
          <div className="page-actions">
            {view === "pinned" ? (
              <button
                className="toolbar-button"
                onClick={onBrowseProjects}
                type="button"
              >
                <Folder aria-hidden="true" size={16} strokeWidth={1.5} />
                <span>{t("pinned.browseProjects")}</span>
              </button>
            ) : (
              <button
                className="toolbar-button project-add-button"
                onClick={onOpenRepositoryConnector}
                type="button"
              >
                <Plus aria-hidden="true" size={16} strokeWidth={1.5} />
                <span>{t("project.add")}</span>
              </button>
            )}
          </div>
        )}
      </header>

      {repositoryConnector}

      <section className="projects-section" aria-label={activeTitle}>
        {previewProjectLoading ? (
          <ProjectListLoadingState delayMs={0} />
        ) : isEventsLoading && displayProjects.length === 0 && !previewEmptyProjects ? (
          <ProjectListLoadingState />
        ) : errorMessage ? (
          <EmptyState
            description={errorMessage}
            eyebrow={t("project.syncIssue")}
            icon={RefreshCw}
            title={t("project.listLoadFailed")}
          >
            <button
              className="empty-state-button"
              disabled={isEventsLoading}
              onClick={onRetry}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>{isEventsLoading ? t("common.refreshing") : t("common.retry")}</span>
            </button>
          </EmptyState>
        ) : displayProjects.length === 0 && view === "pinned" ? (
          <section
            className="pinned-projects-empty"
            aria-describedby="pinned-projects-empty-description pinned-projects-empty-hint"
            aria-labelledby="pinned-projects-empty-title"
          >
            <div className="pinned-projects-empty-icon" aria-hidden="true">
              <Bookmark size={22} strokeWidth={1.5} />
            </div>
            <div className="pinned-projects-empty-copy">
              <h2 id="pinned-projects-empty-title">{t("pinned.emptyTitle")}</h2>
              <p id="pinned-projects-empty-description">
                {t("pinned.emptyDescription")}
              </p>
            </div>
            <button
              className="toolbar-button pinned-projects-empty-action"
              onClick={onBrowseProjects}
              type="button"
            >
              <span>{t("pinned.browseProjects")}</span>
              <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
            <p className="pinned-projects-empty-hint" id="pinned-projects-empty-hint">
              {t("pinned.emptyHint")}
            </p>
          </section>
        ) : displayProjects.length === 0 ? (
          <EmptyProjectsState
            onFirstEvent={onFirstEvent}
            pollingEnabled={onboardingPollingEnabled}
          />
        ) : (
          <div className="project-list-panel">
            <div className="project-controls">
              <label className="project-search-control">
                <span className="bh-visually-hidden">{t("project.search")}</span>
                <Search aria-hidden="true" size={16} strokeWidth={1.5} />
                <input
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={t("project.search")}
                  type="search"
                  value={projectSearchQuery}
                />
              </label>

              <div className="project-sort-control" aria-label={t("project.sort")}>
                <button
                  aria-pressed={projectSortMode === "recent"}
                  data-active={projectSortMode === "recent"}
                  onClick={() => onSortModeChange("recent")}
                  type="button"
                >
                  {t("project.recentWork")}
                </button>
                <button
                  aria-pressed={projectSortMode === "added"}
                  data-active={projectSortMode === "added"}
                  onClick={() => onSortModeChange("added")}
                  type="button"
                >
                  {t("project.added")}
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
                  <span>{t("project.noMatches")}</span>
                  <h2 id="project-search-empty-title">{t("project.noProjectsFound")}</h2>
                  <p>
                    {t("project.nameSearchNoMatch", {
                      query: projectSearchQuery.trim(),
                    })}
                  </p>
                </div>
                <button className="toolbar-button" onClick={onClearSearch} type="button">
                  <X aria-hidden="true" size={15} strokeWidth={1.5} />
                  <span>{t("project.clearSearch")}</span>
                </button>
              </section>
            ) : (
              <div
                aria-busy={isEventsLoading || undefined}
                className="project-table loading-cascade"
                data-loading={isEventsLoading ? "true" : undefined}
              >
                <div className="project-table-header" aria-hidden="true">
                  <span>{t("project.project")}</span>
                  <span>{t("project.lastWork")}</span>
                  <span>{t("project.memory")}</span>
                  <span className="project-table-number-heading">{t("project.activity")}</span>
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
          </div>
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
  const { t } = useI18n();
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
          <span className="project-row-models">
            {project.models.length > 0 ? (
              <>
                {project.models.slice(0, 2).map((model, index) => (
                  <AiModelBadge
                    className="is-compact"
                    key={`${model}-${index}`}
                    model={model}
                  />
                ))}
                {project.models.length > 2 ? (
                  <span
                    className="project-model-overflow"
                    title={project.models.slice(2).join(", ")}
                  >
                    +{project.models.length - 2}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="project-model-empty">{t("project.modelNotCaptured")}</span>
            )}
          </span>
        </span>
        <span className="project-row-cell">
          <span className="project-row-label">{t("project.lastWork")}</span>
          <strong>{project.latestActivityLabel}</strong>
          <small>{project.sessions} {t("project.sessionUnit")}</small>
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
            <span className="project-row-label">{t("project.memory")}</span>
            <strong>
              <CircleAlert aria-hidden="true" size={14} strokeWidth={1.5} />
              {t("project.memoryReadyShort")}
            </strong>
            <small>{t("project.openReviewQueue")}</small>
          </button>
        ) : (
          <span className="project-row-cell">
            <span className="project-row-label">{t("project.memory")}</span>
            <strong>
              {project.memoryCount > 0
                ? `${project.memoryCount} ${t("project.saved")}`
                : t("project.noMemory")}
            </strong>
            <small>
              {project.latestMemoryAt ? t("project.upToDate") : t("project.nothingSaved")}
            </small>
          </span>
        )}
        <span className="project-row-cell project-row-number-cell">
          <span className="project-row-label">{t("project.activity")}</span>
          <strong>{formatCompactNumber(project.prompts)} {t("project.promptUnit")}</strong>
          <small>{formatCompactNumber(project.trackedFiles)} {t("project.fileUnit")}</small>
        </span>
        <span className="project-row-actions">
          <span className="project-row-open-indicator" aria-hidden="true">
            <ArrowRight size={16} strokeWidth={1.5} />
          </span>
        </span>
      </div>
    </article>
  );
}
