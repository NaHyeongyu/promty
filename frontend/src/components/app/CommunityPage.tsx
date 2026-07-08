import {
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Archive,
  Check,
  ImagePlus,
  Pencil,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";
import { MarkdownContent } from "../MarkdownContent";
import {
  AiModelBadge,
  type PromptFlowUpdatePayload,
  type PublishedFlowAsset,
} from "../project-detail";
import type {
  PublishedFlowDetailResponse,
  PublishedFlowSummary,
} from "../../workspace/types";
import { EmptyState } from "./WorkspaceStates";

type CommunityFlowEditState = {
  contextSummary: string;
  notes: string;
  status: "archived" | "draft" | "published";
  summary: string;
  tags: string;
  title: string;
  visibility: "private" | "public" | "unlisted";
};

function communityFlowEditState(flow: PublishedFlowDetailResponse): CommunityFlowEditState {
  return {
    contextSummary: flow.context_summary ?? "",
    notes: flow.notes ?? "",
    status:
      flow.status === "archived" || flow.status === "draft"
        ? flow.status
        : "published",
    summary: flow.summary ?? "",
    tags: flow.tags.join(", "),
    title: flow.title,
    visibility:
      flow.visibility === "private" || flow.visibility === "unlisted"
        ? flow.visibility
        : "public",
  };
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function splitTagsInput(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function CommunityPageSkeleton() {
  return (
    <section
      aria-label="Loading community"
      aria-live="polite"
      className="community-layout community-layout-skeleton"
      role="status"
    >
      <div className="community-flow-list">
        {Array.from({ length: 5 }).map((_, index) => (
          <article className="community-flow-card community-flow-card-skeleton" key={index}>
            <span className="skeleton-line skeleton-line-sm" />
            <span className="skeleton-line skeleton-line-title" />
            <span className="skeleton-line skeleton-line-md" />
            <div className="skeleton-badge-row">
              <span />
              <span />
              <span />
            </div>
          </article>
        ))}
      </div>
      <aside className="community-flow-detail" aria-label="Loading prompt flow detail">
        <CommunityFlowDetailSkeleton />
      </aside>
    </section>
  );
}

function CommunityFlowDetailSkeleton() {
  return (
    <div className="community-flow-detail-skeleton">
      <div className="community-flow-detail-header">
        <div className="community-flow-detail-titlebar">
          <span className="skeleton-line skeleton-line-sm" />
          <span className="skeleton-pill skeleton-pill-action" />
        </div>
        <span className="skeleton-line skeleton-line-section" />
        <span className="skeleton-line skeleton-line-description" />
      </div>
      <div className="community-flow-stats skeleton-stats">
        <span />
        <span />
        <span />
      </div>
      <div className="community-flow-section">
        <span className="skeleton-line skeleton-line-title" />
        <span className="skeleton-line skeleton-line-md" />
        <span className="skeleton-line skeleton-line-description" />
      </div>
      <div className="community-flow-items">
        {Array.from({ length: 3 }).map((_, index) => (
          <article className="community-flow-item community-flow-item-skeleton" key={index}>
            <span className="skeleton-line skeleton-line-md" />
            <span className="skeleton-line skeleton-line-description" />
          </article>
        ))}
      </div>
    </div>
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
  onSelectFlow,
  onUpdateFlow,
  onUploadAsset,
  selectedFlow,
}: {
  errorMessage?: string | null;
  flows: PublishedFlowSummary[];
  isDetailLoading: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onArchiveFlow: (flowKey: string) => Promise<PublishedFlowDetailResponse>;
  onReload: () => void;
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
  selectedFlow: PublishedFlowDetailResponse | null;
}) {
  const editAssetInputRef = useRef<HTMLInputElement | null>(null);
  const editNotesRef = useRef<HTMLTextAreaElement | null>(null);
  const [editState, setEditState] = useState<CommunityFlowEditState | null>(
    selectedFlow ? communityFlowEditState(selectedFlow) : null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isEditAssetUploading, setIsEditAssetUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setEditState(selectedFlow ? communityFlowEditState(selectedFlow) : null);
    setIsEditing(false);
    setIsEditAssetUploading(false);
    setSaveError(null);
  }, [selectedFlow?.id]);

  const insertMarkdownIntoEditNotes = (markdown: string) => {
    setEditState((current) => {
      if (!current) {
        return current;
      }

      const textarea = editNotesRef.current;
      const selectionStart = textarea?.selectionStart ?? current.notes.length;
      const selectionEnd = textarea?.selectionEnd ?? current.notes.length;
      const beforeSelection = current.notes.slice(0, selectionStart);
      const afterSelection = current.notes.slice(selectionEnd);
      const needsLeadingBreak =
        beforeSelection.length > 0 && !beforeSelection.endsWith("\n\n");
      const needsTrailingBreak =
        afterSelection.length > 0 && !afterSelection.startsWith("\n\n");
      const textToInsert = `${needsLeadingBreak ? "\n\n" : ""}${markdown}${
        needsTrailingBreak ? "\n\n" : ""
      }`;
      const nextNotes = `${beforeSelection}${textToInsert}${afterSelection}`;
      const nextCursorPosition = selectionStart + textToInsert.length;

      window.requestAnimationFrame(() => {
        editNotesRef.current?.focus();
        editNotesRef.current?.setSelectionRange(
          nextCursorPosition,
          nextCursorPosition,
        );
      });

      return { ...current, notes: nextNotes };
    });
  };

  const handleEditAssetInputChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (!file || !selectedFlow || !onUploadAsset) {
      return;
    }

    setSaveError(null);
    setIsEditAssetUploading(true);
    try {
      const altText = file.name.replace(/\.[^.]+$/, "").trim() || file.name;
      const asset = await onUploadAsset(selectedFlow.slug, file, altText);
      insertMarkdownIntoEditNotes(asset.markdown);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setIsEditAssetUploading(false);
    }
  };

  const submitEdit = async () => {
    if (!selectedFlow || !editState) {
      return;
    }
    const nextTitle = editState.title.trim();
    if (!nextTitle) {
      setSaveError("Title is required");
      return;
    }

    setSaveError(null);
    try {
      const updatedFlow = await onUpdateFlow(selectedFlow.slug, {
        context_summary: nullableText(editState.contextSummary),
        notes: nullableText(editState.notes),
        status: editState.status,
        summary: nullableText(editState.summary),
        tags: splitTagsInput(editState.tags),
        title: nextTitle,
        visibility: editState.visibility,
      });
      setEditState(communityFlowEditState(updatedFlow));
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Flow update failed");
    }
  };

  const archiveSelectedFlow = async () => {
    if (!selectedFlow || !window.confirm("Archive this prompt flow?")) {
      return;
    }
    setSaveError(null);
    try {
      const updatedFlow = await onArchiveFlow(selectedFlow.slug);
      setEditState(communityFlowEditState(updatedFlow));
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Flow archive failed");
    }
  };

  if (isLoading && flows.length === 0) {
    return <CommunityPageSkeleton />;
  }

  if (errorMessage && flows.length === 0) {
    return (
      <EmptyState
        description={errorMessage}
        eyebrow="Community"
        icon={Share2}
        title="Could not load prompt flows"
      >
        <button className="empty-state-button" onClick={onReload} type="button">
          <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>Retry</span>
        </button>
      </EmptyState>
    );
  }

  if (flows.length === 0) {
    return (
      <EmptyState
        description="Shared session flows will appear here after publishing from AI Activity."
        eyebrow="Community"
        icon={Share2}
        title="No prompt flows yet"
      />
    );
  }

  return (
    <section
      aria-busy={isLoading || undefined}
      aria-label="Prompt flow community"
      className="community-layout loading-cascade"
      data-loading={isLoading ? "true" : undefined}
    >
      <div className="community-flow-list" aria-label="Published prompt flows">
        {flows.map((flow) => (
          <button
            className="community-flow-card"
            data-active={selectedFlow?.id === flow.id}
            key={flow.id}
            onClick={() => onSelectFlow(flow.slug)}
            type="button"
          >
            <span className="community-flow-card-kicker" aria-label="Flow AI and visibility">
              <AiModelBadge
                className="is-compact"
                model={flow.model_name ?? flow.tool_name ?? "AI"}
              />
              <span className="community-flow-visibility">{flow.visibility}</span>
            </span>
            <strong>{flow.title}</strong>
            {flow.summary ? <p>{flow.summary}</p> : null}
            <div className="community-flow-meta">
              <span>{flow.prompt_count} prompts</span>
              <span>{flow.file_count} files</span>
              <span>{flow.author.username}</span>
            </div>
            {flow.tags.length > 0 ? (
              <div className="community-flow-tags">
                {flow.tags.map((tag) => (
                  <span key={`${flow.id}-${tag}`}>{tag}</span>
                ))}
              </div>
            ) : null}
          </button>
        ))}
      </div>

      <aside
        aria-busy={isDetailLoading || undefined}
        aria-label="Prompt flow detail"
        className="community-flow-detail loading-cascade"
        data-loading={isDetailLoading && selectedFlow ? "true" : undefined}
      >
        {isDetailLoading && !selectedFlow ? (
          <CommunityFlowDetailSkeleton />
        ) : selectedFlow ? (
          <>
            <div className="community-flow-detail-header">
              <div className="community-flow-detail-titlebar">
                <AiModelBadge
                  className="is-compact"
                  model={selectedFlow.model_name ?? selectedFlow.tool_name ?? "AI"}
                />
                {selectedFlow.is_owner ? (
                  <div className="community-flow-owner-actions">
                    <button
                      className="toolbar-button"
                      disabled={isSaving}
                      onClick={() => {
                        setIsEditing((current) => !current);
                        setSaveError(null);
                      }}
                      type="button"
                    >
                      {isEditing ? (
                        <X aria-hidden="true" size={15} strokeWidth={1.5} />
                      ) : (
                        <Pencil aria-hidden="true" size={15} strokeWidth={1.5} />
                      )}
                      <span>{isEditing ? "Cancel" : "Edit"}</span>
                    </button>
                    <button
                      className="toolbar-button"
                      disabled={isSaving || selectedFlow.status === "archived"}
                      onClick={() => {
                        void archiveSelectedFlow();
                      }}
                      type="button"
                    >
                      <Archive aria-hidden="true" size={15} strokeWidth={1.5} />
                      <span>Archive</span>
                    </button>
                  </div>
                ) : null}
              </div>
              <h2>{selectedFlow.title}</h2>
              {selectedFlow.summary ? <p>{selectedFlow.summary}</p> : null}
            </div>

            <dl className="community-flow-stats">
              <div>
                <dt>Prompts</dt>
                <dd>{selectedFlow.prompt_count}</dd>
              </div>
              <div>
                <dt>Files</dt>
                <dd>{selectedFlow.file_count}</dd>
              </div>
              <div>
                <dt>Author</dt>
                <dd>{selectedFlow.author.username}</dd>
              </div>
            </dl>

            {isEditing && selectedFlow.is_owner && editState ? (
              <section className="community-flow-editor">
                <label>
                  <span>Title</span>
                  <input
                    maxLength={255}
                    onChange={(event) =>
                      setEditState((current) =>
                        current
                          ? { ...current, title: event.target.value }
                          : current,
                      )
                    }
                    value={editState.title}
                  />
                </label>
                <label>
                  <span>Summary</span>
                  <textarea
                    maxLength={2000}
                    onChange={(event) =>
                      setEditState((current) =>
                        current
                          ? { ...current, summary: event.target.value }
                          : current,
                      )
                    }
                    rows={3}
                    value={editState.summary}
                  />
                </label>
                <label>
                  <span>Context</span>
                  <textarea
                    maxLength={4000}
                    onChange={(event) =>
                      setEditState((current) =>
                        current
                          ? { ...current, contextSummary: event.target.value }
                          : current,
                      )
                    }
                    rows={3}
                    value={editState.contextSummary}
                  />
                </label>
                <div className="community-flow-editor-field">
                  <div className="community-flow-editor-field-header">
                    <span>Content</span>
                    {onUploadAsset ? (
                      <>
                        <input
                          accept="image/gif,image/jpeg,image/png,image/webp"
                          className="bh-visually-hidden"
                          onChange={(event) => {
                            void handleEditAssetInputChange(event);
                          }}
                          ref={editAssetInputRef}
                          type="file"
                        />
                        <button
                          className="toolbar-button"
                          disabled={
                            isSaving ||
                            isEditAssetUploading ||
                            selectedFlow.status === "archived"
                          }
                          onClick={() => editAssetInputRef.current?.click()}
                          type="button"
                        >
                          <ImagePlus aria-hidden="true" size={15} strokeWidth={1.5} />
                          <span>
                            {isEditAssetUploading ? "Uploading" : "Image"}
                          </span>
                        </button>
                      </>
                    ) : null}
                  </div>
                  <textarea
                    ref={editNotesRef}
                    maxLength={20000}
                    onChange={(event) =>
                      setEditState((current) =>
                        current
                          ? { ...current, notes: event.target.value }
                          : current,
                      )
                    }
                    rows={8}
                    value={editState.notes}
                  />
                </div>
                <div className="community-flow-editor-row">
                  <label>
                    <span>Tags</span>
                    <input
                      onChange={(event) =>
                        setEditState((current) =>
                          current
                            ? { ...current, tags: event.target.value }
                            : current,
                        )
                      }
                      value={editState.tags}
                    />
                  </label>
                  <label>
                    <span>Visibility</span>
                    <select
                      onChange={(event) =>
                        setEditState((current) =>
                          current
                            ? {
                                ...current,
                                visibility: event.target
                                  .value as CommunityFlowEditState["visibility"],
                              }
                            : current,
                        )
                      }
                      value={editState.visibility}
                    >
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  </label>
                  <label>
                    <span>Status</span>
                    <select
                      onChange={(event) =>
                        setEditState((current) =>
                          current
                            ? {
                                ...current,
                                status: event.target
                                  .value as CommunityFlowEditState["status"],
                              }
                            : current,
                        )
                      }
                      value={editState.status}
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </div>
                {saveError ? (
                  <div className="community-flow-error">{saveError}</div>
                ) : null}
                <div className="community-flow-editor-actions">
                  <button
                    className="toolbar-button"
                    disabled={isSaving}
                    onClick={() => {
                      setEditState(communityFlowEditState(selectedFlow));
                      setIsEditing(false);
                      setSaveError(null);
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" size={15} strokeWidth={1.5} />
                    <span>Cancel</span>
                  </button>
                  <button
                    className="community-flow-save-button"
                    disabled={isSaving}
                    onClick={() => {
                      void submitEdit();
                    }}
                    type="button"
                  >
                    <Check aria-hidden="true" size={15} strokeWidth={1.5} />
                    <span>{isSaving ? "Saving" : "Save changes"}</span>
                  </button>
                </div>
              </section>
            ) : null}

            {selectedFlow.context_summary ? (
              <section className="community-flow-section">
                <h3>Context</h3>
                <p>{selectedFlow.context_summary}</p>
              </section>
            ) : null}

            {selectedFlow.notes ? (
              <section className="community-flow-section">
                <h3>Content</h3>
                <MarkdownContent
                  className="community-markdown-content"
                  value={selectedFlow.notes}
                />
              </section>
            ) : null}

            <section className="community-flow-section">
              <h3>Prompt flow</h3>
              <div className="community-flow-items">
                {selectedFlow.items.map((item) => (
                  <article className="community-flow-item" key={item.id}>
                    <div className="community-flow-item-header">
                      <span>Prompt {item.sequence}</span>
                      <AiModelBadge
                        className="is-compact"
                        model={item.model_name ?? item.tool_name ?? "AI"}
                      />
                      <strong>{item.files_changed} files</strong>
                    </div>
                    <p>{item.prompt_text}</p>
                    {item.response_text ? (
                      <div className="community-flow-response">
                        <span>AI response</span>
                        <p>{item.response_text}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            {selectedFlow.files.length > 0 ? (
              <section className="community-flow-section">
                <h3>Linked files</h3>
                <div className="community-flow-files">
                  {selectedFlow.files.map((file) => (
                    <div className="community-flow-file" key={file.id}>
                      <strong>{file.file_path}</strong>
                      <span>
                        {file.change_type ?? "changed"} · +{file.additions} / -
                        {file.deletions}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <EmptyState
            description="Open a flow to read the selected session prompts and linked code changes."
            eyebrow="Community"
            icon={Share2}
            title="Select a prompt flow"
          />
        )}
      </aside>
    </section>
  );
}
