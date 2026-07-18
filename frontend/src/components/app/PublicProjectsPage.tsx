import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Clock,
  Compass,
  ExternalLink,
  Eye,
  Globe2,
  LoaderCircle,
  Search,
  Share2,
  TrendingUp,
  UserRound,
} from "lucide-react";
import {
  fetchPublicProfile,
  fetchPublicProjectDetail,
  fetchPublicProjects,
  recordPublicProjectView,
  updatePublicProjectSave,
} from "../../api/projects";
import {
  fetchPublishedFlowDetailsForProject,
} from "../../api/publishedFlows";
import { UnauthorizedError } from "../../api/client";
import { useI18n } from "../../i18n/I18nProvider";
import { copyTextToClipboard } from "../../lib/clipboard";
import { safeExternalHttpUrl } from "../../lib/urls";
import {
  formatCompactNumber,
  formatOptionalTimestamp,
  formatRelativeTimestamp,
} from "../../lib/formatters";
import { projectDetailDataFromApi } from "../../workspace/projectDetailMappers";
import { navigateToWorkspaceUrl } from "../../workspace/navigation";
import { projectDetailUrl, publicProjectUrl } from "../../workspace/projectUrls";
import type {
  PublicProjectDetailResponse,
  PublicProjectPage,
  PublicProjectSummary,
  PublicProfileResponse,
  PublishedFlowDetailResponse,
} from "../../workspace/types";
import {
  AiModelBadge,
  ProjectTabs,
  type ProjectDetailTab,
  type ProjectDetailTabId,
  type PromptActivityItem,
} from "../project-detail";
import { ActivityPanel } from "../project-detail/ActivityPanel";
import { FilesPanel } from "../project-detail/FilesPanel";
import { MemoryPanel } from "../project-detail/MemoryPanel";
import { OverviewPanel } from "../project-detail/OverviewPanel";

const PAGE_SIZE = 24;
const PROFILE_PAGE_SIZE = 24;

