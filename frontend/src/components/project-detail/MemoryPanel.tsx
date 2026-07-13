import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowRight, ChevronRight, Sparkles, X } from "lucide-react";
import type { ProjectMemoryGenerationResponse } from "../../api/projects";
import { MarkdownContent } from "../MarkdownContent";
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
  onClose,
  onOpenSession,
}: {
  artifact: ProjectMemoryArtifact;
  onClose: () => void;
  onOpenSession?: (sessionId: string) => void;
}) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const sections = (artifact.sections ?? []).filter(
    (section) => section.title?.trim() && section.summary?.trim(),
  );
  const outcome =
    artifact.outcome && artifact.outcome !== artifact.summary ? artifact.outcome : null;
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
  const metadataRows = [
    { label: "Covered dates", value: dateRange },
    {
      label: "Sources",
      value:
        sourceSessionIds.length > 0
          ? `${sourceSessionIds.length} ${
              sourceSessionIds.length === 1 ? "session" : "sessions"
            }`
          : null,
    },
    { label: "Prompts", value: artifact.promptCount ? artifact.promptCount.toString() : null },
    { label: "Files changed", value: changedFileCount > 0 ? changedFileCount.toString() : null },
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
        <div className="bh-memory-detail-header">
          <div>
            <span>{dateRange ?? "Project memory"}</span>
            <h2 id="memory-detail-title">{artifact.title}</h2>
          </div>
          <button
            aria-label="Close memory details"
            className="bh-icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="bh-memory-detail-body">
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

          {metadataRows.length > 0 ? (
            <dl className="bh-memory-detail-meta">
              {metadataRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <article className="bh-memory-detail-section">
            <span className="bh-memory-step-kicker">Summary</span>
            <p>{artifact.summary || "No summary is available for this memory."}</p>
          </article>

          {outcome ? (
            <article className="bh-memory-detail-section">
              <span className="bh-memory-step-kicker">Outcome</span>
              <p>{outcome}</p>
            </article>
          ) : null}

          {sections.length > 0 ? (
            <article className="bh-memory-detail-section">
              <span className="bh-memory-step-kicker">Key Notes</span>
              <div className="bh-memory-detail-section-list">
                {sections.map((section) => (
                  <section key={`${artifact.id}-${section.title}`}>
                    <h3>{section.title}</h3>
                    <p>{section.summary}</p>
                  </section>
                ))}
              </div>
            </article>
          ) : null}

          {changedFiles.length > 0 ? (
            <article className="bh-memory-detail-section">
              <span className="bh-memory-step-kicker">Changed Files</span>
              <ul className="bh-memory-detail-file-list">
                {changedFiles.slice(0, 12).map((file) => (
                  <li key={`${artifact.id}-${file.path}`}>
                    <span>{file.path}</span>
                    {file.status ? <small>{file.status}</small> : null}
                  </li>
                ))}
              </ul>
              {changedFiles.length > 12 ? (
                <small className="bh-memory-detail-muted">
                  {changedFiles.length - 12} more files not shown.
                </small>
              ) : null}
            </article>
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
      isGenerationActive
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
        error instanceof Error ? error.message : "Memory creation failed.",
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
        error instanceof Error ? error.message : "Memory history could not be loaded.",
      );
    } finally {
      setIsArtifactHistoryLoading(false);
    }
  };

  return (
    <section className="bh-memory-workspace" aria-label="Memory">
      <header className="bh-memory-toolbar">
        <div>
          <h2>Project Memory</h2>
          <p>Verify captured work and keep long-term project context current.</p>
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
          aria-label="Memory generation"
        >
          {hasPendingDocumentation ? (
            <article
              aria-busy={isGenerationActive || undefined}
              className="bh-memory-document-request"
              data-generating={isGenerationActive ? "true" : "false"}
            >
              <div className="bh-memory-document-row-main">
                <h3>Ready to generate</h3>
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
                  {pendingDateRange ?? "Captured work is ready to compile."}
                </p>
              </div>
              <button
                aria-busy={isGenerationActive || undefined}
                aria-disabled={
                  !hasPendingDocumentation ||
                  !onGenerateProjectMemory ||
                  isGenerationActive
                }
                className="bh-memory-primary-action"
                onClick={() => void createProjectMemory()}
                type="button"
              >
                <Sparkles aria-hidden="true" size={16} strokeWidth={1.7} />
                <span>
                  {isGenerationActive
                    ? "Updating project memory"
                    : isProjectMemoryGenerationDelayed
                      ? "Check update status"
                    : generationError
                      ? generationRetryable
                        ? "Retry update"
                        : "Retry with latest work"
                      : "Create project memory"}
                </span>
              </button>
              {isGenerationActive ? (
                <div
                  aria-live="polite"
                  className="bh-memory-generation-status"
                  role="status"
                >
                  <div className="bh-memory-generation-progress" aria-hidden="true" />
                  <div className="bh-memory-generation-status-copy">
                    <strong>Creating project memory</strong>
                    <span>Memory will refresh when the source work has been processed.</span>
                  </div>
                </div>
              ) : generationError ? (
                <div className="bh-memory-generation-status" data-error="true" role="alert">
                  <div>
                    <strong>Generation failed.</strong>
                    <span>{generationError}</span>
                  </div>
                </div>
              ) : null}
            </article>
          ) : (
            <div className="bh-memory-document-idle" role="status">
              <span>
                {projectMemoryArtifact
                  ? "No work waiting for review."
                  : "No project memory yet."}
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
                <span className="bh-memory-step-kicker">Current document</span>
                <h3 id="project-memory-document-title">Current Project Memory</h3>
                <p>
                  {projectMemoryArtifact.updatedAt
                    ? `Updated ${projectMemoryArtifact.updatedAt}`
                    : "Compiled project memory"}
                </p>
              </div>
              <span>
                {projectMemoryArtifact.sourceSessionIds.length > 0
                  ? `${projectMemoryArtifact.sourceSessionIds.length} source ${
                      projectMemoryArtifact.sourceSessionIds.length === 1
                        ? "session"
                        : "sessions"
                    }`
                  : "Compiled"}
              </span>
            </div>
            <MarkdownContent
              className="bh-markdown-preview bh-memory-project-document"
              emptyLabel="No compiled content available."
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
                <span className="bh-memory-step-kicker">Long-term context</span>
                <h3 id="memory-history-title">Memory history</h3>
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
                  {isArtifactHistoryLoading ? "Loading" : "Load more memory"}
                </button>
              ) : null}
              {artifactHistoryError ? (
                <div className="bh-memory-generation-status" data-error="true" role="alert">
                  <div>
                    <strong>History could not be loaded.</strong>
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
          onClose={() => setSelectedArtifactId(null)}
          onOpenSession={(sessionId) => {
            setSelectedArtifactId(null);
            onOpenSession?.(sessionId);
          }}
        />
      ) : null}
    </section>
  );
}
