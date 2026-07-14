import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Folder,
  Link,
  Search,
  Share2,
} from "lucide-react";
import { AiModelBadge } from "./AiModelBadge";
import { useI18n } from "../../i18n/I18nProvider";
import type { ProjectHeaderProps } from "./types";

export function ProjectHeader({
  isBookmarked = false,
  isBookmarkUpdating = false,
  isLoading,
  isShareCopied = false,
  lastActivityLabel,
  modelNames = [],
  name,
  onOpenAllProjects,
  onConnectRepository,
  onProjectSelect,
  onShareProject,
  onToggleBookmark,
  projectOptions = [],
  repositoryUrl,
  selectedProjectId,
}: ProjectHeaderProps) {
  const { t } = useI18n();
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const filteredProjectOptions = useMemo(() => {
    const query = projectSearchQuery.trim().toLowerCase();

    if (!query) {
      return projectOptions;
    }

    return projectOptions.filter((project) =>
      project.name.toLowerCase().includes(query),
    );
  }, [projectOptions, projectSearchQuery]);
  const canSwitchProjects = projectOptions.length > 0 || Boolean(onOpenAllProjects);
  const visibleModelNames = modelNames.slice(0, 2);
  const hiddenModelCount = Math.max(0, modelNames.length - visibleModelNames.length);
  const hasHeaderMeta =
    !isLoading && (visibleModelNames.length > 0 || Boolean(lastActivityLabel));
  const projectTitle = isLoading ? t("project.loadingOne") : name;
  const closeProjectMenu = () => {
    setIsProjectMenuOpen(false);
    setProjectSearchQuery("");
  };

  useEffect(() => {
    if (!isProjectMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && switcherRef.current?.contains(target)) {
        return;
      }

      closeProjectMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeProjectMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProjectMenuOpen]);

  return (
    <header className="bh-project-header" aria-labelledby="project-detail-title">
      <div className="bh-project-header-copy">
        <div className="bh-project-title-row">
          <div className="bh-project-name-switcher" ref={switcherRef}>
            <h1
              data-loading={isLoading ? "true" : undefined}
              id="project-detail-title"
              title={projectTitle}
            >
              {isLoading ? (
                <span className="skeleton-line skeleton-line-heading" />
              ) : (
                name
              )}
            </h1>
            {canSwitchProjects && !isLoading ? (
              <>
                <button
                  aria-expanded={isProjectMenuOpen}
                  aria-haspopup="dialog"
                  aria-label={t("project.switchFrom", { name: projectTitle })}
                  className="bh-project-switcher-trigger"
                  onClick={() => setIsProjectMenuOpen((isOpen) => !isOpen)}
                  type="button"
                >
                  <ChevronDown aria-hidden="true" size={16} strokeWidth={1.7} />
                </button>

                {isProjectMenuOpen ? (
                  <div
                    aria-label={t("project.switch")}
                    className="bh-project-switcher-menu"
                    role="dialog"
                  >
                    {onOpenAllProjects ? (
                      <button
                        className="bh-project-switcher-all"
                        onClick={() => {
                          closeProjectMenu();
                          onOpenAllProjects();
                        }}
                        type="button"
                      >
                        <Folder aria-hidden="true" size={15} strokeWidth={1.6} />
                        <span>{t("project.allProjects")}</span>
                      </button>
                    ) : null}

                    <label className="bh-project-switcher-search">
                      <Search aria-hidden="true" size={14} strokeWidth={1.7} />
                      <input
                        aria-label={t("project.search")}
                        autoFocus
                        onChange={(event) => setProjectSearchQuery(event.target.value)}
                        placeholder={t("project.search")}
                        type="search"
                        value={projectSearchQuery}
                      />
                    </label>

                    <div className="bh-project-switcher-list">
                      {filteredProjectOptions.length > 0 ? (
                        filteredProjectOptions.map((project) => (
                          <button
                            className="bh-project-switcher-option"
                            data-active={project.id === selectedProjectId}
                            key={project.id}
                            onClick={() => {
                              closeProjectMenu();
                              if (project.id !== selectedProjectId) {
                                onProjectSelect?.(project.id);
                              }
                            }}
                            type="button"
                          >
                            <span>{project.name}</span>
                            {project.latestUpdatedAt ? (
                              <small>{project.latestUpdatedAt}</small>
                            ) : null}
                          </button>
                        ))
                      ) : (
                        <div className="bh-project-switcher-empty">
                          {t("project.noProjectsFoundPeriod")}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {hasHeaderMeta ? (
          <div className="bh-project-header-meta" aria-label={t("project.activity")}>
            {visibleModelNames.map((modelName) => (
              <AiModelBadge
                className="is-header"
                key={modelName}
                model={modelName}
              />
            ))}
            {hiddenModelCount > 0 ? (
              <span className="bh-project-header-chip">+{hiddenModelCount}</span>
            ) : null}
            {lastActivityLabel ? (
              <span className="bh-project-header-chip">
                <Clock aria-hidden="true" size={14} strokeWidth={1.5} />
                <span>{lastActivityLabel}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="bh-project-header-actions">
        {onToggleBookmark && !isLoading ? (
          <button
            aria-label={isBookmarked ? t("project.removeSaved") : t("project.saveProject")}
            aria-pressed={isBookmarked}
            className="bh-icon-button"
            data-active={isBookmarked ? "true" : undefined}
            disabled={isBookmarkUpdating}
            onClick={onToggleBookmark}
            title={isBookmarked ? t("project.removeSaved") : t("project.saveProject")}
            type="button"
          >
            <Bookmark
              aria-hidden="true"
              fill={isBookmarked ? "currentColor" : "none"}
              size={17}
              strokeWidth={1.5}
            />
          </button>
        ) : null}
        {onShareProject && !isLoading ? (
          <button
            aria-label={isShareCopied ? t("project.workspaceLinkCopied") : t("project.copyWorkspaceLink")}
            className="bh-icon-button"
            data-active={isShareCopied ? "true" : undefined}
            onClick={onShareProject}
            title={isShareCopied ? t("project.workspaceLinkCopied") : t("project.copyWorkspaceLink")}
            type="button"
          >
            {isShareCopied ? (
              <Check aria-hidden="true" size={17} strokeWidth={1.5} />
            ) : (
              <Share2 aria-hidden="true" size={17} strokeWidth={1.5} />
            )}
          </button>
        ) : null}
        {repositoryUrl ? (
          <a
            aria-label={t("project.openRepository")}
            className="bh-icon-button"
            href={repositoryUrl}
            rel="noreferrer"
            target="_blank"
            title={t("project.openRepository")}
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
            <span>{t("project.connectRepository")}</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
