import { BookOpen } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { githubRepositoryUrl } from "../../lib/github";
import { ActivityPanel } from "./ActivityPanel";
import { EmptyState } from "./EmptyState";
import { FilesPanel } from "./FilesPanel";
import {
  MemoryPanel,
  type MemoryGenerationResult,
} from "./MemoryPanel";
import { OverviewPanel } from "./OverviewPanel";
import { ProjectDetailLoadingSkeleton } from "./ProjectDetailLoadingSkeleton";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectTabs } from "./ProjectTabs";
import type {
  ActivityNavigationState,
  ProjectDetailData,
  ProjectMemoryArtifact,
  ProjectDetailTab,
  ProjectDetailTabId,
  ProjectHeaderProjectOption,
} from "./types";
import "./project-detail.css";

type ProjectDetailPageProps = {
  activityNavigation?: ActivityNavigationState;
  activeTab: ProjectDetailTabId;
  data: ProjectDetailData;
  errorMessage?: string | null;
  isProjectResolving?: boolean;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isBookmarkUpdating?: boolean;
  isProjectMemoryGenerationActive?: boolean;
  isProjectMemoryGenerationDelayed?: boolean;
  isShareCopied?: boolean;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
  onConnectRepository?: () => void;
  onLoadMemoryArtifacts?: (limit: number) => Promise<ProjectMemoryArtifact[]>;
  onOpenAllProjects?: () => void;
  onProjectSelect?: (projectId: string) => void;
  onRepositoryFileSelect?: (path: string) => void;
  onShareProject?: () => void;
  onSaveProjectMetadata?: (metadata: {
    slug?: string;
    tags?: string[];
    visibility?: "private" | "public";
  }) => Promise<void>;
  onSaveDescription?: (description: string) => Promise<void>;
  onGenerateProjectMemory?: () => Promise<MemoryGenerationResult>;
  onToggleBookmark?: () => void;
  onRetry?: () => void;
  onTabChange: (tabId: ProjectDetailTabId) => void;
  projectOptions?: ProjectHeaderProjectOption[];
};
function projectHeaderModelNames(data: ProjectDetailData) {
  const modelItem = data.overview.find((item) => item.title === "AI Models");
  if (!modelItem?.value || modelItem.value === "Not captured") {
    return [];
  }

  return modelItem.value
    .split(",")
    .map((modelName) => modelName.trim())
    .filter(Boolean);
}

function projectHeaderLastActivityLabel(data: ProjectDetailData) {
  const lastActivityItem = data.overview.find(
    (item) => item.title === "Last Activity",
  );

  if (!lastActivityItem) {
    return undefined;
  }

  if (
    lastActivityItem.description &&
    lastActivityItem.description !== "No activity"
  ) {
    return lastActivityItem.description;
  }

  return lastActivityItem.value !== "No activity"
    ? lastActivityItem.value
    : undefined;
}

function hasReadyMemory(data: ProjectDetailData) {
  return data.memory.pendingRanges.length > 0;
}

function ProjectPanel({
  activityNavigation,
  activeTab,
  data,
  errorMessage,
  isLoading,
  isProjectMemoryGenerationActive,
  isProjectMemoryGenerationDelayed,
  onActivityNavigationChange,
  onGenerateProjectMemory,
  onLoadMemoryArtifacts,
  onSaveProjectMetadata,
  onSaveDescription,
  onRepositoryFileSelect,
  onRetry,
  onTabChange,
}: {
  activityNavigation?: ActivityNavigationState;
  activeTab: ProjectDetailTabId;
  data: ProjectDetailData;
  errorMessage?: string | null;
  isLoading?: boolean;
  isProjectMemoryGenerationActive?: boolean;
  isProjectMemoryGenerationDelayed?: boolean;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
  onGenerateProjectMemory?: () => Promise<MemoryGenerationResult>;
  onLoadMemoryArtifacts?: (limit: number) => Promise<ProjectMemoryArtifact[]>;
  onRepositoryFileSelect?: (path: string) => void;
  onRetry?: () => void;
  onSaveProjectMetadata?: (metadata: {
    slug?: string;
    tags?: string[];
    visibility?: "private" | "public";
  }) => Promise<void>;
  onSaveDescription?: (description: string) => Promise<void>;
  onTabChange: (tabId: ProjectDetailTabId) => void;
}) {
  const { t } = useI18n();
  if (isLoading) {
    return <ProjectDetailLoadingSkeleton activeTab={activeTab} />;
  }

  if (errorMessage) {
    return (
      <EmptyState
        description={errorMessage}
        icon={BookOpen}
        title={t("project.detailLoadFailed")}
      >
        {onRetry ? (
          <button className="bh-empty-state-button" onClick={onRetry} type="button">
            {t("common.retry")}
          </button>
        ) : null}
      </EmptyState>
    );
  }

  if (activeTab === "overview") {
    return (
      <OverviewPanel
        data={data}
        onSaveProjectMetadata={onSaveProjectMetadata}
        onSaveDescription={onSaveDescription}
      />
    );
  }

  if (activeTab === "memory") {
    return (
      <MemoryPanel
        data={data}
        isProjectMemoryGenerationActive={isProjectMemoryGenerationActive}
        isProjectMemoryGenerationDelayed={isProjectMemoryGenerationDelayed}
        onGenerateProjectMemory={onGenerateProjectMemory}
        onLoadMemoryArtifacts={onLoadMemoryArtifacts}
        onOpenSession={(sessionId) => {
          if (onActivityNavigationChange) {
            onActivityNavigationChange({
              selectedPromptId: null,
              selectedSessionId: sessionId,
              selectedSessionPromptId: null,
              view: "sessions",
            });
            return;
          }
          onTabChange("ai-activity");
        }}
      />
    );
  }

  if (activeTab === "ai-activity") {
    return (
      <ActivityPanel
        activityNavigation={activityNavigation}
        data={data}
        onActivityNavigationChange={onActivityNavigationChange}
      />
    );
  }

  if (activeTab === "files") {
    return <FilesPanel data={data} onRepositoryFileSelect={onRepositoryFileSelect} />;
  }

  return (
    <EmptyState
      description={t("project.sectionPendingDescription")}
      icon={BookOpen}
      title={t("project.sectionPending")}
    />
  );
}

