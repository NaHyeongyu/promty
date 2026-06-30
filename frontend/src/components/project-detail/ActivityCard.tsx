import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import type { ActivityItem, PromptActivityItem } from "./types";

const PROMPT_PREVIEW_LINES = 10;

function PromptText({
  expandable = true,
  text,
}: {
  expandable?: boolean;
  text: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { isLong, preview } = useMemo(() => {
    const lines = text.split(/\r?\n/);
    return {
      isLong: lines.length > PROMPT_PREVIEW_LINES,
      preview:
        lines.length > PROMPT_PREVIEW_LINES
          ? `${lines.slice(0, PROMPT_PREVIEW_LINES).join("\n")}\n...`
          : text,
    };
  }, [text]);

  return (
    <div className="bh-prompt-text">
      <p>{isExpanded || !isLong ? text : preview}</p>
      {expandable && isLong ? (
        <button
          className="bh-prompt-more-button"
          onClick={(event) => {
            event.stopPropagation();
            setIsExpanded((expanded) => !expanded);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
          type="button"
        >
          {isExpanded ? "접기" : "더보기"}
        </button>
      ) : null}
    </div>
  );
}

function promptTruncatedLabel(activity: PromptActivityItem) {
  if (!activity.promptTruncated) {
    return null;
  }
  if (activity.promptStorageLimit) {
    return `truncated at ${activity.promptStorageLimit.toLocaleString()} chars`;
  }
  if (activity.promptOriginalLength) {
    return `${activity.promptOriginalLength.toLocaleString()} chars truncated`;
  }
  return "truncated";
}

function responseTruncatedLabel(activity: PromptActivityItem) {
  if (!activity.responseTruncated) {
    return null;
  }
  if (activity.responseStorageLimit) {
    return `response truncated at ${activity.responseStorageLimit.toLocaleString()} chars`;
  }
  if (activity.responseOriginalLength) {
    return `${activity.responseOriginalLength.toLocaleString()} response chars truncated`;
  }
  return "response truncated";
}

function shareStateLabel(state: PromptActivityCardProps["shareState"]) {
  if (state === "start") {
    return "Start";
  }
  if (state === "end") {
    return "End";
  }
  if (state === "range") {
    return "Selected";
  }
  return null;
}

type ActivityCardProps = {
  activity: ActivityItem;
  isSelected?: boolean;
  onOpen?: () => void;
};

export function ActivityCard({
  activity,
  isSelected = false,
  onOpen,
}: ActivityCardProps) {
  return (
    <article
      className="bh-session-row"
      data-active={isSelected}
      aria-pressed={isSelected}
      aria-label={`${activity.model} session`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="bh-session-row-main">
        <div className="bh-session-row-header">
          <strong>{activity.model}</strong>
          <span>Session {activity.id.slice(0, 8)}</span>
        </div>
        <span>
          {activity.lastActivity} · {activity.prompts} prompts ·{" "}
          {activity.filesChanged} files
        </span>
      </div>
    </article>
  );
}

type PromptActivityCardProps = {
  activity: PromptActivityItem;
  isSelected: boolean;
  onOpen: () => void;
  promptLabel?: string;
  shareState?: "end" | "range" | "start";
};

export function PromptActivityCard({
  activity,
  isSelected,
  onOpen,
  promptLabel,
  shareState,
}: PromptActivityCardProps) {
  const truncatedLabel = promptTruncatedLabel(activity);
  const responseLimitLabel = responseTruncatedLabel(activity);
  const selectedShareLabel = shareStateLabel(shareState);

  return (
    <article
      className="bh-prompt-row"
      data-active={isSelected}
      data-share-state={shareState}
      aria-label={`Select prompt submitted at ${activity.submittedAt}`}
      aria-pressed={isSelected}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="bh-prompt-row-main">
        <div className="bh-prompt-row-header">
          <time>{activity.submittedAt}</time>
          {promptLabel ? <span>{promptLabel}</span> : null}
        </div>
        <div className="bh-prompt-row-meta" aria-label="Prompt metadata">
          <span className="bh-prompt-row-chip is-model">{activity.model}</span>
          <span className="bh-prompt-row-chip">{activity.filesChanged} files</span>
          {selectedShareLabel ? (
            <span className="bh-prompt-row-chip is-share">{selectedShareLabel}</span>
          ) : null}
          {truncatedLabel ? (
            <span className="bh-prompt-row-chip">{truncatedLabel}</span>
          ) : null}
          {responseLimitLabel ? (
            <span className="bh-prompt-row-chip">{responseLimitLabel}</span>
          ) : null}
        </div>
        <PromptText expandable={false} text={activity.prompt} />
      </div>
    </article>
  );
}

type PromptChangeDetailProps = {
  activity: PromptActivityItem | null;
  onOpenSession?: (activity: PromptActivityItem) => void;
  onSharePrompt?: (activity: PromptActivityItem) => void;
};

function diffLineKind(line: string) {
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (line.startsWith("+++") || line.startsWith("---")) {
    return "meta";
  }
  if (line.startsWith("+")) {
    return "addition";
  }
  if (line.startsWith("-")) {
    return "deletion";
  }
  return "context";
}

function patchOmittedLabel(reason: string | null | undefined) {
  if (!reason) {
    return "Diff patch is not available for this file.";
  }
  const labels: Record<string, string> = {
    binary: "Binary file diff is not shown.",
    content_unavailable: "File content was not available when this prompt was captured.",
    empty_patch: "No line-level patch was produced for this file.",
    excluded_path: "This path is excluded from patch capture.",
    sensitive_path: "This path may contain secrets, so patch content was not stored.",
  };
  return labels[reason] ?? `Diff patch omitted: ${reason}`;
}

function DiffViewer({ patch }: { patch: string }) {
  const lines = patch.split("\n");

  return (
    <div className="bh-diff-viewer" aria-label="Unified diff">
      {lines.map((line, index) => (
        <code
          className="bh-diff-line"
          data-kind={diffLineKind(line)}
          key={`${index}-${line}`}
        >
          <span>{line.slice(0, 1) || " "}</span>
          <span>{line.slice(1) || " "}</span>
        </code>
      ))}
    </div>
  );
}

export function PromptChangeDetail({
  activity,
  onOpenSession,
  onSharePrompt,
}: PromptChangeDetailProps) {
  if (!activity) {
    return (
      <section
        className="bh-activity-detail-placeholder"
        id="activity-detail-placeholder"
        aria-labelledby="activity-detail-placeholder-title"
      >
        <div>
          <h2 id="activity-detail-placeholder-title">Code changes</h2>
          <p>Open a prompt to inspect changed files from that prompt.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="bh-prompt-change-detail"
      id="activity-detail-placeholder"
      aria-labelledby="activity-detail-placeholder-title"
    >
      <div className="bh-prompt-change-header">
        <div>
          <span>Selected prompt</span>
          <h2 id="activity-detail-placeholder-title">Code changes</h2>
        </div>
        <div className="bh-prompt-change-header-actions">
          {onSharePrompt ? (
            <button
              className="bh-header-action-button is-primary"
              onClick={() => onSharePrompt(activity)}
              type="button"
            >
              <Share2 aria-hidden="true" size={15} strokeWidth={1.5} />
              <span>Share prompt</span>
            </button>
          ) : null}
          {onOpenSession ? (
            <button
              className="bh-header-action-button"
              onClick={() => onOpenSession(activity)}
              type="button"
            >
              View session
            </button>
          ) : null}
          <strong>{activity.filesChanged} files</strong>
        </div>
      </div>

      <div className="bh-prompt-change-summary">
        <PromptText text={activity.prompt} />
        {activity.promptTruncated ? (
          <div className="bh-prompt-storage-note">
            Prompt text was truncated for storage policy.
          </div>
        ) : null}
      </div>

      {activity.response ? (
        <div className="bh-ai-response-summary">
          <div className="bh-ai-response-label">
            <span>AI response</span>
            {activity.responseReceivedAt ? (
              <strong>{activity.responseReceivedAt}</strong>
            ) : null}
          </div>
          <PromptText text={activity.response} />
          {activity.responseTruncated ? (
            <div className="bh-prompt-storage-note">
              AI response text was truncated for storage policy.
            </div>
          ) : null}
        </div>
      ) : null}

      {activity.fileChanges.length > 0 ? (
        <div className="bh-prompt-change-list" aria-label="Prompt file changes">
          {activity.fileChanges.map((change) => (
            <article className="bh-diff-file" key={`${activity.id}-${change.path}`}>
              <div className="bh-diff-file-header">
                <div>
                  <span>{change.status}</span>
                  <strong>{change.path}</strong>
                  {change.oldPath ? <em>renamed from {change.oldPath}</em> : null}
                </div>
                <div className="bh-prompt-change-delta">
                  {change.additions !== null ? (
                    <span className="is-addition">+{change.additions}</span>
                  ) : null}
                  {change.deletions !== null ? (
                    <span className="is-deletion">-{change.deletions}</span>
                  ) : null}
                </div>
              </div>

              {change.patch ? (
                <>
                  <DiffViewer patch={change.patch} />
                  {change.patchTruncated ? (
                    <div className="bh-diff-note">Patch truncated for storage limits.</div>
                  ) : null}
                </>
              ) : (
                <div className="bh-diff-note">
                  {patchOmittedLabel(
                    change.binary ? "binary" : change.patchOmittedReason,
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="bh-prompt-change-empty">
          No file changes were linked to this prompt.
        </div>
      )}
    </section>
  );
}

type SessionDetailProps = {
  activity: ActivityItem | null;
  prompts: PromptActivityItem[];
};

export function SessionDetail({ activity, prompts }: SessionDetailProps) {
  if (!activity) {
    return (
      <section
        className="bh-activity-detail-placeholder"
        id="activity-detail-placeholder"
        aria-labelledby="activity-detail-placeholder-title"
      >
        <div>
          <h2 id="activity-detail-placeholder-title">Session detail</h2>
          <p>Open a session to inspect its activity summary.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="bh-session-detail"
      id="activity-detail-placeholder"
      aria-labelledby="activity-detail-placeholder-title"
    >
      <div className="bh-prompt-change-header">
        <div>
          <span>Selected session</span>
          <h2 id="activity-detail-placeholder-title">{activity.model}</h2>
        </div>
        <strong>{activity.events} events</strong>
      </div>

      <dl className="bh-session-detail-meta">
        <div>
          <dt>Started</dt>
          <dd>{activity.startedAt}</dd>
        </div>
        <div>
          <dt>Last activity</dt>
          <dd>{activity.lastActivity}</dd>
        </div>
      </dl>

      <dl className="bh-session-detail-stats">
        <div>
          <dt>Prompts</dt>
          <dd>{activity.prompts}</dd>
        </div>
        <div>
          <dt>Responses</dt>
          <dd>{activity.responses}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{activity.filesChanged}</dd>
        </div>
      </dl>

      <div className="bh-session-conversations">
        <div className="bh-session-conversations-header">
          <span>Conversations in this session</span>
          <strong>{prompts.length}</strong>
        </div>

        {prompts.length > 0 ? (
          <div className="bh-session-conversation-list">
            {prompts.map((prompt) => (
              <article className="bh-session-conversation-row" key={prompt.id}>
                <div>
                  <div className="bh-session-conversation-meta">
                    <span>Prompt {prompt.sequence}</span>
                    <time>{prompt.submittedAt}</time>
                  </div>
                  <PromptText text={prompt.prompt} />
                  {prompt.response ? (
                    <div className="bh-session-response-preview">
                      <span>AI response</span>
                      <PromptText text={prompt.response} />
                    </div>
                  ) : null}
                </div>
                <strong>{prompt.filesChanged} files</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className="bh-prompt-change-empty">
            No prompts were captured in this session.
          </div>
        )}
      </div>
    </section>
  );
}
