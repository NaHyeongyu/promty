import { siGithub } from "simple-icons";
import type { ProjectDetailTab, ProjectDetailTabId } from "./types";

type ProjectTabsProps = {
  activeTab: ProjectDetailTabId;
  onTabChange: (tabId: ProjectDetailTabId) => void;
  repositoryUrl?: string;
  tabs: ProjectDetailTab[];
};

export function ProjectTabs({
  activeTab,
  onTabChange,
  repositoryUrl,
  tabs,
}: ProjectTabsProps) {
  return (
    <nav className="bh-project-tabs" aria-label="Project sections" role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        if (tab.id === "files" && repositoryUrl) {
          return (
            <a
              aria-label="Open project files on GitHub"
              className="bh-project-tab bh-project-tab-external"
              href={repositoryUrl}
              key={tab.id}
              rel="noreferrer"
              target="_blank"
              title="Open project files on GitHub"
            >
              <span>{tab.label}</span>
              <svg
                aria-hidden="true"
                className="bh-project-tab-brand-icon"
                role="img"
                viewBox="0 0 24 24"
              >
                <path d={siGithub.path} />
              </svg>
            </a>
          );
        }

        return (
          <button
            aria-controls={`project-panel-${tab.id}`}
            aria-selected={isActive}
            className="bh-project-tab"
            data-active={isActive}
            id={`project-tab-${tab.id}`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
