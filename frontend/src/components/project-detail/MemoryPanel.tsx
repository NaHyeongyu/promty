import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
} from "lucide-react";
import {
  deleteMemoryGenerationReviewPrompt,
  type MemoryGenerationReviewResponse,
  type ProjectMemoryGenerationResponse,
} from "../../api/projects";
import { useI18n } from "../../i18n/I18nProvider";
import { MarkdownContent } from "../MarkdownContent";
import { displayMemoryOutcome } from "./memoryOutcome";
import type {
  ProjectDetailData,
  ProjectMemoryArtifact,
} from "./types";

export type MemoryGenerationResult = ProjectMemoryGenerationResponse;

type MemoryPanelView = "current" | "history";

const MEMORY_PANEL_VIEWS: MemoryPanelView[] = ["history", "current"];

function isGeneratedMemoryArtifact(artifact: ProjectMemoryArtifact) {
  return (
    artifact.artifactStage === "generated_memory" ||
    artifact.artifactStage === "verified_memory" ||
    artifact.memoryScope === "generated" ||
    artifact.memoryScope === "verified"
  );
}

function memoryArtifactStatusLabel(artifact: ProjectMemoryArtifact) {
  if (artifact.memoryScope === "verified" || artifact.artifactStage === "verified_memory") {
    return "Verified";
  }
  return null;
}

function memoryArtifactFileCount(artifact: ProjectMemoryArtifact) {
  const listedFileCount = (artifact.changedFiles ?? []).filter((file) =>
    file.path?.trim(),
  ).length;
  return Math.max(artifact.changedFileCount ?? 0, listedFileCount);
}

function memoryArtifactFileCountLabel(artifact: ProjectMemoryArtifact) {
  const count = memoryArtifactFileCount(artifact);
  if (count === 0) {
    return null;
  }
  return `${count} ${count === 1 ? "file" : "files"} changed`;
}

function memoryArtifactSortTimestamp(artifact: ProjectMemoryArtifact) {
  const candidates = [
    artifact.lastEventAt,
    artifact.firstEventAt,
    artifact.updatedAt,
    artifact.createdAt,
  ];
  for (const value of candidates) {
    if (!value) {
      continue;
    }
    const timestamp = new Date(value).getTime();
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }
  return 0;
}

function compareMemoryArtifactsByLatest(
  left: ProjectMemoryArtifact,
  right: ProjectMemoryArtifact,
) {
  const timestampDifference =
    memoryArtifactSortTimestamp(right) - memoryArtifactSortTimestamp(left);
  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  const rightSequence = right.endSequence ?? right.startSequence ?? -1;
  const leftSequence = left.endSequence ?? left.startSequence ?? -1;
  if (rightSequence !== leftSequence) {
    return rightSequence - leftSequence;
  }

  return right.id.localeCompare(left.id);
}

function formatMemoryDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatMemoryDateRange(
  firstEventAt: string | null | undefined,
  lastEventAt: string | null | undefined,
) {
  const start = formatMemoryDate(firstEventAt);
  const end = formatMemoryDate(lastEventAt ?? firstEventAt);
  if (!start && !end) {
    return null;
  }
  if (!start) {
    return end;
  }
  if (!end) {
    return start;
  }
  return `${start} - ${end}`;
}

function combinedMemoryDateRange(
  items: Array<{ firstEventAt: string | null; lastEventAt: string | null }>,
) {
  const timestamps = items
    .flatMap((item) => [item.firstEventAt, item.lastEventAt])
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => !Number.isNaN(value));
  if (timestamps.length === 0) {
    return null;
  }
  return formatMemoryDateRange(
    new Date(Math.min(...timestamps)).toISOString(),
    new Date(Math.max(...timestamps)).toISOString(),
  );
}

function MemoryArtifactCard({
  artifact,
  isSelected = false,
  onSelect,
}: {
  artifact: ProjectMemoryArtifact;
  isSelected?: boolean;
  onSelect: (artifact: ProjectMemoryArtifact) => void;
}) {
  const dateRange = formatMemoryDateRange(artifact.firstEventAt, artifact.lastEventAt);
  const statusLabel = memoryArtifactStatusLabel(artifact);
  const fileCountLabel = memoryArtifactFileCountLabel(artifact);
  const hasHeaderMeta = Boolean(dateRange || statusLabel);

  return (
    <button
      aria-haspopup="dialog"
      aria-pressed={isSelected}
      className="bh-memory-context-item"
      data-selected={isSelected ? "true" : "false"}
      onClick={() => onSelect(artifact)}
      type="button"
    >
      {hasHeaderMeta ? (
        <span className="bh-memory-context-card-header">
          {dateRange ? <span className="bh-memory-context-date">{dateRange}</span> : null}
          {statusLabel ? (
            <span className="bh-memory-context-kind">{statusLabel}</span>
          ) : null}
        </span>
      ) : null}
      <span className="bh-memory-context-title-row">
        <span className="bh-memory-context-title">{artifact.title}</span>
        <ChevronRight aria-hidden="true" size={16} strokeWidth={1.6} />
      </span>
      {artifact.summary ? (
        <span className="bh-memory-context-summary">{artifact.summary}</span>
      ) : null}
      {fileCountLabel ? (
        <small className="bh-memory-context-fallback-meta">{fileCountLabel}</small>
      ) : null}
    </button>
  );
}