export function PublicProjectsPage({
  embedded = false,
  onSelectProject,
  onSelectProfile,
  onUnauthorized,
  selectedProfileId,
  selectedProjectId,
}: {
  embedded?: boolean;
  onSelectProject: (projectId: string | null, mode?: "push" | "replace") => void;
  onSelectProfile: (profileId: string | null, mode?: "push" | "replace") => void;
  onUnauthorized: () => void;
  selectedProfileId: string | null;
  selectedProjectId: string | null;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState<PublicProjectPage>({
    items: [],
    limit: PAGE_SIZE,
    offset: 0,
    total: 0,
  });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "popular" | "recent">("popular");
  const [savedOnly, setSavedOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PublicProjectDetailResponse | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [profilePage, setProfilePage] = useState<PublicProfileResponse | null>(null);
  const [profileOffset, setProfileOffset] = useState(0);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileReloadKey, setProfileReloadKey] = useState(0);
  const [profileReturnProjectId, setProfileReturnProjectId] = useState<string | null>(null);
  const [isSaveUpdating, setIsSaveUpdating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [projectFlowDetails, setProjectFlowDetails] = useState<PublishedFlowDetailResponse[]>([]);
  const [isProjectFlowsLoading, setIsProjectFlowsLoading] = useState(false);
  const [projectFlowsError, setProjectFlowsError] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedProjectId) return undefined;
    const timer = window.setTimeout(() => setCopiedProjectId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedProjectId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setListError(null);
      void fetchPublicProjects({
        limit: PAGE_SIZE,
        offset,
        query,
        savedOnly,
        signal: controller.signal,
        sort,
      })
        .then(setPage)
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (error instanceof UnauthorizedError) {
            onUnauthorized();
            return;
          }
          setListError(error instanceof Error ? error.message : t("explore.loadFailed"));
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [offset, query, savedOnly, sort]);

  useEffect(() => {
    if (!selectedProjectId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    const controller = new AbortController();
    setIsDetailLoading(true);
    setDetailError(null);
    void fetchPublicProjectDetail(selectedProjectId, controller.signal)
      .then((projectDetail) => {
        setDetail(projectDetail);
        void recordPublicProjectView(selectedProjectId)
          .then((analytics) => {
            if (controller.signal.aborted) return;
            setDetail((current) => current?.project.id === selectedProjectId
              ? {
                  ...current,
                  unique_viewers: analytics.unique_viewers,
                  view_count: analytics.view_count,
                  view_history: analytics.view_history,
                  views_7d: analytics.views_7d,
                }
              : current);
            setPage((current) => ({
              ...current,
              items: current.items.map((project) => project.id === selectedProjectId
                ? { ...project, view_count: analytics.view_count }
                : project),
            }));
          })
          .catch(() => undefined);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        setDetail(null);
        setDetailError(error instanceof Error ? error.message : t("explore.detailFailed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsDetailLoading(false);
      });
    return () => controller.abort();
  }, [selectedProjectId]);

  useEffect(() => {
    setProjectFlowDetails([]);
    setProjectFlowsError(null);
    if (!selectedProjectId) return undefined;
    const controller = new AbortController();
    setIsProjectFlowsLoading(true);
    void fetchPublishedFlowDetailsForProject(selectedProjectId, controller.signal)
      .then(setProjectFlowDetails)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        setProjectFlowsError(
          error instanceof Error ? error.message : t("community.flowsLoadFailed"),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsProjectFlowsLoading(false);
      });
    return () => controller.abort();
  }, [selectedProjectId]);

  useEffect(() => {
    setProfileOffset(0);
    setProfilePage(null);
    setProfileError(null);
  }, [selectedProfileId]);

  useEffect(() => {
    if (!selectedProfileId) {
      setProfilePage(null);
      setProfileError(null);
      return;
    }
    const controller = new AbortController();
    setIsProfileLoading(true);
    setProfileError(null);
    void fetchPublicProfile(selectedProfileId, {
      limit: PROFILE_PAGE_SIZE,
      offset: profileOffset,
      signal: controller.signal,
    })
      .then(setProfilePage)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        setProfilePage(null);
        setProfileError(
          error instanceof Error ? error.message : t("community.profileLoadFailed"),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsProfileLoading(false);
      });
    return () => controller.abort();
  }, [profileOffset, profileReloadKey, selectedProfileId]);

  const selectProject = (projectId: string) => {
    setCopiedProjectId(null);
    setCopyError(null);
    onSelectProject(projectId);
  };
  const shareProject = async () => {
    if (!selectedProjectId) return;
    setCopyError(null);
    try {
      await copyTextToClipboard(publicProjectUrl(selectedProjectId));
      setCopiedProjectId(selectedProjectId);
    } catch {
      setCopyError(t("explore.copyFailed"));
    }
  };
  const toggleProjectSave = async () => {
    if (!detail || isSaveUpdating) return;
    const nextSaved = !detail.is_saved;
    setIsSaveUpdating(true);
    setSaveError(null);
    try {
      const response = await updatePublicProjectSave(detail.project.id, nextSaved);
      setDetail((current) => current ? { ...current, is_saved: response.is_saved } : current);
      setPage((current) => ({
        ...current,
        items: current.items.map((project) => project.id === response.project_id
          ? { ...project, is_saved: response.is_saved }
          : project),
      }));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setSaveError(error instanceof Error ? error.message : t("community.saveFailed"));
    } finally {
      setIsSaveUpdating(false);
    }
  };
  const firstVisible = page.total === 0 ? 0 : page.offset + 1;
  const lastVisible = Math.min(page.offset + page.items.length, page.total);
  const pageHeader = !embedded ? (
    <header className="page-header public-projects-header">
      <div>
        <span className="public-projects-kicker"><Compass size={14} /> {t("explore.kicker")}</span>
        <h1>{t("explore.title")}</h1>
        <p>{t("explore.description")}</p>
      </div>
      <span className="status-pill"><Globe2 size={13} /> {formatCompactNumber(page.total)} {t("explore.publicProjects")}</span>
    </header>
  ) : null;

  if (selectedProfileId) {
    return (
      <div className="public-projects-page" data-embedded={embedded || undefined}>
        {pageHeader}
        <PublicProfileDetail
          errorMessage={profileError}
          isLoading={isProfileLoading}
          onBack={() => {
            if (profileReturnProjectId) {
              const projectId = profileReturnProjectId;
              setProfileReturnProjectId(null);
              onSelectProject(projectId);
              return;
            }
            onSelectProfile(null);
          }}
          onNext={() => setProfileOffset(profileOffset + PROFILE_PAGE_SIZE)}
          onPrevious={() => setProfileOffset(Math.max(0, profileOffset - PROFILE_PAGE_SIZE))}
          onRetry={() => setProfileReloadKey((value) => value + 1)}
          onSelectProject={selectProject}
          page={profilePage}
        />
      </div>
    );
  }

  if (selectedProjectId) {
    return (
      <div className="public-projects-page" data-embedded={embedded || undefined}>
        {pageHeader}
        <section className="public-project-standalone-detail" aria-live="polite">
          <div className="public-project-detail">
            {isDetailLoading ? (
              <><button aria-label={t("community.backToProjects")} className="public-project-back public-project-back-fallback" onClick={() => onSelectProject(null)} type="button"><ArrowLeft aria-hidden="true" size={16} /></button><PublicProjectDetailSkeleton /></>
            ) : detailError ? (
              <><button aria-label={t("community.backToProjects")} className="public-project-back public-project-back-fallback" onClick={() => onSelectProject(null)} type="button"><ArrowLeft aria-hidden="true" size={16} /></button><PublicProjectError message={detailError} /></>
            ) : detail ? (
              <PublicProjectDetail
                copied={copiedProjectId === detail.project.id}
                copyError={copyError}
                detail={detail}
                flowDetails={projectFlowDetails}
                flowsError={projectFlowsError}
                isFlowsLoading={isProjectFlowsLoading}
                isSaveUpdating={isSaveUpdating}
                key={detail.project.id}
                onBack={() => onSelectProject(null)}
                onOpenProfile={() => {
                  setProfileReturnProjectId(detail.project.id);
                  onSelectProfile(detail.owner.id);
                }}
                onShare={() => void shareProject()}
                onToggleSave={() => void toggleProjectSave()}
                saveError={saveError}
              />
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="public-projects-page" data-embedded={embedded || undefined}>
      {pageHeader}

      <div className="public-project-list-panel">
        <div className="project-controls public-project-controls">
          <label className="project-search-control">
            <Search aria-hidden="true" size={16} strokeWidth={1.5} />
            <input
              aria-label={t("explore.search")}
              onChange={(event) => {
                setOffset(0);
                setQuery(event.target.value);
              }}
              placeholder={t("explore.search")}
              type="search"
              value={query}
            />
          </label>
          <div className="public-project-control-actions">
            <button
              aria-pressed={savedOnly}
              className="public-project-saved-filter"
              data-active={savedOnly || undefined}
              onClick={() => { setOffset(0); setSavedOnly((value) => !value); }}
              type="button"
            >
              <Bookmark aria-hidden="true" fill={savedOnly ? "currentColor" : "none"} size={14} />
              {t("community.savedProjects")}
            </button>
            <div className="project-sort-control" role="group" aria-label={t("explore.sort")}>
              <button aria-pressed={sort === "popular"} data-active={sort === "popular"} onClick={() => { setOffset(0); setSort("popular"); }} type="button">{t("explore.popularWeek")}</button>
              <button aria-pressed={sort === "recent"} data-active={sort === "recent"} onClick={() => { setOffset(0); setSort("recent"); }} type="button">{t("explore.recent")}</button>
              <button aria-pressed={sort === "newest"} data-active={sort === "newest"} onClick={() => { setOffset(0); setSort("newest"); }} type="button">{t("explore.newest")}</button>
            </div>
          </div>
        </div>

        <section className="public-project-directory" aria-busy={isLoading || undefined}>
          <div className="public-project-list-heading">
            <strong>{t("explore.publicProjects")}</strong>
            <span>{firstVisible}–{lastVisible} / {page.total}</span>
          </div>
          {isLoading && page.items.length === 0 ? <PublicProjectListSkeleton /> : null}
          {listError ? <PublicProjectError message={listError} /> : null}
          {!isLoading && !listError && page.items.length === 0 ? (
            <div className="public-project-empty"><Compass size={24} /><h2>{savedOnly ? t("community.noSavedProjects") : t("explore.noProjects")}</h2><p>{savedOnly ? t("community.noSavedProjectsDescription") : t("explore.noProjectsDescription")}</p></div>
          ) : null}
          {page.items.length > 0 ? (
            <div className="public-project-directory-list">
              {page.items.map((project, index) => (
                <PublicProjectRow
                  key={project.id}
                  onSelect={selectProject}
                  project={project}
                  weeklyRank={sort === "popular" ? offset + index + 1 : undefined}
                />
              ))}
            </div>
          ) : null}
          {page.total > PAGE_SIZE ? (
            <div className="public-project-pagination">
              <button disabled={offset === 0 || isLoading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} type="button"><ArrowLeft size={14} /> {t("explore.previous")}</button>
              <button disabled={offset + PAGE_SIZE >= page.total || isLoading} onClick={() => setOffset(offset + PAGE_SIZE)} type="button">{t("explore.next")} <ArrowRight size={14} /></button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function compactPublicUrl(value: string | null) {
  const safeUrl = safeExternalHttpUrl(value);
  if (!safeUrl) return null;
  const parsed = new URL(safeUrl);
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${parsed.hostname}${path}`;
}

function projectMonogram(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "P";
}

function PublicProjectRow({ onSelect, project, weeklyRank }: { onSelect: (id: string) => void; project: PublicProjectSummary; weeklyRank?: number }) {
  const { t } = useI18n();
  const homepageUrl = safeExternalHttpUrl(project.project_url);
  const homepage = compactPublicUrl(project.project_url);
  const tags = project.tags.slice(0, 3);
  const models = project.connected_models.slice(0, 2);
  const activity = project.latest_event_at
    ? formatRelativeTimestamp(project.latest_event_at)
    : t("common.noActivity");

  return (
    <article aria-label={project.name} className="public-project-card">
      <button
        aria-label={`${t("community.openProject")}: ${project.name}`}
        className="public-project-card-main"
        onClick={() => onSelect(project.id)}
        type="button"
      >
        <span aria-hidden="true" className="public-project-card-monogram">
          {projectMonogram(project.name)}
        </span>
        <span className="public-project-card-summary">
          <span className="public-project-card-title">
            <strong>{project.name}</strong>
            {project.is_saved ? <Bookmark aria-label={t("community.savedProject")} fill="currentColor" size={12} /> : null}
          </span>
          <span>{project.description || project.slug}</span>
        </span>
        <span className="public-project-card-byline">
          {weeklyRank ? (
            <span className="public-project-weekly-rank" title={t("explore.popularityScore")}>
              <TrendingUp aria-hidden="true" size={12} />
              <b>#{weeklyRank}</b>
              <small>{formatCompactNumber(project.weekly_popularity_score ?? 0)}</small>
            </span>
          ) : null}
          <span
            aria-label={`${t("explore.owner")}: ${project.owner.username}`}
            className="public-project-card-owner"
          >
            <span className="sidebar-avatar">
              {project.owner.avatar_url ? <img alt="" src={project.owner.avatar_url} /> : project.owner.username[0]?.toUpperCase()}
            </span>
            <b>{project.owner.username}</b>
          </span>
          <span aria-hidden="true" className="public-project-card-divider">·</span>
          <span
            aria-label={`${t("project.lastActivity")}: ${activity}`}
            className="public-project-card-activity"
          >
            <Activity aria-hidden="true" size={12} />
            <b>{activity}</b>
          </span>
          <span aria-hidden="true" className="public-project-card-divider">·</span>
          <span
            aria-label={`${t("community.projectViews")}: ${project.view_count ?? 0}`}
            className="public-project-card-views"
          >
            <Eye aria-hidden="true" size={12} />
            <b>{formatCompactNumber(project.view_count ?? 0)}</b>
          </span>
        </span>
        <ArrowRight aria-hidden="true" className="public-project-card-arrow" size={17} />
      </button>
      <footer className="public-project-card-footer">
        <span className="public-project-card-context">
          <span aria-label={t("common.tags")} className="public-project-card-tags">
            {tags.length > 0 ? tags.map((tag) => <i key={tag}>{tag}</i>) : <i>—</i>}
            {project.tags.length > tags.length ? <i>+{project.tags.length - tags.length}</i> : null}
          </span>
          <span
            aria-label={`${t("community.usedAi")}: ${models.join(", ") || t("project.modelNotCaptured")}`}
            className="public-project-card-ai"
          >
            {models.length > 0 ? models.map((model) => (
              <AiModelBadge className="is-compact" key={model} model={model} />
            )) : <span>{t("project.modelNotCaptured")}</span>}
            {project.connected_models.length > models.length ? <i>+{project.connected_models.length - models.length}</i> : null}
          </span>
        </span>
        {homepageUrl && homepage ? (
          <a
            aria-label={`${t("project.projectUrl")}: ${homepage}`}
            className="public-project-card-homepage"
            href={homepageUrl}
            rel="noreferrer"
            target="_blank"
            title={homepage}
          >
            <span>{homepage}</span><ExternalLink aria-hidden="true" size={12} />
          </a>
        ) : (
          <span className="public-project-card-homepage" data-empty="true">
            <Globe2 aria-hidden="true" size={12} /> {t("community.noHomepage")}
          </span>
        )}
      </footer>
    </article>
  );
}

function PublicProjectDetail({
  copied,
  copyError,
  detail,
  flowDetails,
  flowsError,
  isFlowsLoading,
  isSaveUpdating,
  onBack,
  onOpenProfile,
  onShare,
  onToggleSave,
  saveError,
}: {
  copied: boolean;
  copyError: string | null;
  detail: PublicProjectDetailResponse;
  flowDetails: PublishedFlowDetailResponse[];
  flowsError: string | null;
  isFlowsLoading: boolean;
  isSaveUpdating: boolean;
  onBack: () => void;
  onOpenProfile: () => void;
  onShare: () => void;
  onToggleSave: () => void;
  saveError: string | null;
}) {
  const { t } = useI18n();
  const project = detail.project;
  const repositoryUrl = safeExternalHttpUrl(project.repository_url);
  const connectedModels = detail.metrics.connected_models ?? [];
  const visibleModels = connectedModels.slice(0, 2);
  const relativeActivity = formatRelativeTimestamp(detail.metrics.latest_activity_at);
  const [activeTab, setActiveTab] = useState<ProjectDetailTabId>("overview");
  const viewCount = detail.view_count ?? 0;
  const viewsLast7Days = detail.views_7d ?? 0;
  const uniqueViewers = detail.unique_viewers ?? 0;
  const viewHistory = detail.view_history ?? [];
  const maxViewHistory = Math.max(...viewHistory.map((item) => item.views), 1);
  const mappedData = projectDetailDataFromApi(detail, null);
  const publishedPromptActivities: PromptActivityItem[] = flowDetails.flatMap((flow) =>
    flow.items.map((item) => ({
      fileChanges: flow.files.map((file) => ({
        additions: file.additions,
        deletions: file.deletions,
        oldPath: null,
        patch: null,
        patchOmittedReason: "public_redacted",
        path: file.file_path,
        status: file.change_type ?? "modified",
      })),
      filesChanged: flow.files.length,
      id: item.id,
      model: item.model_name ?? flow.model_name ?? item.tool_name ?? t("project.modelNotCaptured"),
      prompt: item.prompt_text,
      response: item.response_text,
      responseReceivedAt: item.response_received_at
        ? formatOptionalTimestamp(item.response_received_at, "")
        : null,
      responseSource: "published-flow",
      sequence: item.sequence,
      sessionId: flow.id,
      submittedAt: formatOptionalTimestamp(item.submitted_at, t("project.notProvided")),
    })),
  );
  const data = {
    ...mappedData,
    activities: flowDetails.map((flow) => ({
      events: flow.items.length,
      filesChanged: flow.files.length,
      id: flow.id,
      label: flow.title,
      lastActivity: formatOptionalTimestamp(flow.published_at ?? flow.updated_at, t("project.notProvided")),
      model: flow.model_name ?? flow.tool_name ?? t("project.modelNotCaptured"),
      prompts: flow.items.length,
      responses: flow.items.filter((item) => Boolean(item.response_text)).length,
      startedAt: formatOptionalTimestamp(flow.created_at, t("project.notProvided")),
    })),
    promptActivities: publishedPromptActivities,
    project: {
      ...mappedData.project,
      isBookmarked: detail.is_saved,
    },
  };
  const tabs: ProjectDetailTab[] = [
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

  let panel = <OverviewPanel data={data} hidePublicListingLink />;
  if (activeTab === "memory") {
    panel = <MemoryPanel data={data} />;
  } else if (activeTab === "ai-activity") {
    panel = (
      <ActivityPanel
        data={data}
        notice={t("community.curatedPromptNotice")}
        providedDataError={flowsError}
        providedDataLoading={isFlowsLoading}
        useProvidedData
      />
    );
  } else if (activeTab === "files") {
    panel = <FilesPanel data={data} />;
  }

  return (
    <section
      aria-labelledby="project-detail-title"
      className="bh-project-detail public-project-detail-content"
      data-active-tab={activeTab}
    >
      <header aria-labelledby="project-detail-title" className="bh-project-header">
        <div className="bh-project-header-copy">
          <div className="bh-project-title-row">
            <button
              aria-label={t("community.backToProjects")}
              className="bh-icon-button public-project-title-back"
              onClick={onBack}
              title={t("community.backToProjects")}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={17} strokeWidth={1.5} />
            </button>
            <h1 id="project-detail-title" title={project.name}>{project.name}</h1>
          </div>
          <div aria-label={t("project.activity")} className="bh-project-header-meta">
            <span className="bh-project-header-chip"><Globe2 aria-hidden="true" size={14} strokeWidth={1.5} /> {t("explore.readOnly")}</span>
            {visibleModels.map((model) => <AiModelBadge className="is-header" key={model} model={model} />)}
            {connectedModels.length > visibleModels.length ? <span className="bh-project-header-chip">+{connectedModels.length - visibleModels.length}</span> : null}
            <span className="bh-project-header-chip"><Clock aria-hidden="true" size={14} strokeWidth={1.5} /><span>{relativeActivity ?? t("common.noActivity")}</span></span>
            <span className="bh-project-header-chip"><Eye aria-hidden="true" size={14} strokeWidth={1.5} /><span>{t("community.viewsCount", { count: formatCompactNumber(viewCount) })}</span></span>
          </div>
        </div>
        <div className="bh-project-header-actions">
          <button
            aria-label={t("community.viewProfile", { username: detail.owner.username })}
            className="bh-header-action-button public-project-header-profile"
            onClick={onOpenProfile}
            type="button"
          >
            <span className="sidebar-avatar">{detail.owner.avatar_url ? <img alt="" src={detail.owner.avatar_url} /> : detail.owner.username[0]?.toUpperCase()}</span>
            <span>{detail.owner.username}</span>
            <ArrowRight aria-hidden="true" size={14} strokeWidth={1.5} />
          </button>
          {!detail.is_owner ? (
            <button
              aria-label={detail.is_saved ? t("project.removeSaved") : t("project.saveProject")}
              aria-pressed={detail.is_saved}
              className="bh-icon-button"
              data-active={detail.is_saved || undefined}
              disabled={isSaveUpdating}
              onClick={onToggleSave}
              title={detail.is_saved ? t("project.removeSaved") : t("project.saveProject")}
              type="button"
            >
              {isSaveUpdating ? <LoaderCircle aria-hidden="true" className="is-spinning" size={17} /> : <Bookmark aria-hidden="true" fill={detail.is_saved ? "currentColor" : "none"} size={17} strokeWidth={1.5} />}
            </button>
          ) : null}
          <button
            aria-label={copied ? t("project.workspaceLinkCopied") : t("project.copyWorkspaceLink")}
            className="bh-icon-button"
            data-active={copied || undefined}
            onClick={onShare}
            title={copied ? t("project.workspaceLinkCopied") : t("project.copyWorkspaceLink")}
            type="button"
          >
            {copied ? <Check aria-hidden="true" size={17} strokeWidth={1.5} /> : <Share2 aria-hidden="true" size={17} strokeWidth={1.5} />}
          </button>
          {detail.is_owner ? <a className="bh-header-action-button" href={projectDetailUrl(project.slug ?? project.id)} onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (navigateToWorkspaceUrl(event.currentTarget.href)) event.preventDefault();
          }}>{t("project.overview")} <ArrowRight aria-hidden="true" size={14} /></a> : null}
          {repositoryUrl ? <a aria-label={t("project.openRepository")} className="bh-icon-button" href={repositoryUrl} rel="noreferrer" target="_blank" title={t("project.openRepository")}><ExternalLink aria-hidden="true" size={17} strokeWidth={1.5} /></a> : null}
        </div>
      </header>
      {copyError || saveError ? <span className="public-project-copy-error" role="alert">{copyError ?? saveError}</span> : null}

      <dl className="public-project-view-metrics" aria-label={t("community.viewAnalytics")}>
        <div>
          <Eye aria-hidden="true" size={16} strokeWidth={1.5} />
          <dt>{t("community.totalViews")}</dt>
          <dd>{formatCompactNumber(viewCount)}</dd>
        </div>
        <div>
          <TrendingUp aria-hidden="true" size={16} strokeWidth={1.5} />
          <dt>{t("community.viewsLast7Days")}</dt>
          <dd>{formatCompactNumber(viewsLast7Days)}</dd>
        </div>
        <div>
          <UserRound aria-hidden="true" size={16} strokeWidth={1.5} />
          <dt>{t("community.uniqueViewers")}</dt>
          <dd>{formatCompactNumber(uniqueViewers)}</dd>
        </div>
        <div className="public-project-view-trend" aria-label={t("community.viewsLast14Days")}>
          {viewHistory.map((day) => {
            return (
              <i
                key={day.date}
                style={{ height: `${Math.max(12, (day.views / maxViewHistory) * 100)}%` }}
                title={`${day.date}: ${day.views}`}
              />
            );
          })}
        </div>
      </dl>

      <ProjectTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
      />

      <div
        aria-labelledby={`project-tab-${activeTab}`}
        className="bh-project-panel loading-cascade"
        id={`project-panel-${activeTab}`}
        role="tabpanel"
      >
        {panel}
      </div>
    </section>
  );
}

function PublicProfileDetail({
  errorMessage,
  isLoading,
  onBack,
  onNext,
  onPrevious,
  onRetry,
  onSelectProject,
  page,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  onBack: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
  onSelectProject: (projectId: string) => void;
  page: PublicProfileResponse | null;
}) {
  const { t } = useI18n();

  if ((isLoading || !page) && !errorMessage) {
    return (
      <section aria-label={t("community.profileLoading")} className="public-profile-page" role="status">
        <PublicProjectDetailSkeleton />
      </section>
    );
  }

  if (errorMessage || !page) {
    return (
      <section className="public-profile-page">
        <button className="public-profile-back" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={15} /> {t("community.backToProjects")}
        </button>
        <div className="public-profile-error" role="alert">
          <AlertCircle aria-hidden="true" size={22} />
          <strong>{t("community.profileLoadFailed")}</strong>
          <p>{errorMessage}</p>
          <button onClick={onRetry} type="button">{t("common.retry")}</button>
        </div>
      </section>
    );
  }

  const firstVisible = page.total === 0 ? 0 : page.offset + 1;
  const lastVisible = Math.min(page.offset + page.items.length, page.total);

  return (
    <section className="public-profile-page">
      <button className="public-profile-back" onClick={onBack} type="button">
        <ArrowLeft aria-hidden="true" size={15} /> {t("community.backToProjects")}
      </button>

      <header className="public-profile-hero">
        <span className="public-profile-avatar" aria-hidden="true">
          {page.profile.avatar_url ? (
            <img alt="" src={page.profile.avatar_url} />
          ) : (
            <UserRound size={28} strokeWidth={1.5} />
          )}
        </span>
        <div>
          <span className="public-profile-kicker">{t("community.publicProfile")}</span>
          <h2>{page.profile.username}</h2>
          <p>{t("community.publicProjectCount", { count: page.total })}</p>
        </div>
      </header>

      <div className="public-profile-section-heading">
        <strong>{t("community.profileProjects")}</strong>
        <span>{firstVisible}–{lastVisible} / {page.total}</span>
      </div>

      {page.items.length === 0 ? (
        <div className="public-profile-empty">
          <Globe2 aria-hidden="true" size={24} />
          <h3>{t("community.noPublicProjects")}</h3>
          <p>{t("community.noPublicProjectsDescription")}</p>
        </div>
      ) : (
        <div className="public-profile-projects">
          {page.items.map((project) => (
            <PublicProjectRow
              key={project.id}
              onSelect={onSelectProject}
              project={project}
            />
          ))}
        </div>
      )}

      {page.total > PROFILE_PAGE_SIZE ? (
        <div className="public-project-pagination public-profile-pagination">
          <button disabled={page.offset === 0 || isLoading} onClick={onPrevious} type="button"><ArrowLeft size={14} /> {t("explore.previous")}</button>
          <button disabled={page.offset + PROFILE_PAGE_SIZE >= page.total || isLoading} onClick={onNext} type="button">{t("explore.next")} <ArrowRight size={14} /></button>
        </div>
      ) : null}
    </section>
  );
}

function PublicProjectListSkeleton() {
  const { t } = useI18n();
  return <div className="public-project-skeleton-list" aria-label={t("explore.loadingList")}>{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>;
}

function PublicProjectDetailSkeleton() {
  const { t } = useI18n();
  return <div className="public-project-detail-skeleton" aria-label={t("explore.loadingDetail")}><LoaderCircle className="is-spinning" size={20} /><span /><span /><span /></div>;
}

function PublicProjectError({ message }: { message: string }) {
  return <div className="public-project-error" role="alert"><AlertCircle size={18} /><span>{message}</span></div>;
}