export function ProjectDetailPage({
  activityNavigation,
  activeTab,
  data,
  errorMessage,
  isProjectResolving,
  isLoading,
  isRefreshing,
  isBookmarkUpdating,
  isProjectMemoryGenerationActive,
  isProjectMemoryGenerationDelayed,
  isShareCopied,
  onActivityNavigationChange,
  onGenerateProjectMemory,
  onConnectRepository,
  onOpenAllProjects,
  onLoadMemoryArtifacts,
  onProjectSelect,
  onRepositoryFileSelect,
  onRetry,
  onShareProject,
  onSaveProjectMetadata,
  onSaveDescription,
  onToggleBookmark,
  onTabChange,
  projectOptions = [],
}: ProjectDetailPageProps) {
  const { t } = useI18n();
  const repositoryUrl = githubRepositoryUrl(data.project.repositoryUrl);
  const projectTabs: ProjectDetailTab[] = [
    { id: "overview", label: t("project.overview") },
    { id: "memory", label: t("project.memory") },
    { id: "ai-activity", label: t("project.prompts") },
    {
      externalHref: repositoryUrl ?? undefined,
      externalIcon: repositoryUrl ? "github" : undefined,
      id: "files",
      label: t("project.files"),
    },
  ];

  return (
    <section
      className="bh-project-detail"
      data-active-tab={activeTab}
      aria-labelledby="project-detail-title"
    >
      <ProjectHeader
        isBookmarked={data.project.isBookmarked}
        isBookmarkUpdating={isBookmarkUpdating}
        isLoading={isProjectResolving}
        isShareCopied={isShareCopied}
        lastActivityLabel={projectHeaderLastActivityLabel(data)}
        modelNames={projectHeaderModelNames(data)}
        name={data.project.name}
        onConnectRepository={data.project.repositoryUrl ? undefined : onConnectRepository}
        onOpenAllProjects={onOpenAllProjects}
        onProjectSelect={onProjectSelect}
        onShareProject={onShareProject}
        onToggleBookmark={onToggleBookmark}
        projectOptions={projectOptions}
        repositoryUrl={data.project.repositoryUrl}
        selectedProjectId={data.project.id}
      />

      <ProjectTabs
        activeTab={activeTab}
        notifications={{ memory: hasReadyMemory(data) }}
        onTabChange={onTabChange}
        tabs={projectTabs}
      />

      <div
        aria-labelledby={`project-tab-${activeTab}`}
        aria-busy={isRefreshing || undefined}
        className="bh-project-panel loading-cascade"
        data-loading={isRefreshing ? "true" : undefined}
        id={`project-panel-${activeTab}`}
        role="tabpanel"
      >
        <ProjectPanel
          activityNavigation={activityNavigation}
          activeTab={activeTab}
          data={data}
          errorMessage={errorMessage}
          isLoading={isLoading}
          isProjectMemoryGenerationActive={isProjectMemoryGenerationActive}
          isProjectMemoryGenerationDelayed={isProjectMemoryGenerationDelayed}
          onActivityNavigationChange={onActivityNavigationChange}
          onGenerateProjectMemory={onGenerateProjectMemory}
          onLoadMemoryArtifacts={onLoadMemoryArtifacts}
          onSaveProjectMetadata={onSaveProjectMetadata}
          onSaveDescription={onSaveDescription}
          onRepositoryFileSelect={onRepositoryFileSelect}
          onRetry={onRetry}
          onTabChange={onTabChange}
        />
      </div>
    </section>
  );
}
