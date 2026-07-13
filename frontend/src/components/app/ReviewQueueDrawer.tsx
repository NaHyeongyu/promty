import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { UnauthorizedError } from "../../api/client";
import {
  fetchProjectMemoryPendingRanges,
  refreshMemoryReviewQueue,
} from "../../api/projects";
import {
  pendingReviewProjects,
  reviewQueueProjectBatch,
  reviewQueueSessionsFromRanges,
} from "../../workspace/reviewQueue";
import type {
  Project,
  ProjectMemoryPendingRangeApiResponse,
  ProjectSummary,
} from "../../workspace/types";

type QueueProjectState = {
  errorMessage: string | null;
  ranges: ProjectMemoryPendingRangeApiResponse[];
  status: "error" | "loaded" | "loading";
};

function formatCapturedRange(firstEventAt: string | null, lastEventAt: string | null) {
  const firstDate = firstEventAt ? new Date(firstEventAt) : null;
  const lastDate = lastEventAt ? new Date(lastEventAt) : null;
  const validFirst = firstDate && !Number.isNaN(firstDate.getTime()) ? firstDate : null;
  const validLast = lastDate && !Number.isNaN(lastDate.getTime()) ? lastDate : null;

  if (!validFirst && !validLast) {
    return "Capture time unavailable";
  }

  const dateFormatter = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (!validFirst || !validLast) {
    const value = validFirst ?? validLast;
    return value ? `${dateFormatter.format(value)} · ${timeFormatter.format(value)}` : "";
  }

  if (validFirst.toDateString() === validLast.toDateString()) {
    return `${dateFormatter.format(validFirst)} · ${timeFormatter.format(
      validFirst,
    )}–${timeFormatter.format(validLast)}`;
  }

  return `${dateFormatter.format(validFirst)}–${dateFormatter.format(validLast)}`;
}

function metricLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function projectCapturedRange(ranges: ProjectMemoryPendingRangeApiResponse[]) {
  const timestamps = ranges.flatMap((range) =>
    [range.first_event_at, range.last_event_at].filter(
      (value): value is string =>
        typeof value === "string" && !Number.isNaN(Date.parse(value)),
    ),
  );
  if (timestamps.length === 0) {
    return formatCapturedRange(null, null);
  }
  timestamps.sort((left, right) => Date.parse(left) - Date.parse(right));
  return formatCapturedRange(timestamps.at(0) ?? null, timestamps.at(-1) ?? null);
}

function oldestCapturedTimestamp(ranges: ProjectMemoryPendingRangeApiResponse[]) {
  return ranges.reduce((oldest, range) => {
    const timestamp = Date.parse(range.first_event_at ?? range.last_event_at ?? "");
    return Number.isNaN(timestamp) ? oldest : Math.min(oldest, timestamp);
  }, Number.POSITIVE_INFINITY);
}

