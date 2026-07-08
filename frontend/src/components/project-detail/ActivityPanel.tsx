import { useMemo, useState } from "react";
import { Activity, Search } from "lucide-react";
import {
  ActivityCard,
  PromptActivityCard,
  PromptChangeDetail,
} from "./ActivityCard";
import {
  workTypeCounts,
  workTypeForFiles,
  type WorkTypeFilter,
} from "./activityHelpers";
import { EmptyState } from "./EmptyState";
import type {
  ActivityNavigationState,
  ActivityItem,
  ProjectDetailData,
  PromptActivityItem,
} from "./types";
import { WorkTypeFilterControl } from "./WorkTypeFilterControl";

const defaultActivityNavigation: ActivityNavigationState = {
  selectedPromptId: null,
  selectedSessionId: null,
  selectedSessionPromptId: null,
  view: "prompts",
};


type ActivityFeedItem =
  | {
      activity: PromptActivityItem;
      kind: "prompt";
      key: string;
      sequenceIndex: number;
      timestamp: number | null;
    }
  | {
      activity: ActivityItem;
      kind: "session";
      key: string;
      sequenceIndex: number;
      timestamp: number | null;
    };

function displayTimeValue(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function activityFeedSearchText(item: ActivityFeedItem) {
  if (item.kind === "prompt") {
    return [
      item.activity.prompt,
      item.activity.model,
      item.activity.submittedAt,
      `prompt ${item.activity.sequence}`,
      String(item.activity.sequence),
    ].join(" ");
  }

  return [
    item.activity.id,
    item.activity.model,
    item.activity.startedAt,
    item.activity.lastActivity,
    `${item.activity.prompts} prompts`,
    `${item.activity.filesChanged} files`,
  ].join(" ");
}

function sortActivityFeedItems(
  first: ActivityFeedItem,
  second: ActivityFeedItem,
) {
  if (
    first.timestamp !== null &&
    second.timestamp !== null &&
    first.timestamp !== second.timestamp
  ) {
    return second.timestamp - first.timestamp;
  }

  return first.sequenceIndex - second.sequenceIndex;
}

export function ActivityPanel({
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
  const [activityWorkTypeFilter, setActivityWorkTypeFilter] =
    useState<WorkTypeFilter>("all");
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
  const unfilteredActivityFeedItems = useMemo<ActivityFeedItem[]>(() => {
    const promptItems: ActivityFeedItem[] = data.promptActivities.map(
      (activity, index) => ({
        activity,
        key: `prompt-${activity.id}`,
        kind: "prompt",
        sequenceIndex: index,
        timestamp: displayTimeValue(activity.submittedAt),
      }),
    );
    const sessionItems: ActivityFeedItem[] = data.activities.map(
      (activity, index) => ({
        activity,
        key: `session-${activity.id}`,
        kind: "session",
        sequenceIndex: data.promptActivities.length + index,
        timestamp: displayTimeValue(activity.lastActivity),
      }),
    );
    const items = view === "sessions" ? sessionItems : promptItems;

    return [...items].sort(sortActivityFeedItems);
  }, [data.activities, data.promptActivities, view]);
  const searchMatchedActivityFeedItems = useMemo(() => {
    const query = promptSearchQuery.trim().toLowerCase();

    return unfilteredActivityFeedItems.filter((item) => {
      if (!query) {
        return true;
      }

      return activityFeedSearchText(item)
        .toLowerCase()
        .includes(query);
    });
  }, [promptSearchQuery, unfilteredActivityFeedItems]);
  const activityWorkTypeCounts = useMemo(
    () => workTypeCounts(searchMatchedActivityFeedItems.map((item) => item.activity)),
    [searchMatchedActivityFeedItems],
  );
  const filteredActivityFeedItems = useMemo(() => {
    if (view === "sessions" || activityWorkTypeFilter === "all") {
      return searchMatchedActivityFeedItems;
    }

    return searchMatchedActivityFeedItems.filter(
      (item) => workTypeForFiles(item.activity.filesChanged) === activityWorkTypeFilter,
    );
  }, [activityWorkTypeFilter, searchMatchedActivityFeedItems, view]);
  const selectedFeedItem =
    filteredActivityFeedItems.find((item) =>
      item.kind === "prompt"
        ? item.activity.id === selectedPromptId
        : item.activity.id === selectedSessionId,
    ) ??
    filteredActivityFeedItems[0] ??
    null;
  const selectedPrompt =
    selectedFeedItem?.kind === "prompt" ? selectedFeedItem.activity : null;
  const selectedSession =
    selectedFeedItem?.kind === "session" ? selectedFeedItem.activity : null;
  const selectedSessionPrompts = useMemo(
    () =>
      selectedSession
        ? data.promptActivities
            .filter((activity) => activity.sessionId === selectedSession.id)
            .sort((first, second) => second.sequence - first.sequence)
        : [],
    [data.promptActivities, selectedSession],
  );
  const latestPromptForSession = (sessionId: string | null | undefined) =>
    sessionId
      ? data.promptActivities
          .filter((prompt) => prompt.sessionId === sessionId)
          .sort((first, second) => second.sequence - first.sequence)[0] ?? null
      : null;
  const promptTargetForCurrentSelection =
    selectedFeedItem?.kind === "prompt"
      ? selectedFeedItem.activity
      : selectedSessionPrompts.find(
          (activity) => activity.id === selectedSessionPromptId,
        ) ??
        selectedSessionPrompts[0] ??
        null;
  const updateActivityView = (nextView: ActivityNavigationState["view"]) => {
    if (nextView === "prompts") {
      updateActivityNavigation({
        selectedPromptId: promptTargetForCurrentSelection?.id ?? selectedPromptId,
        selectedSessionId: null,
        selectedSessionPromptId: null,
        view: "prompts",
      });
      return;
    }

    const sessionTarget =
      promptTargetForCurrentSelection !== null
        ? data.activities.find(
            (activity) => activity.id === promptTargetForCurrentSelection.sessionId,
          ) ?? null
        : selectedSession;
    const sessionPromptTarget =
      promptTargetForCurrentSelection ?? latestPromptForSession(sessionTarget?.id);

    updateActivityNavigation({
      selectedPromptId: null,
      selectedSessionId: sessionTarget?.id ?? selectedSessionId,
      selectedSessionPromptId: sessionPromptTarget?.id ?? selectedSessionPromptId,
      view: "sessions",
    });
    setSessionConversationSearchQuery("");
  };
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
        `prompt ${activity.sequence}`,
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

  if (!hasPromptActivity && !hasSessionActivity) {
    return (
      <EmptyState
        description="AI interactions will appear after collector events are synced."
        icon={Activity}
        title="No activity yet"
      />
    );
  }

  const activityViewOptions: ActivityNavigationState["view"][] = [
    "prompts",
    "sessions",
  ];

  return (
    <div className="bh-activity-layout" data-view={view}>
      <div className="bh-activity-view-tabs" role="group" aria-label="Activity filters">
        {activityViewOptions.map((activityView) => (
          <button
            aria-pressed={view === activityView}
            className="bh-activity-view-tab"
            data-active={view === activityView}
            key={activityView}
            onClick={() => updateActivityView(activityView)}
            type="button"
          >
            {activityView === "prompts" ? "Prompts" : "Sessions"}
          </button>
        ))}
      </div>

      <div
        className="bh-activity-feed-layout"
        data-detail={selectedFeedItem?.kind ?? "prompt"}
      >
        <div className="bh-activity-feed-sidebar">
          <label className="bh-prompt-search">
            <Search aria-hidden="true" size={15} strokeWidth={1.7} />
            <input
              aria-label="Search activity by text, model, or date"
              onChange={(event) => setPromptSearchQuery(event.target.value)}
              placeholder="Search activity"
              type="search"
              value={promptSearchQuery}
            />
          </label>
          {view === "prompts" ? (
            <WorkTypeFilterControl
              ariaLabel="Filter activity by work type"
              counts={activityWorkTypeCounts}
              onChange={setActivityWorkTypeFilter}
              value={activityWorkTypeFilter}
            />
          ) : null}

          <div className="bh-latest-prompt-list">
            {filteredActivityFeedItems.length > 0 ? (
              <div className="bh-prompt-list">
                {filteredActivityFeedItems.map((item) => {
                  if (item.kind === "prompt") {
                    return (
                      <PromptActivityCard
                        activity={item.activity}
                        isSelected={item.key === selectedFeedItem?.key}
                        key={item.key}
                        onOpen={() =>
                          updateActivityNavigation({
                            selectedPromptId: item.activity.id,
                            selectedSessionId: null,
                            selectedSessionPromptId: null,
                          })
                        }
                      />
                    );
                  }

                  return (
                    <ActivityCard
                      activity={item.activity}
                      isSelected={item.key === selectedFeedItem?.key}
                      key={item.key}
                      onOpen={() => {
                        const latestPromptInSession = latestPromptForSession(
                          item.activity.id,
                        );
                        updateActivityNavigation({
                          selectedPromptId: null,
                          selectedSessionId: item.activity.id,
                          selectedSessionPromptId:
                            latestPromptInSession?.id ?? null,
                        });
                        setSessionConversationSearchQuery("");
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="bh-prompt-search-empty">
                No activity matches this filter.
              </div>
            )}
          </div>
        </div>

        {selectedFeedItem?.kind === "session" ? (
          <>
            <section
              aria-label="Session conversations"
              className="bh-session-conversation-panel"
            >
              {selectedSession ? (
                <>
                  <label className="bh-prompt-search">
                    <Search aria-hidden="true" size={15} strokeWidth={1.7} />
                    <input
                      aria-label="Search conversations by text or date"
                      onChange={(event) =>
                        setSessionConversationSearchQuery(event.target.value)
                      }
                      placeholder="Search conversations"
                      type="search"
                      value={sessionConversationSearchQuery}
                    />
                  </label>

                  <div className="bh-session-prompt-list">
                    {selectedSessionPrompts.length > 0 ? (
                      filteredSessionPrompts.length > 0 ? (
                        <div className="bh-prompt-list">
                          {filteredSessionPrompts.map((activity) => (
                            <PromptActivityCard
                              activity={activity}
                              isSelected={activity.id === selectedSessionPrompt?.id}
                              key={activity.id}
                              onOpen={() => {
                                updateActivityNavigation({
                                  selectedPromptId: null,
                                  selectedSessionId: selectedSession.id,
                                  selectedSessionPromptId: activity.id,
                                });
                              }}
                              promptLabel={`Prompt ${activity.sequence}`}
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
                  </div>
                </>
              ) : (
                <div className="bh-prompt-search-empty">
                  Select a session to inspect its conversations.
                </div>
              )}
            </section>

            <PromptChangeDetail activity={selectedSessionPrompt} />
          </>
        ) : (
          <>
            <PromptChangeDetail activity={selectedPrompt} />
          </>
        )}
      </div>
    </div>
  );
}
