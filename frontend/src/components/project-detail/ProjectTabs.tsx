import type { ProjectDetailTab, ProjectDetailTabId } from "./types";

type ProjectTabsProps = {
  activeTab: ProjectDetailTabId;
  onTabChange: (tabId: ProjectDetailTabId) => void;
  tabs: ProjectDetailTab[];
};

export function ProjectTabs({ activeTab, onTabChange, tabs }: ProjectTabsProps) {
  return (
    <nav className="bh-project-tabs" aria-label="Project sections" role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

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
