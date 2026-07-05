import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Clock, ExternalLink, Folder, Link, Search } from "lucide-react";
import { AiModelBadge } from "./AiModelBadge";
import type { ProjectHeaderProps } from "./types";

export function ProjectHeader({
  lastActivityLabel,
  modelNames = [],
  name,
  onOpenAllProjects,
  onConnectRepository,
  onProjectSelect,
  projectOptions = [],
  repositoryUrl,
  selectedProjectId,
}: ProjectHeaderProps) {
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
  const hasHeaderMeta = visibleModelNames.length > 0 || Boolean(lastActivityLabel);
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
            <h1 id="project-detail-title" title={name}>
              {name}
            </h1>
            {canSwitchProjects ? (
              <>
                <button
                  aria-expanded={isProjectMenuOpen}
                  aria-haspopup="dialog"
                  aria-label={`Switch project from ${name}`}
                  className="bh-project-switcher-trigger"
                  onClick={() => setIsProjectMenuOpen((isOpen) => !isOpen)}
                  type="button"
                >
                  <ChevronDown aria-hidden="true" size={16} strokeWidth={1.7} />
                </button>

                {isProjectMenuOpen ? (
                  <div
                    aria-label="Switch project"
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
                        <span>All projects</span>
                      </button>
                    ) : null}

                    <label className="bh-project-switcher-search">
                      <Search aria-hidden="true" size={14} strokeWidth={1.7} />
                      <input
                        aria-label="Search projects"
                        autoFocus
                        onChange={(event) => setProjectSearchQuery(event.target.value)}
                        placeholder="Search projects"
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
                          No projects found.
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
          <div className="bh-project-header-meta" aria-label="Project activity summary">
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
