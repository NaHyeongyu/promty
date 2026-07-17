import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  Check,
  Compass,
  Copy,
  ExternalLink,
  FolderTree,
  GitBranch,
  Globe2,
  LoaderCircle,
  MessageSquareText,
  Search,
  UserRound,
} from "lucide-react";
import {
  fetchPublicProfile,
  fetchPublicProjectDetail,
  fetchPublicProjects,
} from "../../api/projects";
import { UnauthorizedError } from "../../api/client";
import { useI18n } from "../../i18n/I18nProvider";
import { copyTextToClipboard } from "../../lib/clipboard";
import { safeExternalHttpUrl } from "../../lib/urls";
import {
  formatCompactNumber,
  formatOptionalTimestamp,
  formatRelativeTimestamp,
} from "../../lib/formatters";
import { projectDetailUrl, publicProjectUrl } from "../../workspace/projectUrls";
import type {
  PublicProjectDetailResponse,
  PublicProjectPage,
  PublicProjectSummary,
  PublicProfileResponse,
} from "../../workspace/types";
import { AiModelBadge } from "../project-detail";

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
  const [sort, setSort] = useState<"newest" | "recent">("recent");
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
  }, [offset, query, sort]);

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
      .then(setDetail)
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
          onBack={() => onSelectProfile(null)}
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
          <button
            className="public-project-back"
            onClick={() => onSelectProject(null)}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={15} /> {t("community.backToProjects")}
          </button>
          <div className="public-project-detail">
            {isDetailLoading ? (
              <PublicProjectDetailSkeleton />
            ) : detailError ? (
              <PublicProjectError message={detailError} />
            ) : detail ? (
              <PublicProjectDetail
                copied={copiedProjectId === detail.project.id}
                copyError={copyError}
                detail={detail}
                onOpenProfile={() => onSelectProfile(detail.owner.id)}
                onShare={() => void shareProject()}
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
          <div className="project-sort-control" role="group" aria-label={t("explore.sort")}>
            <button aria-pressed={sort === "recent"} data-active={sort === "recent"} onClick={() => { setOffset(0); setSort("recent"); }} type="button">{t("explore.recent")}</button>
            <button aria-pressed={sort === "newest"} data-active={sort === "newest"} onClick={() => { setOffset(0); setSort("newest"); }} type="button">{t("explore.newest")}</button>
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
            <div className="public-project-empty"><Compass size={24} /><h2>{t("explore.noProjects")}</h2><p>{t("explore.noProjectsDescription")}</p></div>
          ) : null}
          {page.items.length > 0 ? (
            <div className="public-project-directory-list">
              {page.items.map((project) => (
                <PublicProjectRow
                  key={project.id}
                  onSelect={selectProject}
                  project={project}
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

function PublicProjectRow({ onSelect, project }: { onSelect: (id: string) => void; project: PublicProjectSummary }) {
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
          <strong>{project.name}</strong>
          <span>{project.description || project.slug}</span>
        </span>
        <span className="public-project-card-byline">
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

function PublicProjectDetail({ copied, copyError, detail, onOpenProfile, onShare }: { copied: boolean; copyError: string | null; detail: PublicProjectDetailResponse; onOpenProfile: () => void; onShare: () => void }) {
  const { t } = useI18n();
  const project = detail.project;
  const projectUrl = safeExternalHttpUrl(project.project_url);
  const repositoryUrl = safeExternalHttpUrl(project.repository_url);
  const memory = detail.memory?.recent_artifacts ?? [];
  const projectTags = project.tags ?? [];
  const connectedModels = detail.metrics.connected_models ?? [];
  const visibleModels = connectedModels.slice(0, 3);
  const relativeActivity = formatRelativeTimestamp(detail.metrics.latest_activity_at);
  return (
    <div className="public-project-detail-content">
      <header className="public-project-detail-hero">
        <div className="public-project-detail-hero-copy">
          <div className="public-project-detail-title-row">
            <h2>{project.name}</h2>
          </div>
          <p>{project.description || t("project.notProvided")}</p>
          <div className="public-project-detail-meta">
            <span className="public-project-detail-badge"><Globe2 aria-hidden="true" size={13} /> {t("explore.readOnly")}</span>
            {visibleModels.map((model) => <AiModelBadge className="is-header" key={model} model={model} />)}
            {connectedModels.length > visibleModels.length ? <span className="public-project-detail-chip">+{connectedModels.length - visibleModels.length}</span> : null}
            <span className="public-project-detail-chip"><CalendarDays aria-hidden="true" size={13} /> {relativeActivity ?? t("common.noActivity")}</span>
            <button
              aria-label={t("community.viewProfile", { username: detail.owner.username })}
              className="public-project-detail-owner public-project-profile-trigger"
              onClick={onOpenProfile}
              type="button"
            >
              <span className="sidebar-avatar">{detail.owner.avatar_url ? <img alt="" src={detail.owner.avatar_url} /> : detail.owner.username[0]?.toUpperCase()}</span>
              <span><small>{t("explore.owner")}</small><strong>{detail.owner.username}</strong></span>
              <ArrowRight aria-hidden="true" size={13} />
            </button>
          </div>
        </div>
        <div className="public-project-detail-actions">
          <button onClick={onShare} type="button">{copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}{copied ? t("explore.linkCopied") : t("explore.share")}</button>
          {detail.is_owner ? <a href={projectDetailUrl(project.slug ?? project.id)}>{t("project.overview")} <ArrowRight aria-hidden="true" size={14} /></a> : null}
        </div>
      </header>
      {copyError ? <span className="public-project-copy-error" role="alert">{copyError}</span> : null}

      <dl className="public-project-stats">
        <div><dt><MessageSquareText size={13} /> {t("project.prompts")}</dt><dd>{formatCompactNumber(detail.metrics.total_prompts ?? 0)}</dd></div>
        <div><dt><Activity size={13} /> {t("explore.events")}</dt><dd>{formatCompactNumber(detail.metrics.total_events)}</dd></div>
        <div><dt><BrainCircuit size={13} /> {t("explore.generatedMemory")}</dt><dd>{formatCompactNumber(detail.memory?.total_artifacts ?? 0)}</dd></div>
        <div><dt><FolderTree size={13} /> {t("project.fileUnit")}</dt><dd>{formatCompactNumber(detail.metrics.tracked_files)}</dd></div>
      </dl>

      <section className="public-project-overview">
        <header><FolderTree aria-hidden="true" size={16} /><h3>{t("project.overview")}</h3></header>
        <dl className="public-project-facts">
          <div><dt><CalendarDays aria-hidden="true" size={13} /> {t("project.lastActivity")}</dt><dd>{formatOptionalTimestamp(detail.metrics.latest_activity_at, t("common.noActivity"))}</dd></div>
          <div><dt><GitBranch aria-hidden="true" size={13} /> {t("project.defaultBranch")}</dt><dd>{project.default_branch}</dd></div>
          <div><dt><BrainCircuit aria-hidden="true" size={13} /> {t("community.usedAi")}</dt><dd className="public-project-model-list">{connectedModels.length > 0 ? connectedModels.map((model) => <AiModelBadge className="is-compact" key={model} model={model} />) : t("project.modelNotCaptured")}</dd></div>
          <div><dt><FolderTree aria-hidden="true" size={13} /> {t("project.repository")}</dt><dd>{repositoryUrl ? <a href={repositoryUrl} rel="noreferrer" target="_blank"><span>{compactPublicUrl(project.repository_url)}</span><ExternalLink aria-hidden="true" size={12} /></a> : t("project.notProvided")}</dd></div>
          <div><dt><Globe2 aria-hidden="true" size={13} /> {t("project.projectUrl")}</dt><dd>{projectUrl ? <a href={projectUrl} rel="noreferrer" target="_blank"><span>{compactPublicUrl(project.project_url)}</span><ExternalLink aria-hidden="true" size={12} /></a> : t("project.notProvided")}</dd></div>
          <div><dt><Compass aria-hidden="true" size={13} /> {t("common.tags")}</dt><dd className="public-project-detail-tags">{projectTags.length > 0 ? projectTags.map((tag) => <span key={tag}>{tag}</span>) : t("project.notProvided")}</dd></div>
        </dl>
      </section>

      <section className="public-project-memory">
        <header><span><BrainCircuit size={15} /> <strong>{t("explore.generatedMemory")}</strong></span><small>{memory.length} / {detail.memory?.total_artifacts ?? 0}</small></header>
        {memory.length === 0 ? <div className="public-project-memory-empty">{t("explore.noMemory")}</div> : memory.map((artifact) => (
          <article key={artifact.id}>
            <div><strong>{artifact.title}</strong><small>{formatOptionalTimestamp(artifact.updated_at ?? artifact.created_at, "")}</small></div>
            {artifact.summary ? <p>{artifact.summary}</p> : null}
            <span>{artifact.model ? <i>{artifact.model}</i> : null}{artifact.tags.slice(0, 4).map((tag) => <i key={tag}>{tag}</i>)}</span>
          </article>
        ))}
      </section>
    </div>
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
