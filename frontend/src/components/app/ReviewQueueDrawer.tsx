import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Files,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { UnauthorizedError } from "../../api/client";
import {
  fetchProjectMemoryPendingRanges,
  refreshMemoryReviewQueue,
} from "../../api/projects";
import { formatLabelValue } from "../../lib/formatters";
import {
  pendingReviewProjects,
  reviewQueueSessionsFromRanges,
  totalPendingReviewCount,
  type ReviewQueueSession,
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

type MemoryActionResult = {
  message: string;
  status: string;
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

function sessionMetricLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function ReviewQueueDrawer({
  onClose,
  onCreateMemory,
  onOpenProjectMemory,
  onOpenSourceSession,
  onProjectSummariesRefresh,
  onUnauthorized,
  projectFilterId,
  projects,
  returnFocusElement,
  workspaceReady,
}: {
  onClose: () => void;
  onCreateMemory: (
    projectId: string,
    sessionIds: string[],
  ) => Promise<MemoryActionResult>;
  onOpenProjectMemory: (projectId: string) => void;
  onOpenSourceSession: (projectId: string, sessionId: string) => void;
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
  const pendingCount = useMemo(
    () =>
      projectFilterId
        ? reviewProjects.reduce(
            (total, project) => total + project.pendingMemoryCount,
            0,
          )
        : totalPendingReviewCount(projects),
    [projectFilterId, projects, reviewProjects],
  );
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    reviewProjects[0]?.id ?? null,
  );
  const [projectStates, setProjectStates] = useState<
    Record<string, QueueProjectState | undefined>
  >({});
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isQueueRefreshing, setIsQueueRefreshing] = useState(true);
  const [queueRefreshError, setQueueRefreshError] = useState<string | null>(null);
  const [queueRefreshWarning, setQueueRefreshWarning] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const isMountedRef = useRef(true);
  const hasRefreshedQueueRef = useRef(false);
  const pendingFocusRef = useRef<
    { key: string; type: "project" | "session" } | { type: "close" } | null
  >(null);
  const projectToggleRefs = useRef(new Map<string, HTMLButtonElement>());
  const queueRefreshControllerRef = useRef<AbortController | null>(null);
  const requestControllersRef = useRef(new Map<string, AbortController>());
  const sessionActionRefs = useRef(new Map<string, HTMLButtonElement>());
  const suppressFocusRestoreRef = useRef(false);

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
      const visibleQueueProjects = projectFilterId
        ? snapshot.projects.filter((project) => project.project_id === projectFilterId)
        : snapshot.projects;
      setExpandedProjectId((currentProjectId) =>
        currentProjectId &&
        visibleQueueProjects.some(
          (project) => project.project_id === currentProjectId,
        )
          ? currentProjectId
          : visibleQueueProjects[0]?.project_id ?? null,
      );
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
  }, [onProjectSummariesRefresh, onUnauthorized, projectFilterId]);

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

  useEffect(() => {
    if (
      expandedProjectId &&
      !reviewProjects.some((project) => project.id === expandedProjectId)
    ) {
      const nextProjectId = reviewProjects[0]?.id ?? null;
      pendingFocusRef.current = nextProjectId
        ? { key: nextProjectId, type: "project" }
        : { type: "close" };
      setExpandedProjectId(nextProjectId);
    }
  }, [expandedProjectId, reviewProjects]);

  useEffect(() => {
    if (
      expandedProjectId &&
      hasRefreshedQueueRef.current &&
      !isQueueRefreshing &&
      !projectStates[expandedProjectId]
    ) {
      void loadProjectRanges(expandedProjectId);
    }
  }, [expandedProjectId, isQueueRefreshing, loadProjectRanges, projectStates]);

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (!pendingFocus) {
      return;
    }
    const target =
      pendingFocus.type === "close"
        ? closeButtonRef.current
        : pendingFocus.type === "project"
          ? projectToggleRefs.current.get(pendingFocus.key)
          : sessionActionRefs.current.get(pendingFocus.key);
    if (!target || target.disabled) {
      return;
    }
    target.focus();
    pendingFocusRef.current = null;
  }, [activeSessionKey, expandedProjectId, projectStates, reviewProjects]);

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

  const createMemory = async (project: Project, session: ReviewQueueSession) => {
    const sessionKey = `${project.id}:${session.sessionId}`;
    setActiveSessionKey(sessionKey);
    setActionError(null);
    setStatusMessage(null);
    try {
      const result = await onCreateMemory(project.id, [session.sessionId]);
      if (!isMountedRef.current) {
        return;
      }
      if (result.status === "memory_generated") {
        setStatusMessage(`Memory created for ${project.name}.`);
      } else {
        setStatusMessage(result.message);
      }
      const snapshot = await refreshQueueSnapshot();
      if (!snapshot || !isMountedRef.current) {
        return;
      }
      const projectSnapshot = snapshot.projects.find(
        (item) => item.project_id === project.id,
      );
      const ranges = projectSnapshot?.ranges ?? [];
      const remainingSessions = reviewQueueSessionsFromRanges(ranges);
      if (remainingSessions.length > 0) {
        pendingFocusRef.current = {
          key: `${project.id}:${remainingSessions[0].sessionId}`,
          type: "session",
        };
      } else {
        const nextProject = snapshot.projects.find(
          (item) =>
            item.project_id !== project.id &&
            (!projectFilterId || item.project_id === projectFilterId),
        );
        pendingFocusRef.current = nextProject
          ? { key: nextProject.project_id, type: "project" }
          : { type: "close" };
        setExpandedProjectId(nextProject?.project_id ?? null);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(
          error instanceof Error ? error.message : "Memory could not be created.",
        );
      }
    } finally {
      if (isMountedRef.current) {
        setActiveSessionKey(null);
      }
    }
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
            <span>Memory inbox</span>
            <h2 id="review-queue-title">Review queue</h2>
          </div>
          <div className="review-queue-header-actions">
            <span className="review-queue-count">
              {pendingCount} {pendingCount === 1 ? "range" : "ranges"}
            </span>
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
          {statusMessage ? (
            <div className="review-queue-notice" role="status">
              <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>{statusMessage}</span>
            </div>
          ) : null}
          {actionError ? (
            <div className="review-queue-notice" data-error="true" role="alert">
              <CircleAlert aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>{actionError}</span>
            </div>
          ) : null}
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
              {reviewProjects.map((project) => {
                const isExpanded = project.id === expandedProjectId;
                const projectState = projectStates[project.id];
                const sessions = reviewQueueSessionsFromRanges(projectState?.ranges ?? []);
                const visibleRangeCount = projectState?.ranges.length ?? 0;
                const panelId = `review-queue-project-${project.id}`;

                return (
                  <section className="review-queue-project" key={project.id}>
                    <div className="review-queue-project-header">
                      <button
                        aria-controls={panelId}
                        aria-expanded={isExpanded}
                        className="review-queue-project-toggle"
                        onClick={() => {
                          const nextProjectId = isExpanded ? null : project.id;
                          setExpandedProjectId(nextProjectId);
                          if (nextProjectId && !projectState) {
                            void loadProjectRanges(nextProjectId);
                          }
                        }}
                        ref={(element) => {
                          if (element) {
                            projectToggleRefs.current.set(project.id, element);
                          } else {
                            projectToggleRefs.current.delete(project.id);
                          }
                        }}
                        type="button"
                      >
                        <span>
                          <strong>{project.name}</strong>
                          <small>
                            {project.pendingMemoryCount}{" "}
                            {project.pendingMemoryCount === 1 ? "captured range" : "captured ranges"}
                            {` · ${project.latestActivityLabel}`}
                          </small>
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          data-expanded={isExpanded || undefined}
                          size={17}
                          strokeWidth={1.5}
                        />
                      </button>
                      <button
                        aria-label={`Open ${project.name} memory`}
                        className="review-queue-icon-button"
                        onClick={() =>
                          navigateFromQueue(() => onOpenProjectMemory(project.id))
                        }
                        title="Open project memory"
                        type="button"
                      >
                        <BookOpen aria-hidden="true" size={17} strokeWidth={1.5} />
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="review-queue-project-panel" id={panelId}>
                        {projectState?.status === "loading" ||
                        (isQueueRefreshing && !projectState) ? (
                          <div className="review-queue-loading" role="status">
                            <LoaderCircle aria-hidden="true" size={18} strokeWidth={1.5} />
                            <span>Loading captured work</span>
                          </div>
                        ) : projectState?.status === "error" ? (
                          <div className="review-queue-error" role="alert">
                            <CircleAlert aria-hidden="true" size={18} strokeWidth={1.5} />
                            <div>
                              <strong>Captured work could not be loaded</strong>
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
                        ) : sessions.length > 0 ? (
                          <>
                            <div className="review-queue-sessions">
                              {sessions.map((session) => {
                                const sessionKey = `${project.id}:${session.sessionId}`;
                                const isCreating = activeSessionKey === sessionKey;
                                return (
                                  <article className="review-queue-session" key={session.sessionId}>
                                    <div className="review-queue-session-heading">
                                      <span>
                                        {formatLabelValue(session.tool, "AI")}{" "}
                                        session
                                      </span>
                                      <strong>
                                        {formatCapturedRange(
                                          session.firstEventAt,
                                          session.lastEventAt,
                                        )}
                                      </strong>
                                    </div>
                                    <div className="review-queue-session-metrics">
                                      <span>
                                        <MessageSquareText
                                          aria-hidden="true"
                                          size={14}
                                          strokeWidth={1.5}
                                        />
                                        {sessionMetricLabel(session.promptCount, "prompt")}
                                      </span>
                                      <span>
                                        <Files aria-hidden="true" size={14} strokeWidth={1.5} />
                                        {sessionMetricLabel(
                                          session.changedFileCount,
                                          "file change",
                                        )}
                                      </span>
                                      {session.draftCount > 1 ? (
                                        <span>{session.draftCount} ranges</span>
                                      ) : null}
                                    </div>
                                    <div className="review-queue-session-actions">
                                      <button
                                        className="review-queue-secondary-action"
                                        onClick={() =>
                                          navigateFromQueue(() =>
                                            onOpenSourceSession(
                                              project.id,
                                              session.sessionId,
                                            ),
                                          )
                                        }
                                        type="button"
                                      >
                                        <MessageSquareText
                                          aria-hidden="true"
                                          size={15}
                                          strokeWidth={1.5}
                                        />
                                        <span>Source session</span>
                                      </button>
                                      <button
                                        aria-busy={isCreating || undefined}
                                        aria-disabled={
                                          !session.canCreateMemory || activeSessionKey !== null
                                        }
                                        className="review-queue-primary-action"
                                        onClick={() => {
                                          if (
                                            !session.canCreateMemory ||
                                            activeSessionKey !== null
                                          ) {
                                            return;
                                          }
                                          void createMemory(project, session);
                                        }}
                                        ref={(element) => {
                                          if (element) {
                                            sessionActionRefs.current.set(sessionKey, element);
                                          } else {
                                            sessionActionRefs.current.delete(sessionKey);
                                          }
                                        }}
                                        type="button"
                                      >
                                        {isCreating ? (
                                          <LoaderCircle
                                            aria-hidden="true"
                                            size={15}
                                            strokeWidth={1.5}
                                          />
                                        ) : (
                                          <Sparkles
                                            aria-hidden="true"
                                            size={15}
                                            strokeWidth={1.5}
                                          />
                                        )}
                                        <span>{isCreating ? "Creating" : "Create memory"}</span>
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                            {visibleRangeCount < project.pendingMemoryCount ? (
                              <p className="review-queue-truncation">
                                Showing the latest {visibleRangeCount} of{" "}
                                {project.pendingMemoryCount} captured ranges.
                              </p>
                            ) : null}
                          </>
                        ) : projectState?.status === "loaded" ? (
                          <div className="review-queue-project-empty">
                            <CheckCircle2 aria-hidden="true" size={18} strokeWidth={1.5} />
                            <span>No captured work remains in this project.</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
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
