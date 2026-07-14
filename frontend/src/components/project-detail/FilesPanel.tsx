import { BookOpen } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { FileTree } from "./FileTree";
import { GitHubRepositorySetupState } from "./RepositorySetupState";
import type { ProjectDetailData } from "./types";
import { useI18n } from "../../i18n/I18nProvider";

export function FilesPanel({
  data,
  onRepositoryFileSelect,
}: {
  data: ProjectDetailData;
  onRepositoryFileSelect?: (path: string) => void;
}) {
  const { t } = useI18n();
  const isRepositoryLinked = Boolean(data.project.repositoryUrl);
  const openGitHubFile = isRepositoryLinked ? onRepositoryFileSelect : undefined;

  return (
    <div className="bh-files-layout">
      <section className="bh-files-section" aria-labelledby="tracked-files-title">
        <div className="bh-files-section-header">
          <h2 id="tracked-files-title">{t("files.trackedChanges")}</h2>
          <p>
            {data.filesTotal !== null && data.filesTotal !== undefined
              ? t("files.capturedCount", { count: data.filesTotal })
              : t("files.captured")}
          </p>
        </div>
        {data.filesLoading && data.files.length === 0 ? (
          <div
            aria-busy="true"
            aria-label={t("files.loadingTracked")}
            aria-live="polite"
            className="bh-detail-skeleton-tree"
            role="status"
          >
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
        ) : data.filesError ? (
          <EmptyState
            description={data.filesError}
            icon={BookOpen}
            title={t("files.trackedLoadFailed")}
          />
        ) : data.files.length > 0 ? (
          <>
            {data.filesTruncated ? (
              <div className="bh-files-inline-status" role="status">
                {t("files.showingFirst", { count: data.files.length })}
              </div>
            ) : null}
            <FileTree
              label={t("files.trackedProjectFiles")}
              nodes={data.files}
              onFileSelect={openGitHubFile}
              opensExternal={Boolean(openGitHubFile)}
            />
          </>
        ) : (
          <EmptyState
            description={t("files.noTrackedDescription")}
            icon={BookOpen}
            title={t("files.noTracked")}
          />
        )}
      </section>

      <section className="bh-files-section" aria-labelledby="repository-files-title">
        <div className="bh-files-section-header">
          <h2 id="repository-files-title">{t("project.githubRepo")}</h2>
          <p>
            {data.repositoryFilesRepository
              ? `${data.repositoryFilesRepository}${data.repositoryFilesTruncated ? ` · ${t("files.truncated")}` : ""}`
              : t("files.repositoryDescription")}
          </p>
        </div>
        {!isRepositoryLinked ? (
          <GitHubRepositorySetupState />
        ) : data.repositoryFilesLoading && data.repositoryFiles.length === 0 ? (
          <div
            aria-busy="true"
            aria-label={t("files.loadingGithub")}
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
          <div className="bh-repository-browser bh-repository-browser-external">
            <FileTree
              label={t("files.githubFiles")}
              nodes={data.repositoryFiles}
              onFileSelect={openGitHubFile}
              opensExternal={Boolean(openGitHubFile)}
            />
          </div>
        ) : (
          <EmptyState
            description={
              data.repositoryFilesMessage ??
              t("files.repositorySignIn")
            }
            icon={BookOpen}
            title={t("files.noGithubFiles")}
          >
            {data.repositoryFilesConnectUrl &&
            data.repositoryFilesStatus === "github_repository_access_required" ? (
              <a className="bh-empty-state-button" href={data.repositoryFilesConnectUrl}>
                {t("files.connectGithub")}
              </a>
            ) : null}
          </EmptyState>
        )}
      </section>
    </div>
  );
}
