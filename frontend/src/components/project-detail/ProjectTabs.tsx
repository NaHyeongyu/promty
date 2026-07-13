import type { ProjectDetailTab, ProjectDetailTabId } from "./types";
import { useI18n } from "../../i18n/I18nProvider";
import { GitHubIcon } from "../app/Branding";

type ProjectTabsProps = {
  activeTab: ProjectDetailTabId;
  notifications?: Partial<Record<ProjectDetailTabId, boolean>>;
  onTabChange: (tabId: ProjectDetailTabId) => void;
  tabs: ProjectDetailTab[];
};

export function ProjectTabs({
  activeTab,
  notifications = {},
  onTabChange,
  tabs,
}: ProjectTabsProps) {
  const { t } = useI18n();
  const internalTabs = tabs.filter((tab) => !tab.externalHref);
  const externalTabs = tabs.filter((tab) => tab.externalHref);

  return (
    <nav className="bh-project-tabs" aria-label={t("project.sections")}>
      <div className="bh-project-tab-list" role="tablist">
        {internalTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const hasNotification = notifications[tab.id] ?? false;

          return (
            <button
              aria-label={
                hasNotification
                  ? `${tab.label}, ${t("project.memoryReady")}`
                  : tab.label
              }
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
              <span>{tab.label}</span>
              {hasNotification ? (
                <span aria-hidden="true" className="bh-project-tab-notification" />
              ) : null}
            </button>
          );
        })}
      </div>
      {externalTabs.map((tab) => (
        <a
          aria-label={`${tab.label} · GitHub`}
          className="bh-project-tab bh-project-tab-external"
          href={tab.externalHref}
          id={`project-tab-${tab.id}`}
          key={tab.id}
          rel="noreferrer"
          target="_blank"
        >
          <span>{tab.label}</span>
          {tab.externalIcon === "github" ? <GitHubIcon /> : null}
        </a>
      ))}
    </nav>
  );
}
