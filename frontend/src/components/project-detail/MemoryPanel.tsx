import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ProjectDetailData } from "./types";

export type MemoryCheckpointResult = {
  message: string;
  status: "generation_failed" | "memory_generated" | "no_memory" | string;
};

export function MemoryPanel({
  data,
  onCheckpointMemory,
  onCompileProjectMemory,
  onSaveProjectMemory,
}: {
  data: ProjectDetailData;
  onCheckpointMemory?: (sessionIds: string[]) => Promise<MemoryCheckpointResult>;
  onCompileProjectMemory?: () => Promise<void>;
  onSaveProjectMemory?: (bodyMarkdown: string) => Promise<void>;
}) {
  const checkpointableRanges = data.memory.pendingRanges.filter(
    (range) => range.canCheckpoint,
  );
  const hasPendingDocumentation = data.memory.pendingRanges.length > 0;
  const pendingBatchCount = data.memory.pendingRanges.length > 0 ? 1 : 0;
  const projectMemoryUpdatedAt =
    data.memory.projectMemoryArtifact?.updatedAt ??
    data.memory.projectMemoryArtifact?.createdAt ??
    data.memory.latestArtifactAt;
  const projectMemoryStateLabel = data.memory.projectMemory ? "Ready" : "Empty";
  const projectMemoryFreshnessLabel = data.memory.projectMemory
    ? pendingBatchCount > 0
      ? `${pendingBatchCount} pending batch`
      : projectMemoryUpdatedAt
        ? `Updated ${projectMemoryUpdatedAt}`
        : "Ready"
    : pendingBatchCount > 0
      ? "Ready to generate"
      : "Empty";
  const [checkpointStatus, setCheckpointStatus] = useState<string | null>(null);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [isCheckpointing, setIsCheckpointing] = useState(false);
  const [isEditingProjectMemory, setIsEditingProjectMemory] = useState(false);
  const [isProjectMemoryRegenerating, setIsProjectMemoryRegenerating] = useState(false);
  const [isProjectMemorySaving, setIsProjectMemorySaving] = useState(false);
  const [projectMemoryDraft, setProjectMemoryDraft] = useState(
    data.memory.projectMemory?.bodyMarkdown ?? "",
  );
  const [projectMemoryError, setProjectMemoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditingProjectMemory) {
      setProjectMemoryDraft(data.memory.projectMemory?.bodyMarkdown ?? "");
    }
  }, [data.memory.projectMemory?.bodyMarkdown, isEditingProjectMemory]);

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

  const saveProjectMemory = async () => {
    if (!onSaveProjectMemory || isProjectMemorySaving) {
      return;
    }
    setIsProjectMemorySaving(true);
    setProjectMemoryError(null);
    try {
      await onSaveProjectMemory(projectMemoryDraft);
      setIsEditingProjectMemory(false);
    } catch (error) {
      setProjectMemoryError(
        error instanceof Error ? error.message : "Project Memory save failed.",
      );
    } finally {
      setIsProjectMemorySaving(false);
    }
  };

  const regenerateProjectMemory = async () => {
    if (!onCompileProjectMemory || isProjectMemoryRegenerating) {
      return;
    }
    setIsProjectMemoryRegenerating(true);
    setProjectMemoryError(null);
    try {
      await onCompileProjectMemory();
    } catch (error) {
      setProjectMemoryError(
        error instanceof Error ? error.message : "Project Memory regenerate failed.",
      );
    } finally {
      setIsProjectMemoryRegenerating(false);
    }
  };

  return (
    <section className="bh-memory-workspace" aria-label="Memory">
      <header className="bh-memory-toolbar">
        <div>
          <h2>Memory</h2>
          <p>Keep project context up to date for future AI coding sessions.</p>
        </div>
      </header>

      <div className="bh-memory-summary-strip" aria-label="Memory status summary">
        <span>{hasPendingDocumentation ? "Update ready" : "No pending update"}</span>
        <span>Project Memory: {projectMemoryStateLabel}</span>
      </div>

      {checkpointStatus ? (
        <div className="bh-memory-status" role="status">
          {checkpointStatus}
        </div>
      ) : null}
      <div className="bh-memory-documentation">
        {hasPendingDocumentation ? (
          <article
            aria-busy={isCheckpointing}
            aria-labelledby="memory-request-title"
            className="bh-memory-document-request"
            data-generating={isCheckpointing ? "true" : "false"}
          >
            <div className="bh-memory-document-row-main">
              <h3 id="memory-request-title">Project Memory update ready</h3>
              <p>Generate one updated memory document from captured work.</p>
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
                {isCheckpointing ? "Generating" : checkpointError ? "Retry" : "Generate"}
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
                  <strong>Generating Project Memory</strong>
                  <span>The final document will appear below when it is ready.</span>
                </div>
              </div>
            ) : checkpointError ? (
              <div className="bh-memory-generation-status" data-error="true" role="alert">
                <div>
                  <strong>Summary generation failed.</strong>
                  <span>{checkpointError}</span>
                </div>
              </div>
            ) : null}
          </article>
        ) : (
          <div className="bh-memory-document-idle">
            <strong>No pending update</strong>
            <span>New captured work will appear here when Project Memory is ready to refresh.</span>
          </div>
        )}

        <section
          className="bh-memory-document-section"
          aria-labelledby="memory-completed-title"
        >
          <div className="bh-memory-section-header">
            <div>
              <span className="bh-memory-step-kicker">Result</span>
              <h3 id="memory-completed-title">Project Memory</h3>
              <p>Final memory document for future coding sessions.</p>
            </div>
            <span>{isCheckpointing ? "Generating" : projectMemoryFreshnessLabel}</span>
          </div>

          {projectMemoryError ? (
            <div className="bh-memory-status" data-error="true" role="alert">
              {projectMemoryError}
            </div>
          ) : null}

          {data.memory.projectMemory || isCheckpointing ? (
            <div className="bh-memory-document-list">
              {isCheckpointing ? (
                <article
                  aria-label="Generating new memory document"
                  className="bh-memory-document-row bh-memory-document-placeholder"
                >
                  <div className="bh-memory-document-row-main">
                    <span className="bh-memory-step-kicker">Generating</span>
                    <strong>Project Memory document</strong>
                    <small>The finished document will appear here.</small>
                    <div className="bh-memory-document-placeholder-lines" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </article>
              ) : null}

              {data.memory.projectMemory ? (
                <details className="bh-memory-document-row" open>
                  <summary>
                    <div className="bh-memory-document-row-main">
                      <span className="bh-memory-step-kicker">Project Memory</span>
                      <strong>Project Memory document</strong>
                      <small>{projectMemoryFreshnessLabel}</small>
                    </div>
                    <div className="bh-memory-document-actions">
                      <button
                        disabled={!onCompileProjectMemory || isProjectMemoryRegenerating}
                        onClick={(event) => {
                          event.stopPropagation();
                          void regenerateProjectMemory();
                        }}
                        type="button"
                      >
                        {isProjectMemoryRegenerating ? "Regenerating" : "Regenerate"}
                      </button>
                    </div>
                  </summary>

                  {isEditingProjectMemory ? (
                    <div className="bh-memory-edit-form">
                      <label>
                        <span>Project Memory markdown</span>
                        <textarea
                          onChange={(event) => setProjectMemoryDraft(event.target.value)}
                          rows={18}
                          value={projectMemoryDraft}
                        />
                      </label>
                      <div className="bh-memory-card-actions">
                        <button
                          className="bh-memory-primary-action"
                          disabled={!onSaveProjectMemory || isProjectMemorySaving}
                          onClick={() => void saveProjectMemory()}
                          type="button"
                        >
                          {isProjectMemorySaving ? "Saving" : "Save"}
                        </button>
                        <button
                          disabled={isProjectMemorySaving}
                          onClick={() => {
                            setProjectMemoryDraft(data.memory.projectMemory?.bodyMarkdown ?? "");
                            setIsEditingProjectMemory(false);
                            setProjectMemoryError(null);
                          }}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bh-memory-document-preview">
                      <pre>{data.memory.projectMemory.bodyMarkdown}</pre>
                      <div className="bh-memory-card-actions">
                        <button
                          disabled={!onSaveProjectMemory}
                          onClick={() => {
                            setProjectMemoryDraft(data.memory.projectMemory?.bodyMarkdown ?? "");
                            setIsEditingProjectMemory(true);
                            setProjectMemoryError(null);
                          }}
                          type="button"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </details>
              ) : null}

            </div>
          ) : (
            <div className="bh-memory-empty">
              <strong>No Project Memory yet</strong>
              <span>Generate the pending update to create the first memory document.</span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
