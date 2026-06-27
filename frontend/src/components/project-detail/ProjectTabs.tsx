import { ExternalLink } from "lucide-react";
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
              <span>Files on GitHub</span>
              <ExternalLink aria-hidden="true" size={14} strokeWidth={1.7} />
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
