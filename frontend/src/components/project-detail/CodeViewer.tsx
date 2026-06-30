import { ExternalLink, FileCode } from "lucide-react";
import type { RepositoryFileContent } from "./types";

type CodeViewerProps = {
  content?: RepositoryFileContent | null;
  errorMessage?: string | null;
  isLoading?: boolean;
  selectedPath?: string | null;
};

function formatBytes(value?: number | null) {
  if (typeof value !== "number") {
    return null;
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function CodeViewer({
  content,
  errorMessage,
  isLoading,
  selectedPath,
}: CodeViewerProps) {
  if (isLoading && !content?.content) {
    return (
      <section
        aria-label={`Loading ${selectedPath ?? "repository file"}`}
        aria-live="polite"
        aria-busy="true"
        className="bh-code-viewer bh-code-viewer-loading-surface loading-cascade"
        data-loading="true"
        role="status"
      >
        <span className="bh-loading-cascade-label">
          Loading {selectedPath ?? "repository file"}
        </span>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="bh-code-viewer bh-code-viewer-empty">
        <FileCode aria-hidden="true" size={18} strokeWidth={1.5} />
        <div>
          <h2>File could not be previewed</h2>
          <p>{errorMessage}</p>
        </div>
      </section>
    );
  }

  if (!content?.content) {
    return (
      <section className="bh-code-viewer bh-code-viewer-empty">
        <FileCode aria-hidden="true" size={18} strokeWidth={1.5} />
        <div>
          <h2>Select a file</h2>
          <p>Choose a GitHub repository file to preview its source.</p>
        </div>
      </section>
    );
  }

  const lines = content.content.split("\n");
  const byteLabel = formatBytes(content.size);

  return (
    <section
      aria-busy={isLoading || undefined}
      aria-labelledby="repository-code-title"
      className="bh-code-viewer loading-cascade"
      data-loading={isLoading ? "true" : undefined}
    >
      <header className="bh-code-viewer-header">
        <div>
          <h2 id="repository-code-title">{content.name ?? content.path}</h2>
          <p>
            {content.repository ? `${content.repository} / ` : null}
            {content.path}
            {content.branch ? ` · ${content.branch}` : null}
            {byteLabel ? ` · ${byteLabel}` : null}
          </p>
        </div>
        {content.htmlUrl ? (
          <a
            aria-label="Open file on GitHub"
            className="bh-code-viewer-link"
            href={content.htmlUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink aria-hidden="true" size={16} strokeWidth={1.5} />
          </a>
        ) : null}
      </header>

      <ol className="bh-code-lines">
        {lines.map((line, index) => (
          <li key={`${index}-${line.slice(0, 12)}`}>
            <span className="bh-code-line-number">{index + 1}</span>
            <code>{line || " "}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
