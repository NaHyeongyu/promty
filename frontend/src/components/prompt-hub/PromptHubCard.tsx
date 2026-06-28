import type { PromptHubListItem } from "../../api/promptHub";
import { PromptMetricsPanel } from "./PromptMetricsPanel";
import { PromptTagList } from "./PromptTagList";

type PromptHubCardProps = {
  onOpen: () => void;
  prompt: PromptHubListItem;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not published";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function scoreLabel(value: number | null) {
  return typeof value === "number" ? value.toFixed(1) : "Not scored";
}

export function PromptHubCard({ onOpen, prompt }: PromptHubCardProps) {
  return (
    <article
      aria-label={`Open ${prompt.title}`}
      className="bh-prompt-card"
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
      <div className="bh-prompt-card-header">
        <div>
          <span>{prompt.category ?? "Uncategorized"}</span>
          <h2>{prompt.title}</h2>
        </div>
        <strong>{scoreLabel(prompt.score_overall)}</strong>
      </div>

      <p>{prompt.summary ?? "No summary provided."}</p>

      <div className="bh-prompt-card-meta">
        <span>{prompt.model_name ?? "Unknown model"}</span>
        <span>{prompt.tool_name ?? "Unknown tool"}</span>
        <span>{formatDate(prompt.published_at)}</span>
        <span>Author pending</span>
      </div>

      <PromptTagList tags={prompt.tags} />
      <PromptMetricsPanel metrics={prompt.metrics} />
    </article>
  );
}