function MemoryArtifactDetailDrawer({
  artifact,
  artifactCount,
  artifactPosition,
  onClose,
  onNext,
  onOpenSession,
  onPrevious,
}: {
  artifact: ProjectMemoryArtifact;
  artifactCount: number;
  artifactPosition: number;
  onClose: () => void;
  onNext?: () => void;
  onOpenSession?: (sessionId: string) => void;
  onPrevious?: () => void;
}) {
  const { t } = useI18n();
  const drawerRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const sections = (artifact.sections ?? []).filter(
    (section) => section.title?.trim() && section.summary?.trim(),
  );
  const outcome = displayMemoryOutcome(artifact.outcome, artifact.summary);
  const dateRange = formatMemoryDateRange(artifact.firstEventAt, artifact.lastEventAt);
  const statusLabel = memoryArtifactStatusLabel(artifact);
  const changedFiles = (artifact.changedFiles ?? []).filter((file) => file.path?.trim());
  const changedFileCount = memoryArtifactFileCount(artifact);
  const sourceSessionIds = Array.from(
    new Set(
      [artifact.sessionId, ...(artifact.sourceSessionIds ?? [])].filter(
        (sessionId): sessionId is string => Boolean(sessionId),
      ),
    ),
  );
  const metricRows = [
    {
      label: sourceSessionIds.length === 1 ? "Session" : "Sessions",
      value: sourceSessionIds.length > 0 ? sourceSessionIds.length.toString() : null,
    },
    {
      label: artifact.promptCount === 1 ? "Prompt" : "Prompts",
      value: artifact.promptCount ? artifact.promptCount.toString() : null,
    },
    {
      label: changedFileCount === 1 ? "File" : "Files",
      value: changedFileCount > 0 ? changedFileCount.toString() : null,
    },
  ].filter((row) => row.value);
  const provenanceRows = [
    { label: "Covered dates", value: dateRange },
    { label: "Created", value: formatMemoryDate(artifact.createdAt) },
    { label: "Last updated", value: formatMemoryDate(artifact.updatedAt) },
    { label: "Status", value: statusLabel },
  ].filter((row) => row.value);

  useEffect(() => {
    const previousActiveElement = document.activeElement;
    drawerRef.current?.focus();
    return () => {
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus();
      }
    };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [artifact.id]);

  const keepFocusInsideDrawer = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") {
      return;
    }
    const focusableElements = Array.from(
      drawerRef.current?.querySelectorAll<HTMLElement>(
        [
          "a[href]",
          "button:not([disabled])",
          "textarea:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          "summary",
          "[tabindex]:not([tabindex='-1'])",
        ].join(","),
      ) ?? [],
    );
    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div
      className="bh-memory-detail-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="memory-detail-title"
        aria-modal="true"
        className="bh-memory-detail-drawer"
        ref={drawerRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            return;
          }
          keepFocusInsideDrawer(event);
        }}
        role="dialog"
        tabIndex={-1}
      >
        <header className="bh-memory-detail-header">
          <div className="bh-memory-detail-topbar">
            <div
              aria-label={t("memory.historyNavigation")}
              className="bh-memory-detail-navigation"
              role="group"
            >
              <button
                aria-label={t("memory.viewNewer")}
                className="bh-memory-detail-navigation-button"
                disabled={!onPrevious}
                onClick={onPrevious}
                title={t("memory.newer")}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={16} strokeWidth={1.5} />
              </button>
              <span>
                {artifactPosition} of {artifactCount}
              </span>
              <button
                aria-label={t("memory.viewOlder")}
                className="bh-memory-detail-navigation-button"
                disabled={!onNext}
                onClick={onNext}
                title={t("memory.older")}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={16} strokeWidth={1.5} />
              </button>
            </div>
            <button
              aria-label={t("memory.closeDetails")}
              className="bh-icon-button"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
          </div>
          <div className="bh-memory-detail-heading">
            <div className="bh-memory-detail-eyebrow">
              <span>{dateRange ?? t("memory.projectMemory")}</span>
              {statusLabel ? (
                <span className="bh-memory-detail-status">{statusLabel}</span>
              ) : null}
            </div>
            <h2 id="memory-detail-title">{artifact.title}</h2>
          </div>

          {metricRows.length > 0 ? (
            <dl className="bh-memory-detail-metrics">
              {metricRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </header>

        <div className="bh-memory-detail-body" ref={bodyRef}>
          <article className="bh-memory-detail-summary">
            <span className="bh-memory-step-kicker">{t("memory.summary")}</span>
            <p>{artifact.summary || t("memory.noSummary")}</p>
          </article>

          {outcome ? (
            <article className="bh-memory-detail-outcome">
              <CheckCircle2 aria-hidden="true" size={18} strokeWidth={1.5} />
              <div>
                <span className="bh-memory-step-kicker">{t("memory.outcome")}</span>
                <p>{outcome}</p>
              </div>
            </article>
          ) : null}

          {sections.length > 0 ? (
            <section
              aria-labelledby="memory-detail-notes-title"
              className="bh-memory-detail-content-section"
            >
              <div className="bh-memory-detail-section-heading">
                <h3 id="memory-detail-notes-title">{t("memory.keyNotes")}</h3>
                <span>{sections.length}</span>
              </div>
              <ol className="bh-memory-detail-note-list">
                {sections.map((section, index) => (
                  <li key={`${artifact.id}-${section.title}`}>
                    <span aria-hidden="true" className="bh-memory-detail-note-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h4>{section.title}</h4>
                      <p>{section.summary}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {changedFiles.length > 0 ? (
            <section
              aria-labelledby="memory-detail-files-title"
              className="bh-memory-detail-content-section"
            >
              <div className="bh-memory-detail-section-heading">
                <h3 id="memory-detail-files-title">{t("memory.changedFiles")}</h3>
                <span>{changedFileCount}</span>
              </div>
              <ul className="bh-memory-detail-file-list" id="memory-detail-files-list">
                {changedFiles.map((file) => {
                  const pathSegments = file.path.split("/");
                  const fileName = pathSegments.pop() ?? file.path;
                  const directory = pathSegments.join("/");
                  return (
                    <li key={`${artifact.id}-${file.path}`}>
                      <span
                        aria-label={file.status ? `${file.status} file` : "Changed file"}
                        className="bh-memory-detail-file-status"
                        data-status={file.status}
                      >
                        {file.status?.trim().charAt(0).toUpperCase() || "•"}
                      </span>
                      <span className="bh-memory-detail-file-copy">
                        <strong>{fileName}</strong>
                        {directory ? <small>{directory}</small> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {changedFileCount > changedFiles.length ? (
                <small className="bh-memory-detail-muted">
                  {changedFileCount - changedFiles.length} additional changed{" "}
                  {changedFileCount - changedFiles.length === 1
                    ? "file is"
                    : "files are"}{" "}
                  not listed.
                </small>
              ) : null}
            </section>
          ) : null}

          {provenanceRows.length > 0 || sourceSessionIds.length > 0 ? (
            <details className="bh-memory-detail-provenance">
              <summary>
                <span>
                  <strong>{t("memory.sourcesDetails")}</strong>
                  <small>
                    {sourceSessionIds.length > 0
                      ? `${sourceSessionIds.length} source ${
                          sourceSessionIds.length === 1 ? "session" : "sessions"
                        }`
                      : t("memory.metadata")}
                  </small>
                </span>
                <ChevronRight aria-hidden="true" size={16} strokeWidth={1.5} />
              </summary>
              <div className="bh-memory-detail-provenance-body">
                {provenanceRows.length > 0 ? (
                  <dl className="bh-memory-detail-meta">
                    {provenanceRows.map((row) => (
                      <div key={row.label}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {sourceSessionIds.length > 0 && onOpenSession ? (
                  <div className="bh-memory-source-actions">
                    {sourceSessionIds.map((sessionId, index) => (
                      <button
                        className="bh-memory-source-action"
                        key={sessionId}
                        onClick={() => onOpenSession(sessionId)}
                        type="button"
                      >
                        <span>
                          {sourceSessionIds.length === 1
                            ? "Open source session"
                            : `Open source session ${index + 1}`}
                        </span>
                        <ArrowRight aria-hidden="true" size={15} strokeWidth={1.5} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function MemoryPanel({
  data,
  isProjectMemoryGenerationActive = false,
  isProjectMemoryGenerationDelayed = false,
  onApproveProjectMemory,
  onGenerateProjectMemory,
  onLoadMemoryGenerationReview,
  onLoadMemoryArtifacts,
  onOpenSession,
}: {
  data: ProjectDetailData;
  isProjectMemoryGenerationActive?: boolean;
  isProjectMemoryGenerationDelayed?: boolean;
  onApproveProjectMemory?: () => Promise<void>;
  onGenerateProjectMemory?: (reviewToken: string) => Promise<MemoryGenerationResult>;
  onLoadMemoryGenerationReview?: () => Promise<MemoryGenerationReviewResponse>;
  onLoadMemoryArtifacts?: (limit: number) => Promise<ProjectMemoryArtifact[]>;
  onOpenSession?: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const [loadedArtifacts, setLoadedArtifacts] = useState<ProjectMemoryArtifact[] | null>(null);
  const [isApprovingForAgents, setIsApprovingForAgents] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const displayedArtifacts = loadedArtifacts ?? data.memory.recentArtifacts;
  const projectMemoryArtifact = data.memory.recentArtifacts.find(
    (artifact) =>
      artifact.artifactStage === "project_memory" || artifact.memoryScope === "project",
  );
  const projectMemoryNeedsApproval = projectMemoryArtifact?.reviewState === "generated";
  const projectMemoryIsApproved =
    projectMemoryArtifact?.reviewState === "verified" ||
    projectMemoryArtifact?.reviewState === "edited";
  const generatedArtifacts = useMemo(
    () =>
      [...displayedArtifacts]
        .filter(isGeneratedMemoryArtifact)
        .sort(compareMemoryArtifactsByLatest),
    [displayedArtifacts],
  );
  const totalGeneratedArtifactCount = Math.max(
    data.memory.totalArtifacts,
    generatedArtifacts.length,
  );
  const pendingDateRange = combinedMemoryDateRange(data.memory.pendingRanges);
  const pendingDraftKey = data.memory.pendingRanges
    .map((range) => range.draftId)
    .sort()
    .join(":");
  const resultDateRange = combinedMemoryDateRange(generatedArtifacts);
  const hasPendingDocumentation = data.memory.pendingRanges.length > 0;
  const pendingPromptCount = data.memory.pendingRanges.reduce(
    (total, range) => total + range.promptCount,
    0,
  );
  const pendingSessionCount = new Set(
    data.memory.pendingRanges.map((range) => range.sessionId),
  ).size;
  const generatedSummaryCountLabel =
    totalGeneratedArtifactCount > generatedArtifacts.length
      ? `${generatedArtifacts.length} of ${totalGeneratedArtifactCount} memory items`
      : `${generatedArtifacts.length} ${
          generatedArtifacts.length === 1 ? "memory item" : "memory items"
        }`;
  const nextArtifactLoadLimit = Math.min(
    Math.max(generatedArtifacts.length + 10, 20),
    Math.max(totalGeneratedArtifactCount, generatedArtifacts.length + 10),
    100,
  );
  const canLoadMoreArtifacts =
    Boolean(onLoadMemoryArtifacts) &&
    generatedArtifacts.length < totalGeneratedArtifactCount &&
    generatedArtifacts.length < 100;
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [isGenerationStatusDelayed, setIsGenerationStatusDelayed] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationRetryable, setGenerationRetryable] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationReview, setGenerationReview] = useState<MemoryGenerationReviewResponse | null>(null);
  const [showGenerationConfirm, setShowGenerationConfirm] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
  const [isRemoteGenerationActive, setIsRemoteGenerationActive] = useState(false);
  const [isArtifactHistoryLoading, setIsArtifactHistoryLoading] = useState(false);
  const [artifactHistoryError, setArtifactHistoryError] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [activeMemoryView, setActiveMemoryView] =
    useState<MemoryPanelView>("history");
  const memoryViewTabListRef = useRef<HTMLDivElement | null>(null);
  const generationRequestRef = useRef(0);
  const projectIdRef = useRef(data.project.id);
  const previousSharedDelayedRef = useRef(isProjectMemoryGenerationDelayed);
  const persistedGenerationError =
    data.memory.latestBatch?.status === "generation_failed"
      ? data.memory.latestBatch.message
      : null;
  const visibleGenerationError = generationError ?? persistedGenerationError;
  const visibleGenerationRetryable = generationError
    ? generationRetryable
    : (data.memory.latestBatch?.retryable ?? true);
  const isGenerationActive =
    isGenerating ||
    isRemoteGenerationActive ||
    isProjectMemoryGenerationActive;
  const selectedArtifact =
    generatedArtifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null;
  const selectedArtifactIndex = selectedArtifact
    ? generatedArtifacts.findIndex((artifact) => artifact.id === selectedArtifact.id)
    : -1;

  useEffect(() => {
    setLoadedArtifacts(null);
    setArtifactHistoryError(null);
  }, [data.project.id, data.memory.latestArtifactAt, data.memory.totalArtifacts]);

  useEffect(() => {
    setActiveMemoryView("history");
  }, [data.project.id]);

  useEffect(() => {
    projectIdRef.current = data.project.id;
    generationRequestRef.current += 1;
    setGenerationError(null);
    setGenerationRetryable(true);
    setGenerationStatus(null);
    setIsGenerationStatusDelayed(false);
    setIsGenerating(false);
    setIsRemoteGenerationActive(false);
  }, [data.project.id]);

  useEffect(() => {
    setGenerationError(null);
    setGenerationRetryable(true);
  }, [pendingDraftKey]);

  useEffect(() => {
    const wasDelayed = previousSharedDelayedRef.current;
    previousSharedDelayedRef.current = isProjectMemoryGenerationDelayed;
    if (
      wasDelayed &&
      !isProjectMemoryGenerationDelayed &&
      isGenerationStatusDelayed
    ) {
      setGenerationStatus(null);
      setIsGenerationStatusDelayed(false);
    }
  }, [isGenerationStatusDelayed, isProjectMemoryGenerationDelayed]);

  useEffect(() => {
    if (!selectedArtifactId) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedArtifactId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedArtifactId]);

  useEffect(() => {
    if (
      selectedArtifactId &&
      !generatedArtifacts.some((artifact) => artifact.id === selectedArtifactId)
    ) {
      setSelectedArtifactId(null);
    }
  }, [generatedArtifacts, selectedArtifactId]);

  const createProjectMemory = async (reviewTokenOverride?: string) => {
    if (
      !onGenerateProjectMemory ||
      !hasPendingDocumentation ||
      isGenerationActive ||
      (visibleGenerationError !== null && !visibleGenerationRetryable)
    ) {
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationRetryable(true);
    setGenerationStatus(null);
    setIsGenerationStatusDelayed(false);
    setIsRemoteGenerationActive(false);
    const projectId = data.project.id;
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    const reviewToken = reviewTokenOverride ?? generationReview?.review_token ?? "";
    setGenerationReview(null);
    try {
      const result = await onGenerateProjectMemory(reviewToken);
      if (
        projectIdRef.current !== projectId ||
        generationRequestRef.current !== requestId
      ) {
        return;
      }
      if (result.status === "generation_failed") {
        setGenerationError(result.message);
        setGenerationRetryable(result.retryable !== false);
      } else if (result.status === "generation_in_progress") {
        setGenerationStatus(result.message);
        setIsGenerationStatusDelayed(false);
        setIsRemoteGenerationActive(true);
      } else if (result.status === "generation_delayed") {
        setGenerationStatus(result.message);
        setIsGenerationStatusDelayed(true);
      } else {
        setGenerationStatus(result.message);
        setIsGenerationStatusDelayed(false);
      }
    } catch (error) {
      if (
        projectIdRef.current !== projectId ||
        generationRequestRef.current !== requestId
      ) {
        return;
      }
      setGenerationError(
        error instanceof Error ? error.message : t("memory.failed"),
      );
    } finally {
      if (
        projectIdRef.current === projectId &&
        generationRequestRef.current === requestId
      ) {
        setIsGenerating(false);
      }
    }
  };

  const loadMoreArtifacts = async () => {
    if (!onLoadMemoryArtifacts || isArtifactHistoryLoading) {
      return;
    }

    setIsArtifactHistoryLoading(true);
    setArtifactHistoryError(null);
    try {
      setLoadedArtifacts(await onLoadMemoryArtifacts(nextArtifactLoadLimit));
    } catch (error) {
      setArtifactHistoryError(
        error instanceof Error ? error.message : t("memory.historyLoadFailed"),
      );
    } finally {
      setIsArtifactHistoryLoading(false);
    }
  };

  const openGenerationReview = async () => {
    if (!onLoadMemoryGenerationReview || isGenerationActive) return;
    setIsReviewLoading(true);
    setReviewError(null);
    try {
      setGenerationReview(await onLoadMemoryGenerationReview());
      setShowGenerationConfirm(false);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Prompt review failed.");
    } finally {
      setIsReviewLoading(false);
    }
  };

  const proceedWithoutReview = async () => {
    if (!onLoadMemoryGenerationReview) return;
    setIsReviewLoading(true);
    setReviewError(null);
    try {
      const review = await onLoadMemoryGenerationReview();
      setShowGenerationConfirm(false);
      await createProjectMemory(review.review_token);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Memory generation failed.");
    } finally {
      setIsReviewLoading(false);
    }
  };

  const removeReviewedPrompt = async (eventId: string) => {
    setDeletingPromptId(eventId);
    setReviewError(null);
    try {
      await deleteMemoryGenerationReviewPrompt(data.project.id, eventId);
      setGenerationReview(
        onLoadMemoryGenerationReview ? await onLoadMemoryGenerationReview() : null,
      );
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Prompt deletion failed.");
    } finally {
      setDeletingPromptId(null);
    }
  };

  const removeReviewedSection = async (sessionId: string) => {
    const prompts = generationReview?.prompts.filter((prompt) => prompt.session_id === sessionId) ?? [];
    for (const prompt of prompts) {
      await removeReviewedPrompt(prompt.event_id);
    }
  };

  const approveForAgentUse = async () => {
    if (!onApproveProjectMemory || isApprovingForAgents) {
      return;
    }
    setIsApprovingForAgents(true);
    setApprovalError(null);
    try {
      await onApproveProjectMemory();
    } catch (error) {
      setApprovalError(
        error instanceof Error ? error.message : t("memory.approvalFailed"),
      );
    } finally {
      setIsApprovingForAgents(false);
    }
  };

  const selectMemoryView = (view: MemoryPanelView, focus = false) => {
    setActiveMemoryView(view);
    if (!focus) {
      return;
    }
    window.requestAnimationFrame(() => {
      memoryViewTabListRef.current
        ?.querySelector<HTMLButtonElement>(`[data-memory-view="${view}"]`)
        ?.focus();
    });
  };

  const handleMemoryViewKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const currentIndex = MEMORY_PANEL_VIEWS.indexOf(activeMemoryView);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? MEMORY_PANEL_VIEWS.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % MEMORY_PANEL_VIEWS.length
            : (currentIndex - 1 + MEMORY_PANEL_VIEWS.length) %
              MEMORY_PANEL_VIEWS.length;
    const nextView = MEMORY_PANEL_VIEWS[nextIndex];
    if (nextView) {
      selectMemoryView(nextView, true);
    }
  };

  return (
    <section className="bh-memory-workspace" aria-label={t("project.memory")}>
      <header className="bh-memory-toolbar">
        <div>
          <h2>{t("memory.projectMemory")}</h2>
          <p>{t("memory.description")}</p>
        </div>
      </header>

      {onGenerateProjectMemory && generationStatus ? (
        <div className="bh-memory-status" role="status">
          {generationStatus}
        </div>
      ) : null}
      <div className="bh-memory-documentation">
        {onGenerateProjectMemory ? (
          <section
            className="bh-memory-document-section"
            aria-label={t("memory.generation")}
          >
            {hasPendingDocumentation ? (
              <article
                aria-busy={isGenerationActive || undefined}
                className="bh-memory-document-request"
                data-generating={isGenerationActive ? "true" : "false"}
              >
                <div className="bh-memory-document-row-main">
                  <h3>{t("memory.ready")}</h3>
                  <div className="bh-memory-request-metrics">
                    <span>
                      <strong>{pendingPromptCount.toLocaleString()}</strong>
                      {pendingPromptCount === 1 ? "prompt" : "prompts"}
                    </span>
                    <span>
                      <strong>{pendingSessionCount.toLocaleString()}</strong>
                      {pendingSessionCount === 1 ? "session" : "sessions"}
                    </span>
                  </div>
                  <p>{pendingDateRange ?? t("memory.readyDescription")}</p>
                </div>
                <div className="bh-memory-generation-action">
                  <button
                    aria-busy={isGenerationActive || undefined}
                    aria-disabled={
                      !hasPendingDocumentation ||
                      isGenerationActive ||
                      (visibleGenerationError !== null && !visibleGenerationRetryable)
                    }
                    className="bh-memory-primary-action"
                    disabled={
                      isGenerationActive ||
                      (visibleGenerationError !== null && !visibleGenerationRetryable)
                    }
                    onClick={() => {
                      if (generationReview) {
                        void createProjectMemory();
                      } else {
                        setShowGenerationConfirm(true);
                      }
                    }}
                    type="button"
                  >
                    <Sparkles aria-hidden="true" size={16} strokeWidth={1.7} />
                    <span>
                      {isGenerationActive
                        ? t("memory.updating")
                        : isProjectMemoryGenerationDelayed
                          ? t("memory.updateStatus")
                          : visibleGenerationError
                            ? visibleGenerationRetryable
                              ? t("memory.retryUpdate")
                              : t("memory.failed")
                            : generationReview ? t("memory.create") : "Create project memory"}
                    </span>
                  </button>
                  <span>{t("memory.createHint")}</span>
                </div>
                {isGenerationActive ? (
                  <div
                    aria-live="polite"
                    className="bh-memory-generation-status"
                    role="status"
                  >
                    <div className="bh-memory-generation-progress" aria-hidden="true" />
                    <div className="bh-memory-generation-status-copy">
                      <strong>{t("memory.creating")}</strong>
                      <span>{t("memory.creatingDescription")}</span>
                    </div>
                  </div>
                ) : visibleGenerationError ? (
                  <div
                    className="bh-memory-generation-status"
                    data-error="true"
                    role="alert"
                  >
                    <div>
                      <strong>{t("memory.failed")}</strong>
                      <span>{visibleGenerationError}</span>
                    </div>
                  </div>
                ) : null}
              </article>
            ) : (
              <div className="bh-memory-document-idle" role="status">
                <span>
                  {projectMemoryArtifact
                    ? t("memory.noWaiting")
                    : t("memory.noCurrent")}
                </span>
              </div>
            )}
          </section>
        ) : null}

        {showGenerationConfirm ? (
          <div className="bh-memory-review-overlay" role="presentation">
            <section className="bh-memory-review-dialog bh-memory-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="memory-confirm-title">
              <h3 id="memory-confirm-title">AI 요약 전에 확인해 주세요</h3>
              <p>대기 중인 프롬프트와 관련 응답이 AI 제공자에게 전송됩니다. 비밀번호, 토큰, 개인정보, 비공개 코드를 먼저 확인해 주세요.</p>
              {reviewError ? <p role="alert">{reviewError}</p> : null}
              <footer className="bh-memory-review-actions">
                <button type="button" onClick={() => setShowGenerationConfirm(false)}>Cancel</button>
                <button type="button" onClick={() => void openGenerationReview()} disabled={isReviewLoading}>확인하기</button>
                <button className="bh-memory-primary-action" type="button" onClick={() => void proceedWithoutReview()} disabled={isReviewLoading}>진행하기</button>
              </footer>
            </section>
          </div>
        ) : null}

        {generationReview ? (
          <div className="bh-memory-review-overlay" role="presentation">
            <section className="bh-memory-review-dialog" role="dialog" aria-modal="true" aria-labelledby="memory-review-title">
              <header className="bh-memory-review-header">
                <div>
                  <h3 id="memory-review-title">대기 중인 프롬프트 확인</h3>
                  <p>{generationReview.prompt_count.toLocaleString()}개 프롬프트와 관련 응답이 요약 대기 중입니다.</p>
                </div>
                <button className="bh-icon-button" type="button" aria-label="Close review" onClick={() => setGenerationReview(null)}><X size={16} /></button>
              </header>
              <div className="bh-memory-review-list">
                {generationReview.prompts.length ? Array.from(new Set(generationReview.prompts.map((prompt) => prompt.session_id))).map((sessionId) => {
                  const sectionPrompts = generationReview.prompts.filter((prompt) => prompt.session_id === sessionId);
                  return (
                    <section className="bh-memory-review-section" key={sessionId}>
                      <header><strong>세션 · {sessionId.slice(0, 8)}</strong><button type="button" onClick={() => void removeReviewedSection(sessionId)}>섹션 삭제</button></header>
                      {sectionPrompts.map((prompt) => (
                        <article className="bh-memory-review-item" key={prompt.event_id}>
                          <div><span>{prompt.tool}</span><time>{new Date(prompt.created_at).toLocaleString()}</time></div>
                          <p>{prompt.text || "(empty prompt)"}</p>
                          <button type="button" disabled={deletingPromptId === prompt.event_id} onClick={() => void removeReviewedPrompt(prompt.event_id)}>
                            {deletingPromptId === prompt.event_id ? "삭제 중…" : "프롬프트 삭제"}
                          </button>
                        </article>
                      ))}
                    </section>
                  );
                }) : <p>No prompts remain.</p>}
              </div>
              {isReviewLoading ? <p>Refreshing review…</p> : null}
              {reviewError ? <p role="alert">{reviewError}</p> : null}
              <footer className="bh-memory-review-actions">
                <button type="button" onClick={() => setGenerationReview(null)}>취소</button>
                <button className="bh-memory-primary-action" type="button" disabled={isGenerating || generationReview.prompt_count === 0} onClick={() => void createProjectMemory()}>AI 요약 보내기</button>
              </footer>
            </section>
          </div>
        ) : null}

        <div
          aria-label={t("memory.views")}
          className="bh-memory-view-tabs"
          onKeyDown={handleMemoryViewKeyDown}
          ref={memoryViewTabListRef}
          role="tablist"
        >
          <button
            aria-controls="memory-view-panel-history"
            aria-selected={activeMemoryView === "history"}
            data-active={activeMemoryView === "history" || undefined}
            data-memory-view="history"
            id="memory-view-tab-history"
            onClick={() => selectMemoryView("history")}
            role="tab"
            tabIndex={activeMemoryView === "history" ? 0 : -1}
            type="button"
          >
            <span>{t("memory.history")}</span>
            <small>{totalGeneratedArtifactCount}</small>
          </button>
          <button
            aria-controls="memory-view-panel-current"
            aria-selected={activeMemoryView === "current"}
            data-active={activeMemoryView === "current" || undefined}
            data-memory-view="current"
            id="memory-view-tab-current"
            onClick={() => selectMemoryView("current")}
            role="tab"
            tabIndex={activeMemoryView === "current" ? 0 : -1}
            type="button"
          >
            <span>{t("memory.currentTab")}</span>
          </button>
        </div>

        {activeMemoryView === "current" ? (
          <div
            aria-labelledby="memory-view-tab-current"
            className="bh-memory-view-panel"
            id="memory-view-panel-current"
            role="tabpanel"
            tabIndex={0}
          >
            {projectMemoryArtifact ? (
              <section
                className="bh-memory-document-section"
                aria-labelledby="project-memory-document-title"
              >
                <div className="bh-memory-section-header">
                  <div>
                    <span className="bh-memory-step-kicker">
                      {t("memory.currentDocument")}
                    </span>
                    <h3 id="project-memory-document-title">
                      {t("memory.currentProjectMemory")}
                    </h3>
                    <p>
                      {projectMemoryArtifact.updatedAt
                        ? `Updated ${projectMemoryArtifact.updatedAt}`
                        : t("memory.compiledDocument")}
                    </p>
                  </div>
                  <div className="bh-memory-agent-approval">
                    <span>
                      {projectMemoryArtifact.sourceSessionIds.length > 0
                        ? `${projectMemoryArtifact.sourceSessionIds.length} source ${
                            projectMemoryArtifact.sourceSessionIds.length === 1
                              ? "session"
                              : "sessions"
                          }`
                        : t("memory.compiled")}
                    </span>
                    {projectMemoryNeedsApproval && onApproveProjectMemory ? (
                      <button
                        disabled={isApprovingForAgents}
                        onClick={() => void approveForAgentUse()}
                        type="button"
                      >
                        <CheckCircle2 aria-hidden="true" size={15} />
                        {isApprovingForAgents
                          ? t("memory.approvingForAgents")
                          : t("memory.approveForAgents")}
                      </button>
                    ) : projectMemoryIsApproved ? (
                      <small>{t("memory.approvedForAgents")}</small>
                    ) : null}
                  </div>
                </div>
                {approvalError ? <p role="alert">{approvalError}</p> : null}
                <MarkdownContent
                  className="bh-markdown-preview bh-memory-project-document"
                  emptyLabel={t("memory.noCompiled")}
                  value={
                    projectMemoryArtifact.outcome ?? projectMemoryArtifact.summary ?? ""
                  }
                />
              </section>
            ) : (
              <div className="bh-memory-view-empty" role="status">
                <span className="bh-memory-step-kicker">
                  {t("memory.currentDocument")}
                </span>
                <h3>{t("memory.noCurrent")}</h3>
                <p>{t("memory.currentEmptyDescription")}</p>
              </div>
            )}
          </div>
        ) : (
          <div
            aria-labelledby="memory-view-tab-history"
            className="bh-memory-view-panel"
            id="memory-view-panel-history"
            role="tabpanel"
            tabIndex={0}
          >
            {generatedArtifacts.length > 0 ? (
              <section
                className="bh-memory-document-section"
                aria-labelledby="memory-history-title"
              >
                <div className="bh-memory-section-header">
                  <div>
                    <span className="bh-memory-step-kicker">
                      {t("memory.longTerm")}
                    </span>
                    <h3 id="memory-history-title">{t("memory.history")}</h3>
                    <p>{resultDateRange}</p>
                  </div>
                  <span>{generatedSummaryCountLabel}</span>
                </div>

                <div className="bh-memory-context-list">
                  {generatedArtifacts.map((artifact) => (
                    <MemoryArtifactCard
                      artifact={artifact}
                      key={artifact.id}
                      isSelected={artifact.id === selectedArtifactId}
                      onSelect={(selectedArtifact) =>
                        setSelectedArtifactId(selectedArtifact.id)
                      }
                    />
                  ))}
                  {canLoadMoreArtifacts ? (
                    <button
                      className="bh-memory-load-more"
                      disabled={isArtifactHistoryLoading}
                      onClick={() => void loadMoreArtifacts()}
                      type="button"
                    >
                      {isArtifactHistoryLoading
                        ? t("activity.loading")
                        : t("memory.loadMore")}
                    </button>
                  ) : null}
                  {artifactHistoryError ? (
                    <div
                      className="bh-memory-generation-status"
                      data-error="true"
                      role="alert"
                    >
                      <div>
                        <strong>{t("memory.historyLoadFailedTitle")}</strong>
                        <span>{artifactHistoryError}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <div className="bh-memory-view-empty" role="status">
                <span className="bh-memory-step-kicker">{t("memory.longTerm")}</span>
                <h3>{t("memory.historyEmpty")}</h3>
                <p>{t("memory.historyEmptyDescription")}</p>
              </div>
            )}
          </div>
        )}
      </div>
      {selectedArtifact ? (
        <MemoryArtifactDetailDrawer
          artifact={selectedArtifact}
          artifactCount={generatedArtifacts.length}
          artifactPosition={selectedArtifactIndex + 1}
          onClose={() => setSelectedArtifactId(null)}
          onNext={
            selectedArtifactIndex < generatedArtifacts.length - 1
              ? () => setSelectedArtifactId(generatedArtifacts[selectedArtifactIndex + 1].id)
              : undefined
          }
          onOpenSession={(sessionId) => {
            setSelectedArtifactId(null);
            onOpenSession?.(sessionId);
          }}
          onPrevious={
            selectedArtifactIndex > 0
              ? () => setSelectedArtifactId(generatedArtifacts[selectedArtifactIndex - 1].id)
              : undefined
          }
        />
      ) : null}
    </section>
  );
}
