import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CalendarDays,
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
import { fetchPublicProjectDetail, fetchPublicProjects } from "../../api/projects";
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
} from "../../workspace/types";

const PAGE_SIZE = 24;

export function PublicProjectsPage({
  onSelectProject,
  onUnauthorized,
  selectedProjectId,
}: {
  onSelectProject: (projectId: string | null, mode?: "push" | "replace") => void;
  onUnauthorized: () => void;
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
        .then((response) => {
          setPage(response);
          if (!selectedProjectId && response.items.length > 0) {
            onSelectProject(response.items[0].id, "replace");
          }
        })
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

  return (
    <div className="public-projects-page">
      <header className="page-header public-projects-header">
        <div>
          <span className="public-projects-kicker"><Compass size={14} /> {t("explore.kicker")}</span>
          <h1>{t("explore.title")}</h1>
          <p>{t("explore.description")}</p>
        </div>
        <span className="status-pill"><Globe2 size={13} /> {formatCompactNumber(page.total)} {t("explore.publicProjects")}</span>
      </header>

      <div className="public-project-controls">
        <label>
          <Search aria-hidden="true" size={16} />
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
        <div role="group" aria-label={t("explore.sort")}>
          <button aria-pressed={sort === "recent"} data-active={sort === "recent"} onClick={() => { setOffset(0); setSort("recent"); }} type="button">{t("explore.recent")}</button>
          <button aria-pressed={sort === "newest"} data-active={sort === "newest"} onClick={() => { setOffset(0); setSort("newest"); }} type="button">{t("explore.newest")}</button>
        </div>
      </div>

      <div className="public-project-layout">
        <section className="public-project-list" aria-busy={isLoading || undefined}>
          <div className="public-project-list-heading">
            <strong>{t("explore.publicProjects")}</strong>
            <span>{firstVisible}–{lastVisible} / {page.total}</span>
          </div>
          {isLoading && page.items.length === 0 ? <PublicProjectListSkeleton /> : null}
          {listError ? <PublicProjectError message={listError} /> : null}
          {!isLoading && !listError && page.items.length === 0 ? (
            <div className="public-project-empty"><Compass size={24} /><h2>{t("explore.noProjects")}</h2><p>{t("explore.noProjectsDescription")}</p></div>
          ) : null}
          {page.items.map((project) => (
            <PublicProjectCard
              active={project.id === selectedProjectId}
              key={project.id}
              onSelect={selectProject}
              project={project}
            />
          ))}
          {page.total > PAGE_SIZE ? (
            <div className="public-project-pagination">
              <button disabled={offset === 0 || isLoading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} type="button"><ArrowLeft size={14} /> {t("explore.previous")}</button>
              <button disabled={offset + PAGE_SIZE >= page.total || isLoading} onClick={() => setOffset(offset + PAGE_SIZE)} type="button">{t("explore.next")} <ArrowRight size={14} /></button>
            </div>
          ) : null}
        </section>

        <aside className="public-project-detail" aria-live="polite">
          {isDetailLoading ? <PublicProjectDetailSkeleton /> : detailError ? <PublicProjectError message={detailError} /> : detail ? (
            <PublicProjectDetail
              copied={copiedProjectId === detail.project.id}
              copyError={copyError}
              detail={detail}
              onShare={() => void shareProject()}
            />
          ) : (
            <div className="public-project-detail-empty"><Globe2 size={28} /><p>{t("explore.selectProject")}</p></div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PublicProjectCard({ active, onSelect, project }: { active: boolean; onSelect: (id: string) => void; project: PublicProjectSummary }) {
  const { t } = useI18n();
  return (
    <button aria-pressed={active} className="public-project-card" data-active={active} onClick={() => onSelect(project.id)} type="button">
      <span className="public-project-card-top"><span><Globe2 size={12} /> {t("explore.public")}</span>{project.is_owner ? <em>{t("explore.yourProject")}</em> : null}</span>
      <strong>{project.name}</strong>
      <p>{project.description || project.slug}</p>
      <span className="public-project-owner"><span className="sidebar-avatar">{project.owner.avatar_url ? <img alt="" src={project.owner.avatar_url} /> : project.owner.username[0]?.toUpperCase()}</span><span><small>{t("explore.owner")}</small><b>{project.owner.username}</b></span></span>
      <span className="public-project-card-metrics"><span><MessageSquareText size={12} /> {formatCompactNumber(project.prompts)}</span><span><BrainCircuit size={12} /> {formatCompactNumber(project.memory_count)}</span><span><Activity size={12} /> {project.latest_event_at ? formatRelativeTimestamp(project.latest_event_at) : "—"}</span></span>
      {project.tags.length > 0 ? <span className="public-project-tags">{project.tags.slice(0, 4).map((tag) => <i key={tag}>{tag}</i>)}</span> : null}
    </button>
  );
}

function PublicProjectDetail({ copied, copyError, detail, onShare }: { copied: boolean; copyError: string | null; detail: PublicProjectDetailResponse; onShare: () => void }) {
  const { t } = useI18n();
  const project = detail.project;
  const projectUrl = safeExternalHttpUrl(project.project_url);
  const repositoryUrl = safeExternalHttpUrl(project.repository_url);
  const memory = detail.memory?.recent_artifacts ?? [];
  const projectTags = project.tags ?? [];
  return (
    <div className="public-project-detail-content">
      <div className="public-project-detail-hero">
        <span className="public-project-detail-badge"><Globe2 size={13} /> {t("explore.readOnly")}</span>
        <h2>{project.name}</h2>
        <p>{project.description || t("project.notProvided")}</p>
        <div className="public-project-detail-actions">
          <button onClick={onShare} type="button">{copied ? <Copy size={14} /> : <Globe2 size={14} />}{copied ? t("explore.linkCopied") : t("explore.share")}</button>
          {detail.is_owner ? <a href={projectDetailUrl(project.slug ?? project.id)}>{t("project.overview")} <ArrowRight size={14} /></a> : null}
          {copyError ? <span className="public-project-copy-error" role="alert">{copyError}</span> : null}
        </div>
      </div>

      <div className="public-project-detail-owner"><span className="sidebar-avatar">{detail.owner.avatar_url ? <img alt="" src={detail.owner.avatar_url} /> : detail.owner.username[0]?.toUpperCase()}</span><span><small>{t("explore.owner")}</small><strong>{detail.owner.username}</strong></span></div>

      <dl className="public-project-stats">
        <div><dt><MessageSquareText size={13} /> {t("project.prompts")}</dt><dd>{formatCompactNumber(detail.metrics.total_prompts ?? 0)}</dd></div>
        <div><dt><Activity size={13} /> {t("explore.events")}</dt><dd>{formatCompactNumber(detail.metrics.total_events)}</dd></div>
        <div><dt><BrainCircuit size={13} /> {t("explore.generatedMemory")}</dt><dd>{formatCompactNumber(detail.memory?.total_artifacts ?? 0)}</dd></div>
        <div><dt><FolderTree size={13} /> {t("project.fileUnit")}</dt><dd>{formatCompactNumber(detail.metrics.tracked_files)}</dd></div>
      </dl>

      <div className="public-project-facts">
        <span><CalendarDays size={13} /><small>{t("project.lastActivity")}</small><strong>{formatOptionalTimestamp(detail.metrics.latest_activity_at, t("common.noActivity"))}</strong></span>
        <span><GitBranch size={13} /><small>{t("project.repository")}</small><strong>{project.default_branch}</strong></span>
        {repositoryUrl ? <a href={repositoryUrl} rel="noreferrer" target="_blank"><ExternalLink size={13} /> GitHub</a> : null}
        {projectUrl ? <a href={projectUrl} rel="noreferrer" target="_blank"><ExternalLink size={13} /> Project</a> : null}
      </div>

      {projectTags.length > 0 ? <div className="public-project-detail-tags">{projectTags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}

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
