import { BookOpen } from "lucide-react";
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
const projectTabs: ProjectDetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "memory", label: "Memory" },
  { id: "ai-activity", label: "Sessions" },
  { id: "files", label: "Files" },
];

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

function ProjectPanel({
  activityNavigation,
  activeTab,
  data,
  errorMessage,
  isLoading,
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
  if (isLoading) {
    return <ProjectDetailLoadingSkeleton activeTab={activeTab} />;
  }

  if (errorMessage) {
    return (
      <EmptyState
        description={errorMessage}
        icon={BookOpen}
        title="Project detail could not be loaded"
      >
        {onRetry ? (
          <button className="bh-empty-state-button" onClick={onRetry} type="button">
            Retry
          </button>
        ) : null}
      </EmptyState>
    );
  }

  if (activeTab === "overview") {
    return (
      <OverviewPanel
        data={data}
        onOpenActivity={() => onTabChange("ai-activity")}
        onOpenMemory={() => onTabChange("memory")}
        onSaveProjectMetadata={onSaveProjectMetadata}
        onSaveDescription={onSaveDescription}
      />
    );
  }

  if (activeTab === "memory") {
    return (
      <MemoryPanel
        data={data}
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
      description="This project section is available as a UI placeholder."
      icon={BookOpen}
      title="Section pending"
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
