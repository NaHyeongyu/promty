import { ExternalLink, GitBranch, Link } from "lucide-react";
import type { ProjectHeaderProps } from "./types";

export function ProjectHeader({
  description,
  name,
  onConnectRepository,
  repositoryStatus,
  repositoryUrl,
}: ProjectHeaderProps) {
  return (
    <header className="bh-project-header" aria-labelledby="project-detail-title">
      <div className="bh-project-header-copy">
        <h1 id="project-detail-title">{name}</h1>
        <p>{description}</p>
      </div>

      <div className="bh-project-header-actions">
        <span className="bh-repository-status">
          <GitBranch aria-hidden="true" size={16} strokeWidth={1.5} />
          {repositoryStatus}
        </span>

        {repositoryUrl ? (
          <a
            aria-label="Open repository"
            className="bh-icon-button"
            href={repositoryUrl}
            rel="noreferrer"
            target="_blank"
            title="Open repository"
          >
            <ExternalLink aria-hidden="true" size={17} strokeWidth={1.5} />
          </a>
        ) : onConnectRepository ? (
          <button
            className="bh-header-action-button"
            onClick={onConnectRepository}
            type="button"
          >
            <Link aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>Connect Repository</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
