import { useState } from "react";
import { Activity, BookOpen } from "lucide-react";
import { ActivityCard, PromptActivityCard } from "./ActivityCard";
import { CodeViewer } from "./CodeViewer";
import { EmptyState } from "./EmptyState";
import { FileTree } from "./FileTree";
import { KnowledgeCard } from "./KnowledgeCard";
import { OverviewCard } from "./OverviewCard";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectTabs } from "./ProjectTabs";
import type {
  ProjectDetailData,
  ProjectDetailTab,
  ProjectDetailTabId,
} from "./types";
import "./project-detail.css";

type ProjectDetailPageProps = {
  activeTab: ProjectDetailTabId;
  data: ProjectDetailData;
  errorMessage?: string | null;
  isLoading?: boolean;
  onConnectRepository?: () => void;
  onRepositoryFileSelect?: (path: string) => void;
  onRetry?: () => void;
  onTabChange: (tabId: ProjectDetailTabId) => void;
};

const projectTabs: ProjectDetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "ai-activity", label: "AI Activity" },
  { id: "knowledge", label: "Knowledge" },
  { id: "files", label: "Files" },
];

function OverviewPanel({ data }: { data: ProjectDetailData }) {
  if (data.overview.length === 0) {
    return (
      <EmptyState
        description="Project metadata will appear after BuildHub receives project activity."
        icon={BookOpen}
        title="No overview data yet"
      />
    );
  }

  return (
    <div className="bh-overview-grid">
      {data.overview.map((item) => (
        <OverviewCard item={item} key={item.title} />
      ))}
    </div>
  );
}

