import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Folder, GitBranch, Link, Search } from "lucide-react";
import type { ProjectHeaderProps } from "./types";

export function ProjectHeader({
  name,
  onOpenAllProjects,
  onConnectRepository,
  onProjectSelect,
  projectOptions = [],
  repositoryStatus,
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
            <h1 id="project-detail-title">{name}</h1>
            {canSwitchProjects ? (
              <>
                <button
                  aria-expanded={isProjectMenuOpen}
                  aria-haspopup="dialog"
                  aria-label="Switch project"
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