export function ReviewQueueDrawer({
  onClose,
  onOpenProjectMemory,
  onProjectSummariesRefresh,
  onUnauthorized,
  projectFilterId,
  projects,
  returnFocusElement,
  workspaceReady,
}: {
  onClose: () => void;
  onOpenProjectMemory: (projectId: string) => void;
  onProjectSummariesRefresh: (projects: ProjectSummary[]) => void;
  onUnauthorized: () => void;
  projectFilterId?: string | null;
  projects: Project[];
  returnFocusElement?: HTMLElement | null;
  workspaceReady: boolean;
}) {
  const reviewProjects = useMemo(() => {
    const pendingProjects = pendingReviewProjects(projects);
    return projectFilterId
      ? pendingProjects.filter((project) => project.id === projectFilterId)
      : pendingProjects;
  }, [projectFilterId, projects]);
  const pendingProjectCount = reviewProjects.length;
  const [projectStates, setProjectStates] = useState<
    Record<string, QueueProjectState | undefined>
  >({});
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [projectSortMode, setProjectSortMode] = useState<"oldest" | "largest">(
    "oldest",
  );
  const [isQueueRefreshing, setIsQueueRefreshing] = useState(true);
  const [queueRefreshError, setQueueRefreshError] = useState<string | null>(null);
  const [queueRefreshWarning, setQueueRefreshWarning] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const isMountedRef = useRef(true);
  const hasRefreshedQueueRef = useRef(false);
  const queueRefreshControllerRef = useRef<AbortController | null>(null);
  const requestControllersRef = useRef(new Map<string, AbortController>());
  const suppressFocusRestoreRef = useRef(false);
  const showQueueControls = !projectFilterId && pendingProjectCount >= 8;
  const visibleReviewProjects = useMemo(() => {
    const normalizedQuery = showQueueControls
      ? projectSearchQuery.trim().toLocaleLowerCase()
      : "";
    return reviewProjects
      .filter((project) =>
        normalizedQuery
          ? project.name.toLocaleLowerCase().includes(normalizedQuery)
          : true,
      )
      .sort((left, right) => {
        if (projectSortMode === "largest") {
          return (
            right.pendingMemoryCount - left.pendingMemoryCount ||
            left.name.localeCompare(right.name)
          );
        }
        return (
          oldestCapturedTimestamp(projectStates[left.id]?.ranges ?? []) -
            oldestCapturedTimestamp(projectStates[right.id]?.ranges ?? []) ||
          left.name.localeCompare(right.name)
        );
      });
  }, [projectSearchQuery, projectSortMode, projectStates, reviewProjects, showQueueControls]);

  const loadProjectRanges = useCallback(
    async (projectId: string) => {
      if (!isMountedRef.current) {
        return null;
      }
      requestControllersRef.current.get(projectId)?.abort();
      const controller = new AbortController();
      requestControllersRef.current.set(projectId, controller);
      setProjectStates((current) => ({
        ...current,
        [projectId]: {
          errorMessage: null,
          ranges: current[projectId]?.ranges ?? [],
          status: "loading",
        },
      }));

      try {
        const ranges = await fetchProjectMemoryPendingRanges(
          projectId,
          controller.signal,
        );
        if (controller.signal.aborted || !isMountedRef.current) {
          return null;
        }
        setProjectStates((current) => ({
          ...current,
          [projectId]: { errorMessage: null, ranges, status: "loaded" },
        }));
        return ranges;
      } catch (error) {
        if (controller.signal.aborted || !isMountedRef.current) {
          return null;
        }
        if (error instanceof UnauthorizedError) {
          onUnauthorized();
          return null;
        }
        setProjectStates((current) => ({
          ...current,
          [projectId]: {
            errorMessage:
              error instanceof Error ? error.message : "Review queue could not be loaded.",
            ranges: current[projectId]?.ranges ?? [],
            status: "error",
          },
        }));
        return null;
      } finally {
        if (requestControllersRef.current.get(projectId) === controller) {
          requestControllersRef.current.delete(projectId);
        }
      }
    },
    [onUnauthorized],
  );

  const refreshQueueSnapshot = useCallback(async () => {
    if (!isMountedRef.current) {
      return null;
    }
    queueRefreshControllerRef.current?.abort();
    const controller = new AbortController();
    queueRefreshControllerRef.current = controller;
    setIsQueueRefreshing(true);
    setQueueRefreshError(null);
    setQueueRefreshWarning(null);

    try {
      const snapshot = await refreshMemoryReviewQueue(controller.signal);
      if (controller.signal.aborted || !isMountedRef.current) {
        return null;
      }
      const snapshotErrors = snapshot.errors ?? [];
      setProjectStates(
        Object.fromEntries(
          snapshot.projects.map((project) => {
            const projectError = snapshotErrors.find(
              (error) => error.project_id === project.project_id,
            );
            return [
              project.project_id,
              {
                errorMessage: projectError?.message ?? null,
                ranges: project.ranges,
                status: projectError ? ("error" as const) : ("loaded" as const),
              },
            ];
          }),
        ),
      );
      if (snapshotErrors.length > 0) {
        setQueueRefreshWarning(
          `${snapshotErrors.length} ${
            snapshotErrors.length === 1 ? "project" : "projects"
          } could not be checked.`,
        );
      }
      onProjectSummariesRefresh(snapshot.project_summaries);
      return snapshot;
    } catch (error) {
      if (controller.signal.aborted || !isMountedRef.current) {
        return null;
      }
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return null;
      }
      setQueueRefreshError(
        error instanceof Error ? error.message : "Review queue could not be refreshed.",
      );
      return null;
    } finally {
      if (queueRefreshControllerRef.current === controller) {
        queueRefreshControllerRef.current = null;
      }
      if (!controller.signal.aborted && isMountedRef.current) {
        setIsQueueRefreshing(false);
      }
    }
  }, [onProjectSummariesRefresh, onUnauthorized]);

  useEffect(() => {
    isMountedRef.current = true;
    hasRefreshedQueueRef.current = false;
    const previousActiveElement = document.activeElement;
    const focusReturnTarget = returnFocusElement ?? previousActiveElement;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      isMountedRef.current = false;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      for (const controller of requestControllersRef.current.values()) {
        controller.abort();
      }
      queueRefreshControllerRef.current?.abort();
      queueRefreshControllerRef.current = null;
      requestControllersRef.current.clear();
      if (!suppressFocusRestoreRef.current) {
        const fallbackTargets = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-review-queue-fallback-focus="true"]',
          ),
        );
        const focusTarget = [focusReturnTarget, ...fallbackTargets].find(
          (element): element is HTMLElement =>
            element instanceof HTMLElement &&
            element.isConnected &&
            element.getClientRects().length > 0,
        );
        focusTarget?.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (!workspaceReady || hasRefreshedQueueRef.current) {
      return;
    }
    hasRefreshedQueueRef.current = true;
    void refreshQueueSnapshot();
  }, [refreshQueueSnapshot, workspaceReady]);

  const keepFocusInsideDrawer = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") {
      return;
    }
    const focusableElements = Array.from(
      drawerRef.current?.querySelectorAll<HTMLElement>(
        [
          "a[href]",
          "button:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          "textarea:not([disabled])",
          "[tabindex]:not([tabindex='-1'])",
        ].join(","),
      ) ?? [],
    ).filter(
      (element) =>
        element.getAttribute("aria-hidden") !== "true" &&
        element.getClientRects().length > 0,
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (!firstElement || !lastElement) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const navigateFromQueue = (action: () => void) => {
    suppressFocusRestoreRef.current = true;
    action();
  };

  return (
    <div
      className="review-queue-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-busy={isQueueRefreshing || !workspaceReady || undefined}
        aria-labelledby="review-queue-title"
        aria-modal="true"
        className="review-queue-sheet"
        id="review-queue"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          keepFocusInsideDrawer(event);
        }}
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="review-queue-header">
          <div>
            <h2 id="review-queue-title">Memory queue</h2>
            <p>
              {pendingProjectCount} {pendingProjectCount === 1 ? "project" : "projects"} ready
            </p>
          </div>
          <div className="review-queue-header-actions">
            <button
              aria-label="Close review queue"
              className="review-queue-icon-button"
              onClick={onClose}
              ref={closeButtonRef}
              type="button"
            >
              <X aria-hidden="true" size={18} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        <div className="review-queue-body">
          {queueRefreshError && reviewProjects.length > 0 ? (
            <div className="review-queue-notice" data-error="true" role="alert">
              <CircleAlert aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>{queueRefreshError}</span>
              <button
                aria-label="Retry review queue refresh"
                className="review-queue-icon-button"
                onClick={() => void refreshQueueSnapshot()}
                title="Retry"
                type="button"
              >
                <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
              </button>
            </div>
          ) : null}
          {queueRefreshWarning ? (
            <div className="review-queue-notice" data-warning="true" role="status">
              <CircleAlert aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>{queueRefreshWarning}</span>
              <button
                aria-label="Retry incomplete review queue refresh"
                className="review-queue-icon-button"
                onClick={() => void refreshQueueSnapshot()}
                title="Retry"
                type="button"
              >
                <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
              </button>
            </div>
          ) : null}

          {showQueueControls && reviewProjects.length > 0 ? (
            <div className="review-queue-controls">
              <label className="review-queue-search">
                <Search aria-hidden="true" size={15} strokeWidth={1.5} />
                <input
                  aria-label="Search projects"
                  onChange={(event) => setProjectSearchQuery(event.target.value)}
                  placeholder="Search projects"
                  type="search"
                  value={projectSearchQuery}
                />
              </label>
              <label className="review-queue-sort">
                <select
                  aria-label="Sort projects"
                  onChange={(event) =>
                    setProjectSortMode(event.target.value as "oldest" | "largest")
                  }
                  value={projectSortMode}
                >
                  <option value="oldest">Oldest waiting</option>
                  <option value="largest">Most accumulated</option>
                </select>
              </label>
            </div>
          ) : null}

          {!workspaceReady || (isQueueRefreshing && !queueRefreshError && reviewProjects.length === 0) ? (
            <div className="review-queue-global-state" role="status">
              <LoaderCircle aria-hidden="true" size={20} strokeWidth={1.5} />
              <div>
                <strong>Refreshing review queue</strong>
                <span>Checking captured work across projects.</span>
              </div>
            </div>
          ) : queueRefreshError && reviewProjects.length === 0 ? (
            <div className="review-queue-global-state" data-error="true" role="alert">
              <CircleAlert aria-hidden="true" size={20} strokeWidth={1.5} />
              <div>
                <strong>Review queue could not be refreshed</strong>
                <span>{queueRefreshError}</span>
              </div>
              <button
                className="review-queue-secondary-action"
                onClick={() => void refreshQueueSnapshot()}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={15} strokeWidth={1.5} />
                <span>Retry</span>
              </button>
            </div>
          ) : reviewProjects.length > 0 ? (
            <div className="review-queue-projects">
              {visibleReviewProjects.map((project) => {
                const projectState = projectStates[project.id];
                const sessions = reviewQueueSessionsFromRanges(projectState?.ranges ?? []);
                const projectBatch = reviewQueueProjectBatch(sessions);
                const visibleRangeCount = projectState?.ranges.length ?? 0;
                const chunkCount = Math.max(
                  visibleRangeCount,
                  project.pendingMemoryCount,
                );

                return (
                  <section className="review-queue-project" key={project.id}>
                    {projectState?.status === "loading" ||
                    (isQueueRefreshing && !projectState) ? (
                      <div className="review-queue-loading" role="status">
                        <LoaderCircle aria-hidden="true" size={18} strokeWidth={1.5} />
                        <span>Loading {project.name}</span>
                      </div>
                    ) : projectState?.status === "error" ? (
                      <div className="review-queue-error" role="alert">
                        <CircleAlert aria-hidden="true" size={18} strokeWidth={1.5} />
                        <div>
                          <strong>{project.name}</strong>
                          <span>{projectState.errorMessage}</span>
                        </div>
                        <button
                          aria-label={`Retry ${project.name} review queue`}
                          className="review-queue-icon-button"
                          onClick={() => void loadProjectRanges(project.id)}
                          title="Retry"
                          type="button"
                        >
                          <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : visibleRangeCount > 0 ? (
                      <div className="review-queue-project-row">
                        <div className="review-queue-project-copy">
                          <div className="review-queue-project-heading">
                            <strong>{project.name}</strong>
                            <span>Ready</span>
                          </div>
                          <p className="review-queue-project-meta">
                            <span>{metricLabel(chunkCount, "chunk")}</span>
                            <span>{metricLabel(projectBatch.promptCount, "prompt")}</span>
                            <span>{projectCapturedRange(projectState?.ranges ?? [])}</span>
                          </p>
                        </div>
                        <button
                          aria-label={`Review and generate memory for ${project.name}`}
                          className="review-queue-primary-action review-queue-project-action"
                          onClick={() =>
                            navigateFromQueue(() => onOpenProjectMemory(project.id))
                          }
                          type="button"
                        >
                          <span>Review &amp; generate</span>
                          <ArrowRight aria-hidden="true" size={15} strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : projectState?.status === "loaded" ? (
                      <div className="review-queue-project-empty">
                        <CheckCircle2 aria-hidden="true" size={18} strokeWidth={1.5} />
                        <span>No captured work remains in {project.name}.</span>
                      </div>
                    ) : null}
                  </section>
                );
              })}
              {visibleReviewProjects.length === 0 ? (
                <div className="review-queue-search-empty">
                  <strong>No matching projects</strong>
                  <span>Try a different project name.</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className="review-queue-empty"
              data-warning={queueRefreshWarning || undefined}
            >
              {queueRefreshWarning ? (
                <CircleAlert aria-hidden="true" size={22} strokeWidth={1.5} />
              ) : (
                <CheckCircle2 aria-hidden="true" size={22} strokeWidth={1.5} />
              )}
              <div>
                <strong>
                  {queueRefreshWarning ? "Review status incomplete" : "Review queue clear"}
                </strong>
                <span>
                  {queueRefreshWarning
                    ? "No reviewable work is currently available."
                    : "No captured work is waiting for memory."}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
