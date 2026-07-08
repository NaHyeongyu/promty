import { BookOpen } from "lucide-react";
import { CodeViewer } from "./CodeViewer";
import { EmptyState } from "./EmptyState";
import { FileTree } from "./FileTree";
import { GitHubRepositorySetupState } from "./RepositorySetupState";
import type { ProjectDetailData } from "./types";

export function FilesPanel({
  data,
  onRepositoryFileSelect,
}: {
  data: ProjectDetailData;
  onRepositoryFileSelect?: (path: string) => void;
}) {
  const isRepositoryLinked = Boolean(data.project.repositoryUrl);

  return (
    <div className="bh-files-layout">
      <section className="bh-files-section" aria-labelledby="tracked-files-title">
        <div className="bh-files-section-header">
          <h2 id="tracked-files-title">Tracked changes</h2>
          <p>Files captured from Promty collector events.</p>
        </div>
        {data.files.length > 0 ? (
          <FileTree label="Tracked project files" nodes={data.files} />
        ) : (
          <EmptyState
            description="The tracked file tree will appear after file change events are stored."
            icon={BookOpen}
            title="No tracked files yet"
          />
        )}
      </section>

      <section className="bh-files-section" aria-labelledby="repository-files-title">
        <div className="bh-files-section-header">
          <h2 id="repository-files-title">GitHub repository</h2>
          <p>
            {data.repositoryFilesRepository
              ? `${data.repositoryFilesRepository}${data.repositoryFilesTruncated ? " · truncated" : ""}`
              : "Repository tree from GitHub OAuth access."}
          </p>
        </div>
        {!isRepositoryLinked ? (
          <GitHubRepositorySetupState />
        ) : data.repositoryFilesLoading && data.repositoryFiles.length === 0 ? (
          <div
            aria-busy="true"
            aria-label="Loading GitHub repository files"
            aria-live="polite"
            className="bh-repository-browser bh-repository-browser-skeleton"
            role="status"
          >
            <div className="bh-detail-skeleton-tree">
              {Array.from({ length: 10 }).map((_, index) => (
                <span
                  className={
                    index % 3 === 0
                      ? "skeleton-line skeleton-line-md"
                      : "skeleton-line skeleton-line-sm"
                  }
                  key={index}
                />
              ))}
            </div>
            <div className="bh-detail-skeleton-code">
              <span className="skeleton-line skeleton-line-title" />
              {Array.from({ length: 14 }).map((_, index) => (
                <span className="skeleton-line skeleton-code-line" key={index} />
              ))}
            </div>
          </div>
        ) : data.repositoryFiles.length > 0 ? (
          <div className="bh-repository-browser">
            <FileTree
              label="GitHub repository files"
              nodes={data.repositoryFiles}
              onFileSelect={onRepositoryFileSelect}
              selectedPath={data.repositoryFileSelectedPath}
            />
            <CodeViewer
              content={data.repositoryFileContent}
              errorMessage={data.repositoryFileContentError}
              isLoading={data.repositoryFileContentLoading}
              selectedPath={data.repositoryFileSelectedPath}
            />
          </div>
        ) : (
          <EmptyState
            description={
              data.repositoryFilesMessage ??
              "Sign in with GitHub repository access to browse repository files."
            }
            icon={BookOpen}
            title="No GitHub repository files"
          >
            {data.repositoryFilesConnectUrl &&
            data.repositoryFilesStatus === "github_repository_access_required" ? (
              <a className="bh-empty-state-button" href={data.repositoryFilesConnectUrl}>
                Connect GitHub
              </a>
            ) : null}
          </EmptyState>
        )}
      </section>
    </div>
  );
}
