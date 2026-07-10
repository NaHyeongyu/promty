import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronRight, Sparkles, X } from "lucide-react";
import type {
  ProjectDetailData,
  ProjectMemoryArtifact,
} from "./types";

export type MemoryCheckpointResult = {
  message: string;
  status: "generation_failed" | "memory_generated" | "no_memory" | string;
};

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
}: {
  artifact: ProjectMemoryArtifact;
  onClose: () => void;
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
  const metadataRows = [
    { label: "Covered dates", value: dateRange },
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
            <span>{dateRange ?? "Generated summary"}</span>
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
  onCheckpointMemory,
  onLoadMemoryArtifacts,
}: {
  data: ProjectDetailData;
  onCheckpointMemory?: (sessionIds: string[]) => Promise<MemoryCheckpointResult>;
  onLoadMemoryArtifacts?: (limit: number) => Promise<ProjectMemoryArtifact[]>;
}) {
  const [loadedArtifacts, setLoadedArtifacts] = useState<ProjectMemoryArtifact[] | null>(null);
  const displayedArtifacts = loadedArtifacts ?? data.memory.recentArtifacts;
  const checkpointableRanges = data.memory.pendingRanges.filter(
    (range) => range.canCheckpoint,
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
  const pendingBatchCount = data.memory.pendingRanges.length;
  const pendingBatchLabel = `${pendingBatchCount} ${
    pendingBatchCount === 1 ? "batch" : "batches"
  }`;
  const checkpointableBatchLabel = `${checkpointableRanges.length} ${
    checkpointableRanges.length === 1 ? "session" : "sessions"
  }`;
  const generatedSummaryCountLabel =
    totalGeneratedArtifactCount > generatedArtifacts.length
      ? `${generatedArtifacts.length} of ${totalGeneratedArtifactCount} summaries`
      : `${generatedArtifacts.length} ${
          generatedArtifacts.length === 1 ? "summary" : "summaries"
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
  const [checkpointStatus, setCheckpointStatus] = useState<string | null>(null);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [isCheckpointing, setIsCheckpointing] = useState(false);
  const [isArtifactHistoryLoading, setIsArtifactHistoryLoading] = useState(false);
  const [artifactHistoryError, setArtifactHistoryError] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const selectedArtifact =
    generatedArtifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null;

  useEffect(() => {
    setLoadedArtifacts(null);
    setArtifactHistoryError(null);
  }, [data.project.id, data.memory.latestArtifactAt, data.memory.totalArtifacts]);

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

  const organizePendingBatch = async () => {
    if (!onCheckpointMemory || isCheckpointing) {
      return;
    }
    const sessionIds = checkpointableRanges.map((range) => range.sessionId);
    if (sessionIds.length === 0) {
      return;
    }

    setIsCheckpointing(true);
    setCheckpointError(null);
    setCheckpointStatus(null);
    try {
      const result = await onCheckpointMemory(sessionIds);
      setCheckpointStatus(result.message);
    } catch (error) {
      setCheckpointError(
        error instanceof Error ? error.message : "Pending Work organization failed.",
      );
    } finally {
      setIsCheckpointing(false);
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
          <p>Review generated summaries and organize pending work.</p>
        </div>
      </header>

      <div className="bh-memory-summary-strip" aria-label="Memory status summary">
        <span>Pending: {hasPendingDocumentation ? pendingBatchLabel : "None"}</span>
        <span>Generated: {generatedSummaryCountLabel}</span>
      </div>

      {checkpointStatus ? (
        <div className="bh-memory-status" role="status">
          {checkpointStatus}
        </div>
      ) : null}
      <div className="bh-memory-documentation">
        <section
          className="bh-memory-document-section"
          aria-labelledby="memory-request-title"
        >
          <div className="bh-memory-section-header">
            <div>
              <span className="bh-memory-step-kicker">Pending</span>
              <h3 id="memory-request-title">Update</h3>
              <p>{pendingDateRange ?? "No captured range waiting."}</p>
            </div>
            <span>{hasPendingDocumentation ? checkpointableBatchLabel : "Clear"}</span>
          </div>

          {hasPendingDocumentation ? (
            <article
              aria-busy={isCheckpointing}
              className="bh-memory-document-request"
              data-generating={isCheckpointing ? "true" : "false"}
            >
              <div className="bh-memory-document-row-main">
                <h3>Pending work</h3>
                <p>
                  {pendingDateRange ?? "Captured work is ready to compile."}
                  {checkpointableRanges.length > 0 ? ` · ${checkpointableBatchLabel}` : ""}
                </p>
              </div>
              <button
                className="bh-memory-primary-action"
                disabled={
                  checkpointableRanges.length === 0 || !onCheckpointMemory || isCheckpointing
                }
                onClick={() => void organizePendingBatch()}
                type="button"
              >
                <Sparkles aria-hidden="true" size={16} strokeWidth={1.7} />
                <span>
                  {isCheckpointing
                    ? "Generating"
                    : checkpointError
                      ? "Retry"
                      : "Generate"}
                </span>
              </button>
              {isCheckpointing ? (
                <div
                  aria-live="polite"
                  className="bh-memory-generation-status"
                  role="status"
                >
                  <div className="bh-memory-generation-progress" aria-hidden="true" />
                  <div className="bh-memory-generation-status-copy">
                    <strong>Generating summary</strong>
                    <span>Generated summaries will refresh when generation finishes.</span>
                  </div>
                </div>
              ) : checkpointError ? (
                <div className="bh-memory-generation-status" data-error="true" role="alert">
                  <div>
                    <strong>Generation failed.</strong>
                    <span>{checkpointError}</span>
                  </div>
                </div>
              ) : null}
            </article>
          ) : (
            <div className="bh-memory-document-idle">
              <strong>No pending update</strong>
              <span>No captured work is waiting to be generated.</span>
            </div>
          )}
        </section>

        <section
          className="bh-memory-document-section"
          aria-labelledby="memory-history-title"
        >
          <div className="bh-memory-section-header">
            <div>
              <span className="bh-memory-step-kicker">Generated</span>
              <h3 id="memory-history-title">Generated Summaries</h3>
              <p>{resultDateRange ?? "No generated summaries yet."}</p>
            </div>
            <span>{generatedArtifacts.length > 0 ? generatedSummaryCountLabel : "Empty"}</span>
          </div>

          {generatedArtifacts.length > 0 ? (
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
                  {isArtifactHistoryLoading ? "Loading" : "Load more summaries"}
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
          ) : (
            <div className="bh-memory-empty">
              <strong>No generated summaries yet</strong>
              <span>Generated summaries will appear here.</span>
            </div>
          )}
        </section>
      </div>
      {selectedArtifact ? (
        <MemoryArtifactDetailDrawer
          artifact={selectedArtifact}
          onClose={() => setSelectedArtifactId(null)}
        />
      ) : null}
    </section>
  );
}
