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
import type { ProjectMemoryGenerationResponse } from "../../api/projects";
import { useI18n } from "../../i18n/I18nProvider";
import { MarkdownContent } from "../MarkdownContent";
import { displayMemoryOutcome } from "./memoryOutcome";
import type {
  ProjectDetailData,
  ProjectMemoryArtifact,
} from "./types";

export type MemoryGenerationResult = ProjectMemoryGenerationResponse;

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
  const [areAllFilesVisible, setAreAllFilesVisible] = useState(false);
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
  const visibleFiles = areAllFilesVisible ? changedFiles : changedFiles.slice(0, 5);
  const hiddenFileCount = Math.max(changedFiles.length - visibleFiles.length, 0);

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
    setAreAllFilesVisible(false);
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
                {visibleFiles.map((file) => {
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
              {changedFiles.length > 5 ? (
                <button
                  aria-controls="memory-detail-files-list"
                  aria-expanded={areAllFilesVisible}
                  className="bh-memory-detail-expand-button"
                  onClick={() => setAreAllFilesVisible((isVisible) => !isVisible)}
                  type="button"
                >
                  {areAllFilesVisible
                    ? "Show fewer files"
                    : `Show ${hiddenFileCount} more ${hiddenFileCount === 1 ? "file" : "files"}`}
                </button>
              ) : null}
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
  onGenerateProjectMemory,
  onLoadMemoryArtifacts,
  onOpenSession,
}: {
  data: ProjectDetailData;
  isProjectMemoryGenerationActive?: boolean;
  isProjectMemoryGenerationDelayed?: boolean;
  onGenerateProjectMemory?: () => Promise<MemoryGenerationResult>;
  onLoadMemoryArtifacts?: (limit: number) => Promise<ProjectMemoryArtifact[]>;
  onOpenSession?: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const [loadedArtifacts, setLoadedArtifacts] = useState<ProjectMemoryArtifact[] | null>(null);
  const displayedArtifacts = loadedArtifacts ?? data.memory.recentArtifacts;
  const projectMemoryArtifact = data.memory.recentArtifacts.find(
    (artifact) =>
      artifact.artifactStage === "project_memory" || artifact.memoryScope === "project",
  );
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
  const [isRemoteGenerationActive, setIsRemoteGenerationActive] = useState(false);
  const [isArtifactHistoryLoading, setIsArtifactHistoryLoading] = useState(false);
  const [artifactHistoryError, setArtifactHistoryError] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const generationRequestRef = useRef(0);
  const projectIdRef = useRef(data.project.id);
  const previousSharedDelayedRef = useRef(isProjectMemoryGenerationDelayed);
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

  const createProjectMemory = async () => {
    if (
      !onGenerateProjectMemory ||
      !hasPendingDocumentation ||
      isGenerationActive ||
      (generationError !== null && !generationRetryable)
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
    try {
      const result = await onGenerateProjectMemory();
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

  return (
    <section className="bh-memory-workspace" aria-label={t("project.memory")}>
      <header className="bh-memory-toolbar">
        <div>
          <h2>{t("memory.projectMemory")}</h2>
          <p>{t("memory.description")}</p>
        </div>
      </header>

      {generationStatus ? (
        <div className="bh-memory-status" role="status">
          {generationStatus}
        </div>
      ) : null}
      <div className="bh-memory-documentation">
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
                <p>
                  {pendingDateRange ?? t("memory.readyDescription")}
                </p>
              </div>
              <div className="bh-memory-generation-action">
                <button
                  aria-busy={isGenerationActive || undefined}
                  aria-disabled={
                    !hasPendingDocumentation ||
                    !onGenerateProjectMemory ||
                    isGenerationActive ||
                    (generationError !== null && !generationRetryable)
                  }
                  className="bh-memory-primary-action"
                  onClick={() => void createProjectMemory()}
                  disabled={
                    !onGenerateProjectMemory ||
                    isGenerationActive ||
                    (generationError !== null && !generationRetryable)
                  }
                  type="button"
                >
                  <Sparkles aria-hidden="true" size={16} strokeWidth={1.7} />
                  <span>
                    {isGenerationActive
                      ? t("memory.updating")
                      : isProjectMemoryGenerationDelayed
                        ? t("memory.updateStatus")
                      : generationError
                        ? generationRetryable
                          ? t("memory.retryUpdate")
                          : t("memory.failed")
                        : t("memory.create")}
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
              ) : generationError ? (
                <div className="bh-memory-generation-status" data-error="true" role="alert">
                  <div>
                    <strong>{t("memory.failed")}</strong>
                    <span>{generationError}</span>
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

        {projectMemoryArtifact ? (
          <section
            className="bh-memory-document-section"
            aria-labelledby="project-memory-document-title"
          >
            <div className="bh-memory-section-header">
              <div>
                <span className="bh-memory-step-kicker">{t("memory.currentDocument")}</span>
                <h3 id="project-memory-document-title">{t("memory.currentProjectMemory")}</h3>
                <p>
                  {projectMemoryArtifact.updatedAt
                    ? `Updated ${projectMemoryArtifact.updatedAt}`
                    : t("memory.compiledDocument")}
                </p>
              </div>
              <span>
                {projectMemoryArtifact.sourceSessionIds.length > 0
                  ? `${projectMemoryArtifact.sourceSessionIds.length} source ${
                      projectMemoryArtifact.sourceSessionIds.length === 1
                        ? "session"
                        : "sessions"
                    }`
                  : t("memory.compiled")}
              </span>
            </div>
            <MarkdownContent
              className="bh-markdown-preview bh-memory-project-document"
              emptyLabel={t("memory.noCompiled")}
              value={
                projectMemoryArtifact.outcome ?? projectMemoryArtifact.summary ?? ""
              }
            />
          </section>
        ) : null}

        {generatedArtifacts.length > 0 ? (
          <section
            className="bh-memory-document-section"
            aria-labelledby="memory-history-title"
          >
            <div className="bh-memory-section-header">
              <div>
                <span className="bh-memory-step-kicker">{t("memory.longTerm")}</span>
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
                  onSelect={(selectedArtifact) => setSelectedArtifactId(selectedArtifact.id)}
                />
              ))}
              {canLoadMoreArtifacts ? (
                <button
                  className="bh-memory-load-more"
                  disabled={isArtifactHistoryLoading}
                  onClick={() => void loadMoreArtifacts()}
                  type="button"
                >
                  {isArtifactHistoryLoading ? t("activity.loading") : t("memory.loadMore")}
                </button>
              ) : null}
              {artifactHistoryError ? (
                <div className="bh-memory-generation-status" data-error="true" role="alert">
                  <div>
                    <strong>{t("memory.historyLoadFailedTitle")}</strong>
                    <span>{artifactHistoryError}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
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
