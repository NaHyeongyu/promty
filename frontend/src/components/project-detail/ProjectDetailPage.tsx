import { useMemo, useState } from "react";
import { Activity, BookOpen, Search } from "lucide-react";
import {
  ActivityCard,
  PromptActivityCard,
  PromptChangeDetail,
} from "./ActivityCard";
import { CodeViewer } from "./CodeViewer";
import { EmptyState } from "./EmptyState";
import { FileTree } from "./FileTree";
import { KnowledgeCard } from "./KnowledgeCard";
import { OverviewCard } from "./OverviewCard";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectTabs } from "./ProjectTabs";
import type {
  ActivityNavigationState,
  ProjectDetailData,
  ProjectDetailTab,
  ProjectDetailTabId,
} from "./types";
import "./project-detail.css";

type ProjectDetailPageProps = {
  activityNavigation?: ActivityNavigationState;
  activeTab: ProjectDetailTabId;
  data: ProjectDetailData;
  errorMessage?: string | null;
  isLoading?: boolean;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
  onConnectRepository?: () => void;
  onRepositoryFileSelect?: (path: string) => void;
  onRetry?: () => void;
  onTabChange: (tabId: ProjectDetailTabId) => void;
};

const defaultActivityNavigation: ActivityNavigationState = {
  selectedPromptId: null,
  selectedSessionId: null,
  selectedSessionPromptId: null,
  view: "prompts",
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

function ActivityPanel({
  activityNavigation,
  data,
  onActivityNavigationChange,
}: {
  activityNavigation?: ActivityNavigationState;
  data: ProjectDetailData;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
}) {
  const [localActivityNavigation, setLocalActivityNavigation] =
    useState<ActivityNavigationState>(defaultActivityNavigation);
  const [promptSearchQuery, setPromptSearchQuery] = useState("");
  const [sessionConversationSearchQuery, setSessionConversationSearchQuery] =
    useState("");
  const currentActivityNavigation =
    activityNavigation ?? localActivityNavigation;
  const updateActivityNavigation = (state: Partial<ActivityNavigationState>) => {
    const nextActivityNavigation = {
      ...currentActivityNavigation,
      ...state,
    };

    if (onActivityNavigationChange) {
      onActivityNavigationChange(nextActivityNavigation);
      return;
    }

    setLocalActivityNavigation(nextActivityNavigation);
  };
  const view = currentActivityNavigation.view;
  const selectedPromptId = currentActivityNavigation.selectedPromptId;
  const selectedSessionId = currentActivityNavigation.selectedSessionId;
  const selectedSessionPromptId =
    currentActivityNavigation.selectedSessionPromptId;
  const hasPromptActivity = data.promptActivities.length > 0;
  const hasSessionActivity = data.activities.length > 0;
  const filteredPromptActivities = useMemo(() => {
    const query = promptSearchQuery.trim().toLowerCase();

    if (!query) {
      return data.promptActivities;
    }

    return data.promptActivities.filter((activity) =>
      `${activity.prompt} ${activity.submittedAt}`.toLowerCase().includes(query),
    );
  }, [data.promptActivities, promptSearchQuery]);
  const selectedPrompt =
    filteredPromptActivities.find((activity) => activity.id === selectedPromptId) ??
    filteredPromptActivities[0] ??
    null;
  const selectedSession =
    data.activities.find((activity) => activity.id === selectedSessionId) ??
    data.activities[0] ??
    null;
  const selectedSessionPrompts = selectedSession
    ? data.promptActivities.filter(
        (activity) => activity.sessionId === selectedSession.id,
      ).sort((first, second) => second.sequence - first.sequence)
    : [];
  const filteredSessionPrompts = useMemo(() => {
    const query = sessionConversationSearchQuery.trim().toLowerCase();

    if (!query) {
      return selectedSessionPrompts;
    }

    return selectedSessionPrompts.filter((activity) =>
      [
        activity.prompt,
        activity.response ?? "",
        activity.submittedAt,
        `turn ${activity.sequence}`,
        String(activity.sequence),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [selectedSessionPrompts, sessionConversationSearchQuery]);
  const selectedSessionPrompt =
    filteredSessionPrompts.find(
      (activity) => activity.id === selectedSessionPromptId,
    ) ??
    filteredSessionPrompts[0] ??
    null;
  const sessionPromptCountLabel = sessionConversationSearchQuery.trim()
    ? `${filteredSessionPrompts.length}/${selectedSessionPrompts.length} prompts`
    : `${selectedSessionPrompts.length} prompts`;

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
          onClick={() =>
            updateActivityNavigation({
              selectedPromptId: null,
              selectedSessionId: null,
              selectedSessionPromptId: null,
              view: "prompts",
            })
          }
          role="tab"
          type="button"
        >
          Latest prompts
        </button>
        <button
          aria-selected={view === "sessions"}
          className="bh-activity-view-tab"
          data-active={view === "sessions"}
          onClick={() =>
            updateActivityNavigation({
              selectedPromptId: null,
              selectedSessionId: null,
              selectedSessionPromptId: null,
              view: "sessions",
            })
          }
          role="tab"
          type="button"
        >
          Sessions
        </button>
      </div>

      {view === "prompts" ? (
        hasPromptActivity ? (
          <div className="bh-prompt-activity-layout" role="tabpanel">
            <div className="bh-prompt-sidebar">
              <label className="bh-prompt-search">
                <Search aria-hidden="true" size={15} strokeWidth={1.7} />
                <input
                  aria-label="Search prompts by text or date"
                  onChange={(event) => setPromptSearchQuery(event.target.value)}
                  placeholder="Search prompts or dates"
                  type="search"
                  value={promptSearchQuery}
                />
              </label>

              {filteredPromptActivities.length > 0 ? (
                <div className="bh-prompt-list">
                  {filteredPromptActivities.map((activity) => (
                    <PromptActivityCard
                      activity={activity}
                      isSelected={activity.id === selectedPrompt?.id}
                      key={activity.id}
                      onOpen={() =>
                        updateActivityNavigation({
                          selectedPromptId: activity.id,
                          selectedSessionId: null,
                          selectedSessionPromptId: null,
                          view: "prompts",
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="bh-prompt-search-empty">
                  No prompts match this search.
                </div>
              )}
            </div>
            <PromptChangeDetail activity={selectedPrompt} />
          </div>
        ) : (
          <EmptyState
            description="PromptSubmitted events will appear here newest first."
            icon={Activity}
            title="No prompts yet"
          />
        )
      ) : hasSessionActivity ? (
        <div className="bh-activity-session-layout" role="tabpanel">
          <div className="bh-activity-list">
            {data.activities.map((activity) => (
              <ActivityCard
                activity={activity}
                isSelected={activity.id === selectedSession?.id}
                key={activity.id}
                onOpen={() => {
                  updateActivityNavigation({
                    selectedPromptId: null,
                    selectedSessionId: activity.id,
                    selectedSessionPromptId: null,
                    view: "sessions",
                  });
                  setSessionConversationSearchQuery("");
                }}
              />
            ))}
          </div>

          <section
            aria-labelledby="session-conversations-title"
            className="bh-session-conversation-panel"
          >
            {selectedSession ? (
              <>
                <div className="bh-session-conversation-panel-header">
                  <div>
                    <span>Selected session</span>
                    <h2 id="session-conversations-title">{selectedSession.model}</h2>
                    <p>
                      Session {selectedSession.id.slice(0, 8)} ·{" "}
                      {selectedSession.lastActivity}
                    </p>
                  </div>
                  <strong>{sessionPromptCountLabel}</strong>
                </div>

                <label className="bh-prompt-search">
                  <Search aria-hidden="true" size={15} strokeWidth={1.7} />
                  <input
                    aria-label="Search conversations by text or date"
                    onChange={(event) =>
                      setSessionConversationSearchQuery(event.target.value)
                    }
                    placeholder="Search conversations or dates"
                    type="search"
                    value={sessionConversationSearchQuery}
                  />
                </label>

                {selectedSessionPrompts.length > 0 ? (
                  filteredSessionPrompts.length > 0 ? (
                    <div className="bh-prompt-list">
                      {filteredSessionPrompts.map((activity) => (
                        <PromptActivityCard
                          activity={activity}
                          isSelected={activity.id === selectedSessionPrompt?.id}
                          key={activity.id}
                          onOpen={() =>
                            updateActivityNavigation({
                              selectedPromptId: null,
                              selectedSessionId: selectedSession?.id ?? null,
                              selectedSessionPromptId: activity.id,
                              view: "sessions",
                            })
                          }
                          turnLabel={`Turn ${activity.sequence}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="bh-prompt-search-empty">
                      No conversations match this search.
                    </div>
                  )
                ) : (
                  <div className="bh-prompt-search-empty">
                    No prompts were captured in this session.
                  </div>
                )}
              </>
            ) : (
              <div className="bh-prompt-search-empty">
                Select a session to inspect its conversations.
              </div>
            )}
          </section>

          <PromptChangeDetail activity={selectedSessionPrompt} />
        </div>
      ) : (
        <EmptyState
          description="Session summaries will appear after AI activity is grouped."
          icon={Activity}
          title="No sessions yet"
        />
      )}

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
  activityNavigation,
  activeTab,
  data,
  errorMessage,
  isLoading,
  onActivityNavigationChange,
  onRepositoryFileSelect,
  onRetry,
}: {
  activityNavigation?: ActivityNavigationState;
  activeTab: ProjectDetailTabId;
  data: ProjectDetailData;
  errorMessage?: string | null;
  isLoading?: boolean;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
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
    return (
      <ActivityPanel
        activityNavigation={activityNavigation}
        data={data}
        onActivityNavigationChange={onActivityNavigationChange}
      />
    );
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
  activityNavigation,
  activeTab,
  data,
  errorMessage,
  isLoading,
  onActivityNavigationChange,
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
        repositoryUrl={data.project.repositoryUrl}
        tabs={projectTabs}
      />

      <div
        aria-labelledby={`project-tab-${activeTab}`}
        className="bh-project-panel"
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
          onRepositoryFileSelect={onRepositoryFileSelect}
          onRetry={onRetry}
        />
      </div>
    </section>
  );
}
