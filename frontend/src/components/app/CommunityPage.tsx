import { type ChangeEvent, useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  Copy,
  ImagePlus,
  Pencil,
  RefreshCw,
  Search,
  Share2,
  X,
} from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { copyTextToClipboard } from "../../lib/clipboard";
import type {
  PublishedFlowDetailResponse,
  PublishedFlowSummary,
} from "../../workspace/types";
import { MarkdownContent } from "../MarkdownContent";
import {
  AiModelBadge,
  type PromptFlowUpdatePayload,
  type PublishedFlowAsset,
} from "../project-detail";
import { EmptyState } from "./WorkspaceStates";

type CommunityFlowEditState = {
  contextSummary: string;
  includedFileIds: string[];
  includedItemIds: string[];
  notes: string;
  status: "archived" | "draft" | "published";
  summary: string;
  tags: string;
  title: string;
  visibility: "private" | "public" | "unlisted";
};

function editStateFor(flow: PublishedFlowDetailResponse): CommunityFlowEditState {
  return {
    contextSummary: flow.context_summary ?? "",
    includedFileIds: flow.files.filter((file) => file.is_included).map((file) => file.id),
    includedItemIds: flow.items.filter((item) => item.is_included).map((item) => item.id),
    notes: flow.notes ?? "",
    status: flow.status,
    summary: flow.summary ?? "",
    tags: flow.tags.join(", "),
    title: flow.title,
    visibility: flow.visibility,
  };
}

function nullableText(value: string) {
  return value.trim() || null;
}

