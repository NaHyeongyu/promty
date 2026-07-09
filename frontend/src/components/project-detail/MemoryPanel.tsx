import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
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

function memoryArtifactKind(artifact: ProjectMemoryArtifact) {
  if (artifact.memoryScope === "verified" || artifact.artifactStage === "verified_memory") {
    return "Verified memory";
  }
  return "Generated memory";
}

function memoryArtifactMeta(artifact: ProjectMemoryArtifact) {
  return [
    artifact.updatedAt ?? artifact.createdAt,
    artifact.promptCount && artifact.promptCount > 0
      ? `${artifact.promptCount} prompts`
      : null,
    artifact.changedFileCount > 0 ? `${artifact.changedFileCount} files` : null,
    artifact.model,
  ]
    .filter((item): item is string => Boolean(item))
    .join(" · ");
}

function MemoryArtifactCard({
  artifact,
  open = false,
}: {
  artifact: ProjectMemoryArtifact;
  open?: boolean;
}) {
  const sections = artifact.sections.filter(
    (section) => section.title.trim() && section.summary.trim(),
  );
  const meta = memoryArtifactMeta(artifact);
  const outcome =
    artifact.outcome && artifact.outcome !== artifact.summary ? artifact.outcome : null;

  return (
    <details className="bh-memory-context-item" open={open}>
      <summary>
        <span>{artifact.title}</span>
        <small>{meta || memoryArtifactKind(artifact)}</small>
      </summary>
      <div className="bh-memory-card-copy">
        <div className="bh-memory-card-meta">
          <span>{memoryArtifactKind(artifact)}</span>
          {artifact.draftType ? <span>{artifact.draftType}</span> : null}
          {artifact.needsUserVerification ? <span>Needs review</span> : null}
        </div>
        {artifact.summary ? <p>{artifact.summary}</p> : null}
        {outcome ? <p>{outcome}</p> : null}
        {sections.length > 0 ? (
          <div className="bh-memory-structured-sections">
            {sections.map((section) => (
              <div key={`${artifact.id}-${section.title}`}>
                <strong>{section.title}</strong>
                <p>{section.summary}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

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
  const generatedArtifacts = data.memory.recentArtifacts.filter(isGeneratedMemoryArtifact);
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
        <span>Generated: {generatedArtifacts.length}</span>
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
          aria-labelledby="memory-generated-title"
        >
          <div className="bh-memory-section-header">
            <div>
              <span className="bh-memory-step-kicker">Generated</span>
              <h3 id="memory-generated-title">Generated memories</h3>
              <p>Saved context generated from completed work.</p>
            </div>
            <span>
              {generatedArtifacts.length > 0
                ? `${generatedArtifacts.length} recent`
                : "Empty"}
            </span>
          </div>

          {generatedArtifacts.length > 0 ? (
            <div className="bh-memory-context-list">
              {generatedArtifacts.map((artifact, index) => (
                <MemoryArtifactCard
                  artifact={artifact}
                  key={artifact.id}
                  open={index === 0}
                />
              ))}
            </div>
          ) : (
            <div className="bh-memory-empty">
              <strong>No generated memories yet</strong>
              <span>Generate the pending update to create reviewable memory items.</span>
            </div>
          )}
        </section>

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
                <details className="bh-memory-document-row">
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
                      <div className="bh-memory-card-copy">
                        <strong>Compiled Project Memory</strong>
                        <p>
                          {data.memory.projectMemory.sourceMemoryIds.length > 0
                            ? `Compiled from ${data.memory.projectMemory.sourceMemoryIds.length} generated memories.`
                            : "Compiled memory document is available."}
                        </p>
                        {data.memory.projectMemory.warnings.length > 0 ? (
                          <p>{data.memory.projectMemory.warnings.join(" ")}</p>
                        ) : null}
                      </div>
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
