import { useEffect, useMemo, useState } from "react";
import { Activity, Search } from "lucide-react";
import { fetchProjectPromptActivities } from "../../api/projects";
import { promptActivityPageFromApi } from "../../workspace/projectDetailMappers";
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
import { useI18n } from "../../i18n/I18nProvider";

const PROMPT_ACTIVITY_PAGE_LIMIT = 50;

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

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function appendUniquePromptActivities(
  currentItems: PromptActivityItem[],
  nextItems: PromptActivityItem[],
) {
  const seenIds = new Set(currentItems.map((item) => item.id));
  return [
    ...currentItems,
    ...nextItems.filter((item) => {
      if (seenIds.has(item.id)) {
        return false;
      }
      seenIds.add(item.id);
      return true;
    }),
  ];
}

export function ActivityPanel({
  activityNavigation,
  data,
  onActivityNavigationChange,
  onSharePrompt,
  notice,
  providedDataError = null,
  providedDataLoading = false,
  useProvidedData = false,
}: {
  activityNavigation?: ActivityNavigationState;
  data: ProjectDetailData;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
  onSharePrompt?: (activity: PromptActivityItem) => void;
  notice?: string;
  providedDataError?: string | null;
  providedDataLoading?: boolean;
  useProvidedData?: boolean;
}) {
  const { t } = useI18n();
  const [localActivityNavigation, setLocalActivityNavigation] =
    useState<ActivityNavigationState>(defaultActivityNavigation);
  const [activitySearchInput, setActivitySearchInput] = useState("");
  const promptSearchQuery = useDebouncedValue(activitySearchInput, 300);
  const [promptActivities, setPromptActivities] = useState<PromptActivityItem[]>(
    data.promptActivities,
  );
  const [promptActivityTotal, setPromptActivityTotal] = useState<number | null>(null);
  const [promptActivityNextCursor, setPromptActivityNextCursor] =
    useState<string | null>(null);
  const [promptActivityHasMore, setPromptActivityHasMore] = useState(false);
  const [hasLoadedPromptActivityPage, setHasLoadedPromptActivityPage] = useState(useProvidedData);
  const [isPromptActivityLoading, setIsPromptActivityLoading] = useState(providedDataLoading);
  const [isPromptActivityLoadingMore, setIsPromptActivityLoadingMore] = useState(false);
  const [promptActivityError, setPromptActivityError] = useState<string | null>(null);
  const [promptActivityRequestVersion, setPromptActivityRequestVersion] = useState(0);
  const [activityWorkTypeFilter, setActivityWorkTypeFilter] =
    useState<WorkTypeFilter>("all");
  const [sessionConversationSearchInput, setSessionConversationSearchInput] =
    useState("");
  const sessionConversationSearchQuery = useDebouncedValue(
    sessionConversationSearchInput,
    300,
  );
  const [sessionPrompts, setSessionPrompts] = useState<PromptActivityItem[]>([]);
  const [sessionPromptTotal, setSessionPromptTotal] = useState<number | null>(null);
  const [sessionPromptNextCursor, setSessionPromptNextCursor] =
    useState<string | null>(null);
  const [sessionPromptHasMore, setSessionPromptHasMore] = useState(false);
  const [isSessionPromptLoading, setIsSessionPromptLoading] = useState(false);
  const [isSessionPromptLoadingMore, setIsSessionPromptLoadingMore] = useState(false);
  const [sessionPromptError, setSessionPromptError] = useState<string | null>(null);
  const [sessionPromptRequestVersion, setSessionPromptRequestVersion] = useState(0);
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
  const hasPromptActivity = promptActivities.length > 0;
  const hasSessionActivity = data.activities.length > 0;
  const unfilteredActivityFeedItems = useMemo<ActivityFeedItem[]>(() => {
    const promptItems: ActivityFeedItem[] = promptActivities.map(
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
        sequenceIndex: promptActivities.length + index,
        timestamp: displayTimeValue(activity.lastActivity),
      }),
    );
    const items = view === "sessions" ? sessionItems : promptItems;

    return [...items].sort(sortActivityFeedItems);
  }, [data.activities, promptActivities, view]);
  const searchMatchedActivityFeedItems = useMemo(() => {
    const query = promptSearchQuery.trim().toLowerCase();

    if (view === "prompts" && !useProvidedData) {
      return unfilteredActivityFeedItems;
    }

    return unfilteredActivityFeedItems.filter((item) => {
      if (!query) {
        return true;
      }

      return activityFeedSearchText(item)
        .toLowerCase()
        .includes(query);
    });
  }, [promptSearchQuery, unfilteredActivityFeedItems, useProvidedData, view]);
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
  const selectedSessionPrompts = selectedSession ? sessionPrompts : [];
  const promptTargetForCurrentSelection =
    selectedFeedItem?.kind === "prompt"
      ? selectedFeedItem.activity
      : selectedSessionPrompts.find(
          (activity) => activity.id === selectedSessionPromptId,
        ) ??
        selectedSessionPrompts[0] ??
        null;
  const selectedSessionIdForFetch = selectedSession?.id ?? null;

  useEffect(() => {
    setPromptActivities(data.promptActivities);
    setPromptActivityTotal(useProvidedData ? data.promptActivities.length : null);
    setPromptActivityNextCursor(null);
    setPromptActivityHasMore(false);
    setHasLoadedPromptActivityPage(useProvidedData && !providedDataLoading);
    setIsPromptActivityLoading(useProvidedData && providedDataLoading);
    setPromptActivityError(useProvidedData ? providedDataError : null);
    setSessionPrompts([]);
    setSessionPromptTotal(null);
    setSessionPromptNextCursor(null);
    setSessionPromptHasMore(false);
    setSessionPromptError(null);
  }, [data.project.id, data.promptActivities, providedDataError, providedDataLoading, useProvidedData]);

  useEffect(() => {
    if (useProvidedData || view !== "prompts" || !data.project.id) {
      return;
    }

    const controller = new AbortController();
    setIsPromptActivityLoading(true);
    setPromptActivityError(null);
    setPromptActivities([]);
    setPromptActivityTotal(null);
    setPromptActivityNextCursor(null);
    setPromptActivityHasMore(false);

    void fetchProjectPromptActivities({
      limit: PROMPT_ACTIVITY_PAGE_LIMIT,
      projectId: data.project.id,
      query: promptSearchQuery,
      signal: controller.signal,
    })
      .then((payload) => {
        const page = promptActivityPageFromApi(payload);
        setPromptActivities(page.items);
        setPromptActivityTotal(page.total);
        setPromptActivityNextCursor(page.nextCursor);
        setPromptActivityHasMore(page.hasMore);
        setHasLoadedPromptActivityPage(true);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setPromptActivityError(
          error instanceof Error ? error.message : "Prompt activity request failed",
        );
        setHasLoadedPromptActivityPage(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsPromptActivityLoading(false);
        }
      });

    return () => controller.abort();
  }, [data.project.id, promptActivityRequestVersion, promptSearchQuery, useProvidedData, view]);

  useEffect(() => {
    if (useProvidedData) {
      const query = sessionConversationSearchQuery.trim().toLowerCase();
      const providedSessionPrompts = selectedSessionIdForFetch
        ? data.promptActivities.filter((activity) =>
            activity.sessionId === selectedSessionIdForFetch &&
            (!query || [activity.prompt, activity.response, activity.model]
              .filter(Boolean)
              .some((value) => value!.toLowerCase().includes(query))),
          )
        : [];
      setSessionPrompts(providedSessionPrompts);
      setSessionPromptTotal(providedSessionPrompts.length);
      setSessionPromptNextCursor(null);
      setSessionPromptHasMore(false);
      setSessionPromptError(null);
      return;
    }
    if (view !== "sessions" || !data.project.id || !selectedSessionIdForFetch) {
      setSessionPrompts([]);
      setSessionPromptTotal(null);
      setSessionPromptNextCursor(null);
      setSessionPromptHasMore(false);
      return;
    }

    const controller = new AbortController();
    setIsSessionPromptLoading(true);
    setSessionPromptError(null);
    setSessionPrompts([]);
    setSessionPromptTotal(null);
    setSessionPromptNextCursor(null);
    setSessionPromptHasMore(false);

    void fetchProjectPromptActivities({
      limit: PROMPT_ACTIVITY_PAGE_LIMIT,
      projectId: data.project.id,
      query: sessionConversationSearchQuery,
      sessionId: selectedSessionIdForFetch,
      signal: controller.signal,
    })
      .then((payload) => {
        const page = promptActivityPageFromApi(payload);
        setSessionPrompts(page.items);
        setSessionPromptTotal(page.total);
        setSessionPromptNextCursor(page.nextCursor);
        setSessionPromptHasMore(page.hasMore);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setSessionPromptError(
          error instanceof Error ? error.message : "Session prompt request failed",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSessionPromptLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    data.project.id,
    selectedSessionIdForFetch,
    sessionConversationSearchQuery,
    sessionPromptRequestVersion,
    useProvidedData,
    view,
  ]);

  const loadMorePromptActivities = async () => {
    if (
      isPromptActivityLoadingMore ||
      !promptActivityHasMore ||
      !promptActivityNextCursor
    ) {
      return;
    }

    setIsPromptActivityLoadingMore(true);
    setPromptActivityError(null);
    try {
      const page = promptActivityPageFromApi(
        await fetchProjectPromptActivities({
          limit: PROMPT_ACTIVITY_PAGE_LIMIT,
          cursor: promptActivityNextCursor,
          projectId: data.project.id,
          query: promptSearchQuery,
        }),
      );
      setPromptActivities((currentItems) =>
        appendUniquePromptActivities(currentItems, page.items),
      );
      setPromptActivityTotal(page.total);
      setPromptActivityNextCursor(page.nextCursor);
      setPromptActivityHasMore(page.hasMore);
    } catch (error) {
      setPromptActivityError(
        error instanceof Error ? error.message : "Prompt activity request failed",
      );
    } finally {
      setIsPromptActivityLoadingMore(false);
    }
  };

  const loadMoreSessionPrompts = async () => {
    if (
      isSessionPromptLoadingMore ||
      !sessionPromptHasMore ||
      !sessionPromptNextCursor ||
      !selectedSessionIdForFetch
    ) {
      return;
    }

    setIsSessionPromptLoadingMore(true);
    setSessionPromptError(null);
    try {
      const page = promptActivityPageFromApi(
        await fetchProjectPromptActivities({
          limit: PROMPT_ACTIVITY_PAGE_LIMIT,
          cursor: sessionPromptNextCursor,
          projectId: data.project.id,
          query: sessionConversationSearchQuery,
          sessionId: selectedSessionIdForFetch,
        }),
      );
      setSessionPrompts((currentItems) =>
        appendUniquePromptActivities(currentItems, page.items),
      );
      setSessionPromptTotal(page.total);
      setSessionPromptNextCursor(page.nextCursor);
      setSessionPromptHasMore(page.hasMore);
    } catch (error) {
      setSessionPromptError(
        error instanceof Error ? error.message : "Session prompt request failed",
      );
    } finally {
      setIsSessionPromptLoadingMore(false);
    }
  };

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

    updateActivityNavigation({
      selectedPromptId: null,
      selectedSessionId: sessionTarget?.id ?? selectedSessionId,
      selectedSessionPromptId: promptTargetForCurrentSelection?.id ?? null,
      view: "sessions",
    });
    setSessionConversationSearchInput("");
  };
  const filteredSessionPrompts = selectedSessionPrompts;
  const selectedSessionPrompt =
    filteredSessionPrompts.find(
      (activity) => activity.id === selectedSessionPromptId,
    ) ??
    filteredSessionPrompts[0] ??
    null;

  if (
    promptActivityError &&
    !hasPromptActivity &&
    !hasSessionActivity &&
    hasLoadedPromptActivityPage &&
    !isPromptActivityLoading
  ) {
    return (
      <EmptyState
        description={promptActivityError}
        icon={Activity}
        title={t("activity.loadFailed")}
      >
        <button
          className="bh-empty-state-button"
          onClick={() => setPromptActivityRequestVersion((version) => version + 1)}
          type="button"
        >
          {t("common.retry")}
        </button>
      </EmptyState>
    );
  }

  if (
    !hasPromptActivity &&
    !hasSessionActivity &&
    hasLoadedPromptActivityPage &&
    !isPromptActivityLoading
  ) {
    return (
      <EmptyState
        description={t("activity.noActivityDescription")}
        icon={Activity}
        title={t("activity.noActivity")}
      />
    );
  }

  const activityViewOptions: ActivityNavigationState["view"][] = [
    "prompts",
    "sessions",
  ];

  return (
    <div className="bh-activity-layout" data-notice={notice ? "true" : undefined} data-view={view}>
      {notice ? <div className="bh-activity-notice">{notice}</div> : null}
      <div className="bh-activity-view-tabs" role="group" aria-label={t("activity.filters")}>
        {activityViewOptions.map((activityView) => (
          <button
            aria-pressed={view === activityView}
            className="bh-activity-view-tab"
            data-active={view === activityView}
            key={activityView}
            onClick={() => updateActivityView(activityView)}
            type="button"
          >
            {activityView === "prompts" ? t("activity.byPrompt") : t("activity.bySession")}
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
              aria-label={t("activity.searchFull")}
              onChange={(event) => setActivitySearchInput(event.target.value)}
              placeholder={t("activity.search")}
              type="search"
              value={activitySearchInput}
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
            {view === "prompts" && promptActivityError ? (
              <div className="bh-inline-request-error" role="alert">
                <span>{promptActivityError}</span>
                <button
                  onClick={() =>
                    setPromptActivityRequestVersion((version) => version + 1)
                  }
                  type="button"
                >
                  {t("common.retry")}
                </button>
              </div>
            ) : null}
            {view === "prompts" &&
            isPromptActivityLoading &&
            promptActivities.length === 0 ? (
              <div className="bh-prompt-search-empty">{t("activity.loadingPrompts")}</div>
            ) : filteredActivityFeedItems.length > 0 ? (
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
                        updateActivityNavigation({
                          selectedPromptId: null,
                          selectedSessionId: item.activity.id,
                          selectedSessionPromptId: null,
                        });
                        setSessionConversationSearchInput("");
                      }}
                    />
                  );
                })}
              </div>
            ) : !promptActivityError ? (
              <div className="bh-prompt-search-empty">
                {t("activity.noFilterMatches")}
              </div>
            ) : null}
            {view === "prompts" && promptActivityHasMore && promptActivityNextCursor ? (
              <button
                className="bh-prompt-page-action"
                disabled={isPromptActivityLoadingMore}
                onClick={() => {
                  void loadMorePromptActivities();
                }}
                type="button"
              >
                {isPromptActivityLoadingMore ? t("activity.loading") : t("activity.loadMore")}
              </button>
            ) : null}
            {view === "prompts" && promptActivityTotal !== null ? (
              <div className="bh-prompt-page-count">
                {promptActivities.length}/{promptActivityTotal}
              </div>
            ) : null}
          </div>
        </div>

        {selectedFeedItem?.kind === "session" ? (
          <>
            <section
              aria-label={t("activity.sessionConversations")}
              className="bh-session-conversation-panel"
            >
              {selectedSession ? (
                <>
                  <label className="bh-prompt-search">
                    <Search aria-hidden="true" size={15} strokeWidth={1.7} />
                    <input
                      aria-label={t("activity.searchConversations")}
                      onChange={(event) =>
                        setSessionConversationSearchInput(event.target.value)
                      }
                      placeholder={t("activity.searchConversations")}
                      type="search"
                      value={sessionConversationSearchInput}
                    />
                  </label>

                  <div className="bh-session-prompt-list">
                    {sessionPromptError ? (
                      <div className="bh-inline-request-error" role="alert">
                        <span>{sessionPromptError}</span>
                        <button
                          onClick={() =>
                            setSessionPromptRequestVersion((version) => version + 1)
                          }
                          type="button"
                        >
                          {t("common.retry")}
                        </button>
                      </div>
                    ) : null}
                    {isSessionPromptLoading && selectedSessionPrompts.length === 0 ? (
                      <div className="bh-prompt-search-empty">
                        {t("activity.loadingConversations")}
                      </div>
                    ) : selectedSessionPrompts.length > 0 ? (
                      filteredSessionPrompts.length > 0 ? (
                        <>
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
                                promptLabel={t("activity.promptLabel", { sequence: activity.sequence })}
                              />
                            ))}
                          </div>
                          {sessionPromptHasMore && sessionPromptNextCursor ? (
                            <button
                              className="bh-prompt-page-action"
                              disabled={isSessionPromptLoadingMore}
                              onClick={() => {
                                void loadMoreSessionPrompts();
                              }}
                              type="button"
                            >
                              {isSessionPromptLoadingMore ? t("activity.loading") : t("activity.loadMore")}
                            </button>
                          ) : null}
                          {sessionPromptTotal !== null ? (
                            <div className="bh-prompt-page-count">
                              {sessionPrompts.length}/{sessionPromptTotal}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        !sessionPromptError ? (
                          <div className="bh-prompt-search-empty">
                            {t("activity.noConversationsMatch")}
                          </div>
                        ) : null
                      )
                    ) : (
                      !sessionPromptError ? (
                        <div className="bh-prompt-search-empty">
                          {t("activity.noSessionPrompts")}
                        </div>
                      ) : null
                    )}
                  </div>
                </>
              ) : (
                <div className="bh-prompt-search-empty">
                  {t("activity.selectSession")}
                </div>
              )}
            </section>

            <PromptChangeDetail activity={selectedSessionPrompt} onSharePrompt={onSharePrompt} />
          </>
        ) : (
          <>
            <PromptChangeDetail activity={selectedPrompt} onSharePrompt={onSharePrompt} />
          </>
        )}
      </div>
    </div>
  );
}