function toggleId(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function CommunitySkeleton() {
  return (
    <section aria-label="Loading community" className="community-layout community-layout-skeleton" role="status">
      <div className="community-flow-list">
        {Array.from({ length: 5 }).map((_, index) => (
          <article className="community-flow-card community-flow-card-skeleton" key={index}>
            <span className="skeleton-line skeleton-line-sm" />
            <span className="skeleton-line skeleton-line-title" />
            <span className="skeleton-line skeleton-line-md" />
          </article>
        ))}
      </div>
      <aside className="community-flow-detail">
        <div className="community-flow-detail-skeleton">
          <span className="skeleton-line skeleton-line-section" />
          <span className="skeleton-line skeleton-line-description" />
        </div>
      </aside>
    </section>
  );
}

export function CommunityPage({
  errorMessage,
  flows,
  isDetailLoading,
  isLoading,
  isSaving,
  onArchiveFlow,
  onReload,
  onSearchChange,
  onSelectFlow,
  onUpdateFlow,
  onUploadAsset,
  searchQuery,
  selectedFlow,
}: {
  errorMessage?: string | null;
  flows: PublishedFlowSummary[];
  isDetailLoading: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onArchiveFlow: (flowKey: string) => Promise<PublishedFlowDetailResponse>;
  onReload: () => void;
  onSearchChange: (query: string) => void;
  onSelectFlow: (flowKey: string) => void;
  onUpdateFlow: (
    flowKey: string,
    payload: PromptFlowUpdatePayload,
  ) => Promise<PublishedFlowDetailResponse>;
  onUploadAsset?: (
    flowKey: string,
    file: File,
    altText?: string,
  ) => Promise<PublishedFlowAsset>;
  searchQuery: string;
  selectedFlow: PublishedFlowDetailResponse | null;
}) {
  const { t } = useI18n();
  const assetInputRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const [editState, setEditState] = useState<CommunityFlowEditState | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    setEditState(selectedFlow ? editStateFor(selectedFlow) : null);
    setIsEditing(false);
    setSaveError(null);
    setLinkCopied(false);
  }, [selectedFlow?.id]);

  const uploadAsset = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !selectedFlow || !onUploadAsset) return;
    setIsUploading(true);
    setSaveError(null);
    try {
      const asset = await onUploadAsset(selectedFlow.slug, file, file.name);
      setEditState((current) =>
        current ? { ...current, notes: `${current.notes}${current.notes ? "\n\n" : ""}${asset.markdown}` } : current,
      );
      window.requestAnimationFrame(() => notesRef.current?.focus());
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("community.uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  const save = async () => {
    if (!selectedFlow || !editState) return;
    if (!editState.title.trim()) {
      setSaveError(t("community.titleRequired"));
      return;
    }
    if (editState.status === "published" && editState.includedItemIds.length === 0) {
      setSaveError(t("community.promptRequired"));
      return;
    }
    const makesVisible =
      editState.status === "published" && editState.visibility !== "private";
    const wasVisible =
      selectedFlow.status === "published" && selectedFlow.visibility !== "private";
    if (makesVisible && !wasVisible && !window.confirm(t("community.publishConfirm"))) {
      return;
    }
    setSaveError(null);
    try {
      const updated = await onUpdateFlow(selectedFlow.slug, {
        context_summary: nullableText(editState.contextSummary),
        included_file_ids: editState.includedFileIds,
        included_item_ids: editState.includedItemIds,
        notes: nullableText(editState.notes),
        status: editState.status,
        summary: nullableText(editState.summary),
        tags: editState.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        title: editState.title.trim(),
        visibility: editState.visibility,
      });
      setEditState(editStateFor(updated));
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("community.updateFailed"));
    }
  };

  const archive = async () => {
    if (!selectedFlow || !window.confirm(t("community.archiveConfirm"))) return;
    try {
      await onArchiveFlow(selectedFlow.slug);
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("community.archiveFailed"));
    }
  };

  const copyLink = async () => {
    try {
      await copyTextToClipboard(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setSaveError(t("community.copyFailed"));
    }
  };

  if (isLoading && flows.length === 0) return <CommunitySkeleton />;

  return (
    <>
      <header className="page-header">
        <div>
          <span className="page-kicker">{t("community.kicker")}</span>
          <h1>{t("community.title")}</h1>
          <p>{t("community.description")}</p>
        </div>
        <label className="community-search">
          <Search aria-hidden="true" size={16} strokeWidth={1.5} />
          <span className="bh-visually-hidden">{t("community.search")}</span>
          <input
            maxLength={120}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("community.search")}
            value={searchQuery}
          />
        </label>
      </header>

      {errorMessage && flows.length === 0 ? (
        <EmptyState description={errorMessage} eyebrow={t("nav.community")} icon={Share2} title={t("community.loadFailed")}>
          <button className="empty-state-button" onClick={onReload} type="button">
            <RefreshCw aria-hidden="true" size={16} /><span>{t("common.retry")}</span>
          </button>
        </EmptyState>
      ) : flows.length === 0 ? (
        <EmptyState
          description={searchQuery ? t("community.noMatchDescription") : t("community.emptyDescription")}
          eyebrow={t("nav.community")}
          icon={Share2}
          title={searchQuery ? t("community.noMatch") : t("community.empty")}
        />
      ) : (
        <section aria-busy={isLoading || undefined} aria-label={t("community.title")} className="community-layout">
          <div className="community-flow-list">
            {flows.map((flow) => (
              <button
                className="community-flow-card"
                data-active={selectedFlow?.id === flow.id}
                key={flow.id}
                onClick={() => onSelectFlow(flow.slug)}
                type="button"
              >
                <span className="community-flow-card-kicker">
                  <AiModelBadge className="is-compact" model={flow.model_name ?? flow.tool_name ?? "AI"} />
                  <span className="community-flow-visibility">{flow.status} · {flow.visibility}</span>
                </span>
                <strong>{flow.title}</strong>
                {flow.summary ? <p>{flow.summary}</p> : null}
                <div className="community-flow-meta">
                  <span>{t("community.promptCount", { count: flow.prompt_count })}</span>
                  <span>{t("community.fileCount", { count: flow.file_count })}</span>
                  <span>{flow.author.username}</span>
                </div>
                {flow.tags.length ? <div className="community-flow-tags">{flow.tags.map((tag) => <span key={`${flow.id}-${tag}`}>{tag}</span>)}</div> : null}
              </button>
            ))}
          </div>

          <aside aria-busy={isDetailLoading || undefined} className="community-flow-detail">
            {isDetailLoading && !selectedFlow ? (
              <CommunitySkeleton />
            ) : selectedFlow ? (
              <>
                <div className="community-flow-detail-header">
                  <div className="community-flow-detail-titlebar">
                    <AiModelBadge className="is-compact" model={selectedFlow.model_name ?? selectedFlow.tool_name ?? "AI"} />
                    <div className="community-flow-owner-actions">
                      {selectedFlow.status === "published" && selectedFlow.visibility !== "private" ? (
                        <button className="toolbar-button" onClick={() => void copyLink()} type="button">
                          <Copy aria-hidden="true" size={15} /><span>{linkCopied ? t("common.copied") : t("community.copyLink")}</span>
                        </button>
                      ) : null}
                      {selectedFlow.is_owner ? (
                        <>
                          <button className="toolbar-button" disabled={isSaving} onClick={() => setIsEditing((value) => !value)} type="button">
                            {isEditing ? <X aria-hidden="true" size={15} /> : <Pencil aria-hidden="true" size={15} />}
                            <span>{isEditing ? t("common.cancel") : t("community.edit")}</span>
                          </button>
                          <button className="toolbar-button" disabled={isSaving || selectedFlow.status === "archived"} onClick={() => void archive()} type="button">
                            <Archive aria-hidden="true" size={15} /><span>{t("community.archive")}</span>
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <h2>{selectedFlow.title}</h2>
                  {selectedFlow.summary ? <p>{selectedFlow.summary}</p> : null}
                </div>

                <dl className="community-flow-stats">
                  <div><dt>{t("community.prompts")}</dt><dd>{selectedFlow.prompt_count}</dd></div>
                  <div><dt>{t("community.files")}</dt><dd>{selectedFlow.file_count}</dd></div>
                  <div><dt>{t("community.author")}</dt><dd>{selectedFlow.author.username}</dd></div>
                </dl>

                {isEditing && selectedFlow.is_owner && editState ? (
                  <section className="community-flow-editor">
                    <div className="community-security-note">{t("community.securityNote")}</div>
                    <label><span>{t("community.titleLabel")}</span><input maxLength={255} onChange={(event) => setEditState({ ...editState, title: event.target.value })} value={editState.title} /></label>
                    <label><span>{t("community.summary")}</span><textarea maxLength={2000} onChange={(event) => setEditState({ ...editState, summary: event.target.value })} rows={3} value={editState.summary} /></label>
                    <label><span>{t("community.context")}</span><textarea maxLength={4000} onChange={(event) => setEditState({ ...editState, contextSummary: event.target.value })} rows={3} value={editState.contextSummary} /></label>
                    <div className="community-flow-editor-field">
                      <div className="community-flow-editor-field-header"><span>{t("community.content")}</span>{onUploadAsset ? <><input accept="image/gif,image/jpeg,image/png,image/webp" className="bh-visually-hidden" onChange={(event) => void uploadAsset(event)} ref={assetInputRef} type="file" /><button className="toolbar-button" disabled={isUploading || isSaving} onClick={() => assetInputRef.current?.click()} type="button"><ImagePlus aria-hidden="true" size={15} /><span>{isUploading ? t("community.uploading") : t("community.image")}</span></button></> : null}</div>
                      <textarea maxLength={20000} onChange={(event) => setEditState({ ...editState, notes: event.target.value })} ref={notesRef} rows={6} value={editState.notes} />
                    </div>
                    <fieldset className="community-selection"><legend>{t("community.sharedPrompts")}</legend>{selectedFlow.items.map((item) => <label key={item.id}><input checked={editState.includedItemIds.includes(item.id)} onChange={() => setEditState({ ...editState, includedItemIds: toggleId(editState.includedItemIds, item.id) })} type="checkbox" /><span>{t("community.promptNumber", { count: item.sequence })}: {item.prompt_text.slice(0, 120)}</span></label>)}</fieldset>
                    {selectedFlow.files.length ? <fieldset className="community-selection"><legend>{t("community.sharedFiles")}</legend>{selectedFlow.files.map((file) => <label key={file.id}><input checked={editState.includedFileIds.includes(file.id)} onChange={() => setEditState({ ...editState, includedFileIds: toggleId(editState.includedFileIds, file.id) })} type="checkbox" /><span>{file.file_path}</span></label>)}</fieldset> : null}
                    <div className="community-flow-editor-row">
                      <label><span>{t("common.tags")}</span><input onChange={(event) => setEditState({ ...editState, tags: event.target.value })} value={editState.tags} /></label>
                      <label><span>{t("community.visibility")}</span><select onChange={(event) => setEditState({ ...editState, visibility: event.target.value as CommunityFlowEditState["visibility"] })} value={editState.visibility}><option value="private">{t("community.private")}</option><option value="unlisted">{t("community.unlisted")}</option><option value="public">{t("community.public")}</option></select></label>
                      <label><span>{t("common.status")}</span><select onChange={(event) => setEditState({ ...editState, status: event.target.value as CommunityFlowEditState["status"] })} value={editState.status}><option value="draft">{t("community.draft")}</option><option value="published">{t("community.published")}</option><option value="archived">{t("community.archived")}</option></select></label>
                    </div>
                    {saveError ? <div className="community-flow-error" role="alert">{saveError}</div> : null}
                    <div className="community-flow-editor-actions"><button className="toolbar-button" onClick={() => { setEditState(editStateFor(selectedFlow)); setIsEditing(false); }} type="button"><X aria-hidden="true" size={15} /><span>{t("common.cancel")}</span></button><button className="community-flow-save-button" disabled={isSaving} onClick={() => void save()} type="button"><Check aria-hidden="true" size={15} /><span>{isSaving ? t("common.saving") : t("community.saveReview")}</span></button></div>
                  </section>
                ) : saveError ? <div className="community-flow-error" role="alert">{saveError}</div> : null}

                {selectedFlow.context_summary ? <section className="community-flow-section"><h3>{t("community.context")}</h3><p>{selectedFlow.context_summary}</p></section> : null}
                {selectedFlow.notes ? <section className="community-flow-section"><h3>{t("community.content")}</h3><MarkdownContent className="community-markdown-content" value={selectedFlow.notes} /></section> : null}
                <section className="community-flow-section"><h3>{t("community.promptFlow")}</h3><div className="community-flow-items">{selectedFlow.items.map((item) => <article className="community-flow-item" data-excluded={!item.is_included || undefined} key={item.id}><div className="community-flow-item-header"><span>{t("community.promptNumber", { count: item.sequence })}</span><AiModelBadge className="is-compact" model={item.model_name ?? item.tool_name ?? "AI"} /><strong>{t("community.fileCount", { count: item.files_changed })}</strong></div><p>{item.prompt_text}</p>{item.response_text ? <div className="community-flow-response"><span>{t("community.aiResponse")}</span><p>{item.response_text}</p></div> : null}</article>)}</div></section>
                {selectedFlow.files.length ? <section className="community-flow-section"><h3>{t("community.linkedFiles")}</h3><div className="community-flow-files">{selectedFlow.files.map((file) => <div className="community-flow-file" data-excluded={!file.is_included || undefined} key={file.id}><strong>{file.file_path}</strong><span>{file.change_type ?? "changed"} · +{file.additions} / -{file.deletions}</span></div>)}</div></section> : null}
              </>
            ) : (
              <EmptyState description={errorMessage ?? t("community.selectDescription")} eyebrow={t("nav.community")} icon={Share2} title={errorMessage ? t("community.detailFailed") : t("community.select")} />
            )}
          </aside>
        </section>
      )}
    </>
  );
}