function ActivityPanel({ data }: { data: ProjectDetailData }) {
  const [view, setView] = useState<"prompts" | "sessions">("prompts");
  const hasPromptActivity = data.promptActivities.length > 0;
  const hasSessionActivity = data.activities.length > 0;

  if (!hasPromptActivity && !hasSessionActivity) {
    return (
      <EmptyState
        description="AI interactions will appear after collector events are synced."
        icon={Activity}
        title="No AI activity yet"
      />
    );
  }

  return (
    <div className="bh-activity-layout">
      <div className="bh-activity-view-tabs" role="tablist" aria-label="AI activity views">
        <button
          aria-selected={view === "prompts"}
          className="bh-activity-view-tab"
          data-active={view === "prompts"}
          onClick={() => setView("prompts")}
          role="tab"
          type="button"
        >
          Latest prompts
        </button>
        <button
          aria-selected={view === "sessions"}
          className="bh-activity-view-tab"
          data-active={view === "sessions"}
          onClick={() => setView("sessions")}
          role="tab"
          type="button"
        >
          Sessions
        </button>
      </div>

      {view === "prompts" ? (
        hasPromptActivity ? (
          <div className="bh-activity-list" role="tabpanel">
            {data.promptActivities.map((activity) => (
              <PromptActivityCard activity={activity} key={activity.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            description="PromptSubmitted events will appear here newest first."
            icon={Activity}
            title="No prompts yet"
          />
        )
      ) : hasSessionActivity ? (
        <div className="bh-activity-list" role="tabpanel">
          {data.activities.map((activity) => (
            <ActivityCard activity={activity} key={activity.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          description="Session summaries will appear after AI activity is grouped."
          icon={Activity}
          title="No sessions yet"
        />
      )}

      <section
        className="bh-activity-detail-placeholder"
        id="activity-detail-placeholder"
        aria-labelledby="activity-detail-placeholder-title"
      >
        <Activity aria-hidden="true" size={18} strokeWidth={1.5} />
        <div>
          <h2 id="activity-detail-placeholder-title">Activity detail</h2>
          <p>Select an AI interaction to review the detailed timeline.</p>
        </div>
      </section>
    </div>
  );
}

function KnowledgePanel({ data }: { data: ProjectDetailData }) {
  if (data.knowledge.length === 0) {
    return (
      <EmptyState
        description="README, rules, architecture notes, and memory resources will appear after related files are tracked."
        icon={BookOpen}
        title="No knowledge resources yet"
      />
    );
  }

  return (
    <div className="bh-knowledge-list">
      {data.knowledge.map((item) => (
        <KnowledgeCard item={item} key={item.title} />
      ))}
    </div>
  );
}

function FilesPanel({
  data,
  onRepositoryFileSelect,
}: {
  data: ProjectDetailData;
  onRepositoryFileSelect?: (path: string) => void;
}) {
  return (
    <div className="bh-files-layout">
      <section className="bh-files-section" aria-labelledby="tracked-files-title">
        <div className="bh-files-section-header">
          <h2 id="tracked-files-title">Tracked changes</h2>
          <p>Files captured from BuildHub collector events.</p>
        </div>
        {data.files.length > 0 ? (
          <FileTree label="Tracked project files" nodes={data.files} />
        ) : (
          <EmptyState
            description="The tracked file tree will appear after file change events are stored."
            icon={BookOpen}
            title="No tracked files yet"
          />
        )}
      </section>

      <section className="bh-files-section" aria-labelledby="repository-files-title">
        <div className="bh-files-section-header">
          <h2 id="repository-files-title">GitHub repository</h2>
          <p>
            {data.repositoryFilesRepository
              ? `${data.repositoryFilesRepository}${data.repositoryFilesTruncated ? " · truncated" : ""}`
              : "Repository tree from GitHub OAuth access."}
          </p>
        </div>
        {data.repositoryFiles.length > 0 ? (
          <div className="bh-repository-browser">
            <FileTree
              label="GitHub repository files"
              nodes={data.repositoryFiles}
              onFileSelect={onRepositoryFileSelect}
              selectedPath={data.repositoryFileSelectedPath}
            />
            <CodeViewer
              content={data.repositoryFileContent}
              errorMessage={data.repositoryFileContentError}
              isLoading={data.repositoryFileContentLoading}
              selectedPath={data.repositoryFileSelectedPath}
            />
          </div>
        ) : (
          <EmptyState
            description={
              data.repositoryFilesMessage ??
              "Sign in with GitHub repository access to browse repository files."
            }
            icon={BookOpen}
            title="No GitHub repository files"
          >
            {data.repositoryFilesConnectUrl &&
            data.repositoryFilesStatus === "github_repository_access_required" ? (
              <a className="bh-empty-state-button" href={data.repositoryFilesConnectUrl}>
                Connect GitHub
              </a>
            ) : null}
          </EmptyState>
        )}
      </section>
    </div>
  );
}

function ProjectPanel({
  activeTab,
  data,
  errorMessage,
  isLoading,
  onRepositoryFileSelect,
  onRetry,
}: {
  activeTab: ProjectDetailTabId;
  data: ProjectDetailData;
  errorMessage?: string | null;
  isLoading?: boolean;
  onRepositoryFileSelect?: (path: string) => void;
  onRetry?: () => void;
}) {
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

  if (isLoading) {
    return (
      <EmptyState
        description="Loading the latest project metadata, AI activity, knowledge, and tracked files."
        icon={Activity}
        title="Loading project detail"
      />
    );
  }

  if (activeTab === "overview") {
    return <OverviewPanel data={data} />;
  }

  if (activeTab === "ai-activity") {
    return <ActivityPanel data={data} />;
  }

  if (activeTab === "knowledge") {
    return <KnowledgePanel data={data} />;
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
  activeTab,
  data,
  errorMessage,
  isLoading,
  onConnectRepository,
  onRepositoryFileSelect,
  onRetry,
  onTabChange,
}: ProjectDetailPageProps) {
  return (
    <section className="bh-project-detail" aria-labelledby="project-detail-title">
      <ProjectHeader
        description={data.project.description}
        name={data.project.name}
        onConnectRepository={data.project.repositoryUrl ? undefined : onConnectRepository}
        repositoryStatus={data.project.repositoryStatus}
        repositoryUrl={data.project.repositoryUrl}
      />

      <ProjectTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        tabs={projectTabs}
      />

      <div
        aria-labelledby={`project-tab-${activeTab}`}
        className="bh-project-panel"
        id={`project-panel-${activeTab}`}
        role="tabpanel"
      >
        <ProjectPanel
          activeTab={activeTab}
          data={data}
          errorMessage={errorMessage}
          isLoading={isLoading}
          onRepositoryFileSelect={onRepositoryFileSelect}
          onRetry={onRetry}
        />
      </div>
    </section>
  );
}
