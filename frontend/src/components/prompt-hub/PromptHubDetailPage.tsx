import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getPublishedPrompt,
  PromptHubApiError,
  promptHubErrorMessage,
  type PromptHubDetail,
} from "../../api/promptHub";
import { PromptDiffBlock } from "./PromptDiffBlock";
import { PromptMetricsPanel } from "./PromptMetricsPanel";
import { PromptScorePanel } from "./PromptScorePanel";
import { PromptTagList } from "./PromptTagList";
import { PromptVisibilityBadge } from "./PromptVisibilityBadge";
import "./prompt-hub.css";

type PromptHubDetailPageProps = {
  onBack: () => void;
  slug: string;
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
    timeStyle: "short",
  }).format(date);
}

export function PromptHubDetailPage({ onBack, slug }: PromptHubDetailPageProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [prompt, setPrompt] = useState<PromptHubDetail | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage(null);
    setPrompt(null);
    getPublishedPrompt(slug, controller.signal)
      .then(setPrompt)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setErrorMessage(
          error instanceof PromptHubApiError && error.status === 404
            ? "Prompt not found"
            : promptHubErrorMessage(error, "Prompt detail request failed"),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [slug]);

  const scores = useMemo(
    () =>
      prompt
        ? [
            { label: "Overall", value: prompt.score_overall },
            { label: "Frontend", value: prompt.score_frontend },
            { label: "Backend", value: prompt.score_backend },
            { label: "Architecture", value: prompt.score_architecture },
            { label: "Refactoring", value: prompt.score_refactoring },
            { label: "Documentation", value: prompt.score_documentation },
          ]
        : [],
    [prompt],
  );

  if (isLoading) {
    return (
      <section className="bh-prompt-empty-state">
        <RefreshCw aria-hidden="true" className="loading-spinner" size={18} />
        <h1>Loading prompt</h1>
        <p>Fetching execution context from Prompt Hub.</p>
      </section>
    );
  }

  if (errorMessage || !prompt) {
    return (
      <section className="bh-prompt-empty-state">
        <span>Prompt Hub</span>
        <h1>Prompt detail could not be loaded</h1>
        <p>{errorMessage ?? "The prompt is unavailable."}</p>
        <button className="toolbar-button" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={16} />
          Back
        </button>
      </section>
    );
  }

  return (
    <section className="bh-prompt-detail-page" aria-labelledby="prompt-detail-title">
      <button className="toolbar-button" onClick={onBack} type="button">
        <ArrowLeft aria-hidden="true" size={16} />
        Back to Prompt Hub
      </button>

      <div className="bh-prompt-detail-layout">
        <main className="bh-prompt-detail-main">
          <header className="bh-prompt-detail-header">
            <span>{prompt.category ?? "Uncategorized"}</span>
            <h1 id="prompt-detail-title">{prompt.title}</h1>
            <p>{prompt.summary ?? "No summary provided."}</p>
          </header>

          <section className="bh-prompt-section" aria-labelledby="prompt-text-title">
            <h2 id="prompt-text-title">Prompt text</h2>
            <pre className="bh-prompt-code-block">
              {prompt.prompt_text.trim() || "Not available"}
            </pre>
          </section>

          <section className="bh-prompt-section" aria-labelledby="result-summary-title">
            <h2 id="result-summary-title">Result summary</h2>
            <p>{prompt.result_summary?.trim() || "Not available"}</p>
          </section>

          <section className="bh-prompt-section" aria-labelledby="files-changed-title">
            <h2 id="files-changed-title">Files changed</h2>
            {prompt.files.length > 0 ? (
              <div className="bh-prompt-file-list">
                {prompt.files.map((file) => (
                  <article className="bh-prompt-file" key={file.id}>
                    <div className="bh-prompt-file-header">
                      <div>
                        <span>{file.change_type ?? "changed"}</span>
                        <strong>{file.file_path}</strong>
                        {file.language ? <em>{file.language}</em> : null}
                      </div>
                      <div className="bh-prompt-file-delta">
                        <span>+{file.additions}</span>
                        <span>-{file.deletions}</span>
                      </div>
                    </div>
                    <PromptDiffBlock diff={file.diff} filePath={file.file_path} />
                  </article>
                ))}
              </div>
            ) : (
              <div className="bh-prompt-section-empty">
                No changed files were included.
              </div>
            )}
          </section>

          <section className="bh-prompt-section" aria-labelledby="evaluation-title">
            <h2 id="evaluation-title">Evaluation</h2>
            <PromptScorePanel scores={scores} />
          </section>

          <section className="bh-prompt-section" aria-labelledby="comments-title">
            <h2 id="comments-title">Comments</h2>
            <div className="bh-prompt-section-empty">
              Comments placeholder · {prompt.comments_count} comments captured.
            </div>
          </section>
        </main>

        <aside className="bh-prompt-detail-sidebar" aria-label="Prompt metadata">
          <PromptVisibilityBadge visibility={prompt.visibility} />
          <dl>
            <div>
              <dt>Model</dt>
              <dd>{prompt.model_name ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Tool</dt>
              <dd>{prompt.tool_name ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{prompt.category ?? "Uncategorized"}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{formatDate(prompt.published_at)}</dd>
            </div>
          </dl>
          <PromptTagList tags={prompt.tags} />
          <PromptMetricsPanel metrics={prompt.metrics} />
          <PromptScorePanel scores={scores} />
        </aside>
      </div>
    </section>
  );
}
