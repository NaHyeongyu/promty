import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Activity, BookOpen, Check, Search, Share2, X } from "lucide-react";
import { MarkdownContent } from "../MarkdownContent";
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
  ActivityItem,
  OverviewItem,
  PublishedFlowDetail,
  ProjectDetailData,
  ProjectDetailTab,
  ProjectDetailTabId,
  PromptActivityItem,
  PromptFlowPublishPayload,
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
  onPublishFlow?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
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

function promptTitle(prompt: string) {
  return prompt.split(/\r?\n/)[0]?.trim().replace(/\s+/g, " ") || "Prompt flow";
}

function promptRangeLabel(prompts: PromptActivityItem[]) {
  if (prompts.length === 0) {
    return "No prompts selected";
  }
  const first = prompts[0];
  const last = prompts[prompts.length - 1];
  return first.id === last.id
    ? `Prompt ${first.sequence}`
    : `Prompts ${first.sequence}-${last.sequence}`;
}

function shareSelectionTitle(
  prompts: PromptActivityItem[],
  scope: "project" | "session",
) {
  if (scope === "project") {
    return prompts.length === 1 ? "1 prompt selected" : `${prompts.length} prompts selected`;
  }
  return promptRangeLabel(prompts);
}

function compactLabel(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function tagsFromPrompts(prompts: PromptActivityItem[]) {
  const tags = new Set<string>();
  for (const prompt of prompts) {
    if (prompt.model) {
      tags.add(prompt.model.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    }
    if (prompt.filesChanged > 0) {
      tags.add("code-changes");
    }
  }
  return Array.from(tags).filter(Boolean).slice(0, 6).join(", ");
}

function shareSelectionLabel(state: "end" | "range" | "start" | undefined) {
  if (state === "start") {
    return "Start";
  }
  if (state === "end") {
    return "End";
  }
  if (state === "range") {
    return "Included";
  }
  return null;
}

type MarkdownEditorView = {
  destroy: () => void;
  dispatch: (transaction: {
    changes: { from: number; insert: string; to: number };
  }) => void;
  state: {
    doc: {
      toString: () => string;
    };
  };
};

const MODAL_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

function focusableModalElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR),
  ).filter((element) => {
    const isHidden = element.getAttribute("aria-hidden") === "true";
    const isDisabled = element.hasAttribute("disabled");
    return !isHidden && !isDisabled && element.getClientRects().length > 0;
  });
}

function MarkdownEditor({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const editorElementRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<MarkdownEditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let isDisposed = false;
    let mountedEditorView: MarkdownEditorView | null = null;

    async function mountEditor() {
      const [
        commands,
        markdownLanguage,
        language,
        state,
        view,
      ] = await Promise.all([
        import("@codemirror/commands"),
        import("@codemirror/lang-markdown"),
        import("@codemirror/language"),
        import("@codemirror/state"),
        import("@codemirror/view"),
      ]);

      if (isDisposed || !editorElementRef.current) {
        return;
      }

      const markdownEditorTheme = view.EditorView.theme(
        {
          "&": {
            backgroundColor: "transparent",
            color: "var(--bh-color-text-primary)",
            fontSize: "var(--bh-font-size-code)",
          },
          "&.cm-focused": {
            outline: "none",
          },
          ".cm-content": {
            minHeight: "240px",
            padding: "var(--bh-space-3)",
          },
          ".cm-line": {
            padding: "0",
          },
          ".cm-scroller": {
            fontFamily: "var(--bh-font-code)",
            lineHeight: "var(--bh-line-height-code)",
          },
          ".cm-placeholder": {
            color: "var(--bh-color-text-muted)",
          },
          ".cm-cursor": {
            borderLeftColor: "var(--bh-color-text-primary)",
          },
          ".cm-selectionBackground, .cm-content ::selection": {
            backgroundColor: "var(--bh-color-primary-subtle) !important",
          },
        },
        { dark: true },
      );

      mountedEditorView = new view.EditorView({
        parent: editorElementRef.current,
        state: state.EditorState.create({
          doc: valueRef.current,
          extensions: [
            commands.history(),
            markdownLanguage.markdown(),
            language.syntaxHighlighting(language.defaultHighlightStyle, {
              fallback: true,
            }),
            view.EditorView.lineWrapping,
            view.placeholder(placeholder),
            markdownEditorTheme,
            view.keymap.of([
              ...commands.defaultKeymap,
              ...commands.historyKeymap,
              commands.indentWithTab,
            ]),
            view.EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString());
              }
            }),
          ],
        }),
      });

      editorViewRef.current = mountedEditorView;
    }

    void mountEditor();

    return () => {
      isDisposed = true;
      mountedEditorView?.destroy();
      editorViewRef.current = null;
    };
  }, [placeholder]);

  useEffect(() => {
    valueRef.current = value;
    const editorView = editorViewRef.current;
    if (!editorView) {
      return;
    }

    const currentValue = editorView.state.doc.toString();
    if (currentValue === value) {
      return;
    }

    editorView.dispatch({
      changes: {
        from: 0,
        insert: value,
        to: currentValue.length,
      },
    });
  }, [value]);

  return <div className="bh-markdown-editor" ref={editorElementRef} />;
}

function PromptFlowShareDrawer({
  data,
  onClose,
  onPublishFlow,
  onSelectPrompt,
  prompts,
  scope,
  session,
  sessionPrompts,
  shareStateForPrompt,
}: {
  data: ProjectDetailData;
  onClose: () => void;
  onPublishFlow?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onSelectPrompt: (prompt: PromptActivityItem) => void;
  prompts: PromptActivityItem[];
  scope: "project" | "session";
  session: ActivityItem | null;
  sessionPrompts: PromptActivityItem[];
  shareStateForPrompt: (
    prompt: PromptActivityItem,
  ) => "end" | "range" | "start" | undefined;
}) {
  const modalElementRef = useRef<HTMLElement | null>(null);
  const orderedPrompts = useMemo(
    () =>
      [...prompts].sort((first, second) => {
        if (scope === "project") {
          const firstTime = Date.parse(first.submittedAt);
          const secondTime = Date.parse(second.submittedAt);
          if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime)) {
            return firstTime - secondTime;
          }
        }
        return first.sequence - second.sequence;
      }),
    [prompts, scope],
  );
  const orderedSessionPrompts = useMemo(
    () =>
      [...sessionPrompts].sort((first, second) => {
        if (scope === "project") {
          const firstTime = Date.parse(first.submittedAt);
          const secondTime = Date.parse(second.submittedAt);
          if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime)) {
            return secondTime - firstTime;
          }
        }
        return first.sequence - second.sequence;
      }),
    [scope, sessionPrompts],
  );
  const selectionKey = orderedPrompts.map((prompt) => prompt.id).join(":");
  const defaultTitle =
    orderedPrompts.length > 0
      ? `${data.project.name}: ${promptTitle(orderedPrompts[0].prompt)}`
      : `${data.project.name}: Prompt flow`;
  const defaultSummary =
    orderedPrompts.length > 0
      ? `${orderedPrompts.length} prompt flow from ${
          session?.model ?? data.project.name
        } with ${orderedPrompts.reduce(
          (total, prompt) => total + prompt.filesChanged,
          0,
        )} linked file changes.`
      : "";
  const defaultContext =
    orderedPrompts.length > 0
      ? scope === "session" && session
        ? `${promptRangeLabel(orderedPrompts)} from session ${session.id.slice(0, 8)}.`
        : `${orderedPrompts.length} selected prompts from ${data.project.name}.`
      : "";
  const editorPlaceholder =
    "Write the context, decisions, code notes, and follow-up ideas in Markdown.\n\n```ts\n// Code blocks work well here.\n```";
  const [shareStep, setShareStep] = useState<"compose" | "select">("select");
  const [editorMode, setEditorMode] = useState<"preview" | "write">("write");
  const [title, setTitle] = useState(defaultTitle);
  const [summary, setSummary] = useState(defaultSummary);
  const [contextSummary, setContextSummary] = useState(defaultContext);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState(tagsFromPrompts(orderedPrompts));
  const [visibility, setVisibility] =
    useState<PromptFlowPublishPayload["visibility"]>("public");
  const [publishIntent, setPublishIntent] =
    useState<PromptFlowPublishPayload["status"] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";

    const focusTimer = window.setTimeout(() => {
      modalElementRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      previousActiveElement?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    setTitle(defaultTitle);
    setSummary(defaultSummary);
    setContextSummary(defaultContext);
    setTags(tagsFromPrompts(orderedPrompts));
    setContent("");
    setEditorMode("write");
    setShareStep("select");
    setErrorMessage(null);
  }, [defaultContext, defaultSummary, defaultTitle, selectionKey]);

  const canContinue = orderedPrompts.length > 0;
  const canPublish =
    Boolean(onPublishFlow) &&
    data.project.id.length > 0 &&
    orderedPrompts.length > 0 &&
    title.trim().length > 0;
  const isSubmitting = publishIntent !== null;

  const submitFlow = (status: PromptFlowPublishPayload["status"]) => {
    if (!onPublishFlow || orderedPrompts.length === 0 || !title.trim()) {
      return;
    }

    setPublishIntent(status);
    setErrorMessage(null);
    void onPublishFlow({
      context_summary: contextSummary.trim() || null,
      end_prompt_event_id:
        scope === "session" ? orderedPrompts[orderedPrompts.length - 1].id : null,
      notes: content.trim() || null,
      prompt_event_ids:
        scope === "project" ? orderedPrompts.map((prompt) => prompt.id) : undefined,
      project_id: data.project.id,
      session_id: scope === "session" ? session?.id ?? null : null,
      start_prompt_event_id: scope === "session" ? orderedPrompts[0].id : null,
      status,
      summary: summary.trim() || null,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      title: title.trim(),
      visibility,
    })
      .then(() => {
        onClose();
      })
      .catch((error) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Flow could not be saved.",
        );
      })
      .finally(() => {
        setPublishIntent(null);
      });
  };
  const handleModalKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const modalElement = modalElementRef.current;
    if (!modalElement) {
      return;
    }

    const focusableElements = focusableModalElements(modalElement);
    if (focusableElements.length === 0) {
      event.preventDefault();
      modalElement.focus({ preventScroll: true });
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  };

  return (
    <div className="bh-share-overlay" role="presentation">
      <section
        aria-modal="true"
        aria-labelledby="prompt-flow-share-title"
        className="bh-share-drawer"
        onKeyDown={handleModalKeyDown}
        ref={modalElementRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="bh-share-drawer-header">
          <div>
            <span>
              {shareStep === "select"
                ? "Step 1 of 2 · Select prompts"
                : "Step 2 of 2 · Write post"}
            </span>
            <h2 id="prompt-flow-share-title">
              {shareSelectionTitle(orderedPrompts, scope)}
            </h2>
          </div>
          <button
            aria-label="Close share drawer"
            className="bh-icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.5} />
          </button>
        </div>

        <form
          className={
            shareStep === "select"
              ? "bh-share-form is-select-step"
              : "bh-share-form"
          }
          onSubmit={(event) => {
            event.preventDefault();
            submitFlow("published");
          }}
        >
          {shareStep === "select" ? (
            <>
              <div className="bh-share-selection-panel">
                <div className="bh-share-selection-header">
                  <div>
                    <span>Prompt selection</span>
                    <strong>{shareSelectionTitle(orderedPrompts, scope)}</strong>
                  </div>
                  <span>{orderedPrompts.length} selected</span>
                </div>
                <div className="bh-share-selection-list">
                  {orderedSessionPrompts.map((prompt) => {
                    const shareState = shareStateForPrompt(prompt);
                    const selectedLabel = shareSelectionLabel(shareState);

                    return (
                      <article
                        aria-label={`Select prompt ${prompt.sequence}`}
                        aria-pressed={Boolean(shareState)}
                        className="bh-share-selection-row bh-prompt-row"
                        data-share-state={shareState}
                        key={prompt.id}
                        onClick={() => onSelectPrompt(prompt)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectPrompt(prompt);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="bh-prompt-row-main">
                          <div className="bh-prompt-row-header">
                            <time>{prompt.submittedAt}</time>
                            <span>Prompt {prompt.sequence}</span>
                          </div>
                          <div
                            className="bh-prompt-row-meta"
                            aria-label="Prompt metadata"
                          >
                            <span className="bh-prompt-row-chip is-model">
                              {prompt.model}
                            </span>
                            <span className="bh-prompt-row-chip">
                              {prompt.filesChanged} files
                            </span>
                            {selectedLabel ? (
                              <span className="bh-prompt-row-chip is-share">
                                {selectedLabel}
                              </span>
                            ) : null}
                            {prompt.response ? (
                              <span className="bh-prompt-row-chip is-response">
                                Response
                              </span>
                            ) : null}
                          </div>
                          <div className="bh-prompt-text">
                            <p>{prompt.prompt}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="bh-share-actions">
                <button
                  className="bh-header-action-button"
                  onClick={onClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="bh-header-action-button is-primary"
                  disabled={!canContinue}
                  onClick={() => setShareStep("compose")}
                  type="button"
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                className="bh-share-preview"
                aria-label="Selected prompt flow preview"
              >
                <div>
                  <strong>{orderedPrompts.length}</strong>
                  <span>prompts</span>
                </div>
                <div>
                  <strong>
                    {orderedPrompts.reduce(
                      (total, prompt) => total + prompt.filesChanged,
                      0,
                    )}
                  </strong>
                  <span>file links</span>
                </div>
                <div>
                  <strong>{session?.model ?? "Project"}</strong>
                  <span>session</span>
                </div>
              </div>

              <label>
                <span>Title</span>
                <input
                  maxLength={255}
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </label>

              <div className="bh-share-editor-field">
                <div className="bh-share-editor-header">
                  <span>Content</span>
                  <div
                    className="bh-share-editor-tabs"
                    role="tablist"
                    aria-label="Markdown editor mode"
                  >
                    <button
                      aria-selected={editorMode === "write"}
                      data-active={editorMode === "write"}
                      onClick={() => setEditorMode("write")}
                      role="tab"
                      type="button"
                    >
                      Write
                    </button>
                    <button
                      aria-selected={editorMode === "preview"}
                      data-active={editorMode === "preview"}
                      onClick={() => setEditorMode("preview")}
                      role="tab"
                      type="button"
                    >
                      Preview
                    </button>
                  </div>
                </div>
                {editorMode === "write" ? (
                  <MarkdownEditor
                    onChange={setContent}
                    placeholder={editorPlaceholder}
                    value={content}
                  />
                ) : (
                  <MarkdownContent value={content} />
                )}
              </div>

              <div
                className="bh-share-visibility"
                role="radiogroup"
                aria-label="Visibility"
              >
                {(["public", "unlisted", "private"] as const).map((option) => (
                  <button
                    aria-checked={visibility === option}
                    className="bh-share-visibility-option"
                    data-active={visibility === option}
                    key={option}
                    onClick={() => setVisibility(option)}
                    role="radio"
                    type="button"
                  >
                    {option[0].toUpperCase()}
                    {option.slice(1)}
                  </button>
                ))}
              </div>

              <details className="bh-share-details">
                <summary>Details</summary>
                <div>
                  <label>
                    <span>Summary</span>
                    <textarea
                      onChange={(event) => setSummary(event.target.value)}
                      rows={3}
                      value={summary}
                    />
                  </label>

                  <label>
                    <span>Context</span>
                    <textarea
                      onChange={(event) => setContextSummary(event.target.value)}
                      rows={3}
                      value={contextSummary}
                    />
                  </label>

                  <label>
                    <span>Tags</span>
                    <input
                      onChange={(event) => setTags(event.target.value)}
                      placeholder="react, api, refactor"
                      value={tags}
                    />
                  </label>
                </div>
              </details>

              {errorMessage ? (
                <div className="bh-share-error">{errorMessage}</div>
              ) : null}

              <div className="bh-share-actions">
                <button
                  className="bh-header-action-button"
                  onClick={() => setShareStep("select")}
                  type="button"
                >
                  Back
                </button>
                <button
                  className="bh-header-action-button"
                  disabled={!canPublish || isSubmitting}
                  onClick={() => submitFlow("draft")}
                  type="button"
                >
                  <span>{publishIntent === "draft" ? "Saving" : "Save draft"}</span>
                </button>
                <button
                  className="bh-header-action-button is-primary"
                  disabled={!canPublish || isSubmitting}
                  type="submit"
                >
                  <Share2 aria-hidden="true" size={15} strokeWidth={1.5} />
                  <span>
                    {publishIntent === "published" ? "Publishing" : "Publish"}
                  </span>
                </button>
              </div>
            </>
          )}
        </form>
      </section>
    </div>
  );
}

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

  const overviewItems = new Map(data.overview.map((item) => [item.title, item]));
  const snapshotItems = [
    overviewItems.get("Repository"),
    overviewItems.get("AI Runtime"),
    overviewItems.get("Last Activity"),
  ].filter((item): item is OverviewItem => Boolean(item));
  const totalItems = [
    overviewItems.get("Total AI Sessions"),
    overviewItems.get("Total Prompts"),
    overviewItems.get("Total Events"),
    overviewItems.get("Last Modified"),
  ].filter((item): item is OverviewItem => Boolean(item));
  const community = data.community;
  const recentFlows = community.recentFlows;

  return (
    <div className="bh-overview-layout">
      <section className="bh-overview-section" aria-labelledby="project-snapshot-title">
        <div className="bh-overview-section-header">
          <div>
            <span>Overview</span>
            <h2 id="project-snapshot-title">Project snapshot</h2>
          </div>
          <strong>{data.project.repositoryStatus}</strong>
        </div>

        <div className="bh-overview-grid">
          {snapshotItems.map((item) => (
            <OverviewCard item={item} key={item.title} />
          ))}
        </div>

        <dl className="bh-overview-totals" aria-label="Project activity totals">
          {totalItems.map((item) => (
            <div key={item.title}>
              <dt>{item.title.replace("Total ", "")}</dt>
              <dd>{item.value}</dd>
              {item.description ? <span>{item.description}</span> : null}
            </div>
          ))}
        </dl>
      </section>

      <section className="bh-overview-section" aria-labelledby="community-status-title">
        <div className="bh-overview-section-header">
          <div>
            <span>Community</span>
            <h2 id="community-status-title">Shared flows</h2>
          </div>
          <strong>{community.totalFlows} total</strong>
        </div>

        <dl className="bh-overview-community-stats" aria-label="Community sharing status">
          <div>
            <dt>Published</dt>
            <dd>{community.publishedFlows}</dd>
          </div>
          <div>
            <dt>Drafts</dt>
            <dd>{community.draftFlows}</dd>
          </div>
          <div>
            <dt>Latest</dt>
            <dd>{community.latestFlowAt ?? "No shares"}</dd>
          </div>
        </dl>

        {recentFlows.length > 0 ? (
          <div className="bh-overview-flow-list" aria-label="Recent shared flows">
            {recentFlows.map((flow) => (
              <article className="bh-overview-flow-row" key={flow.id}>
                <div>
                  <span>
                    {compactLabel(flow.status)} · {compactLabel(flow.visibility)}
                  </span>
                  <strong>{flow.title}</strong>
                  {flow.summary ? <p>{flow.summary}</p> : null}
                </div>
                <dl>
                  <div>
                    <dt>Prompts</dt>
                    <dd>{flow.promptCount}</dd>
                  </div>
                  <div>
                    <dt>Files</dt>
                    <dd>{flow.fileCount}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="bh-overview-community-empty">
            <strong>No shared flows yet</strong>
            <span>Published prompt flows from this project will appear here.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityPanel({
  activityNavigation,
  data,
  onActivityNavigationChange,
  onPublishFlow,
}: {
  activityNavigation?: ActivityNavigationState;
  data: ProjectDetailData;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
  onPublishFlow?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
}) {
  const [localActivityNavigation, setLocalActivityNavigation] =
    useState<ActivityNavigationState>(defaultActivityNavigation);
  const [promptSearchQuery, setPromptSearchQuery] = useState("");
  const [sessionConversationSearchQuery, setSessionConversationSearchQuery] =
    useState("");
  const [shareScope, setShareScope] = useState<"project" | "session">("session");
  const [shareModeSessionId, setShareModeSessionId] = useState<string | null>(null);
  const [shareProjectPromptIds, setShareProjectPromptIds] = useState<string[]>([]);
  const [shareStartPromptId, setShareStartPromptId] = useState<string | null>(null);
  const [shareEndPromptId, setShareEndPromptId] = useState<string | null>(null);
  const [isShareDrawerOpen, setIsShareDrawerOpen] = useState(false);
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
  const selectedSessionPrompts = useMemo(
    () =>
      selectedSession
        ? data.promptActivities
            .filter((activity) => activity.sessionId === selectedSession.id)
            .sort((first, second) => second.sequence - first.sequence)
        : [],
    [data.promptActivities, selectedSession],
  );
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
  const sessionPromptCountLabel = sessionConversationSearchQuery.trim()
    ? `${filteredSessionPrompts.length}/${selectedSessionPrompts.length} prompts`
    : `${selectedSessionPrompts.length} prompts`;
  const isShareMode =
    shareScope === "session" &&
    Boolean(selectedSession) &&
    shareModeSessionId === selectedSession?.id;
  const shareSession =
    shareScope === "session"
      ? data.activities.find((activity) => activity.id === shareModeSessionId) ?? null
      : null;
  const projectSharePrompts = useMemo(
    () =>
      [...data.promptActivities].sort((first, second) => {
        const firstTime = Date.parse(first.submittedAt);
        const secondTime = Date.parse(second.submittedAt);
        if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime)) {
          return secondTime - firstTime;
        }
        return second.sequence - first.sequence;
      }),
    [data.promptActivities],
  );
  const shareSessionPrompts = useMemo(
    () =>
      shareScope === "project"
        ? projectSharePrompts
        : shareSession
        ? data.promptActivities
            .filter((activity) => activity.sessionId === shareSession.id)
            .sort((first, second) => second.sequence - first.sequence)
        : [],
    [data.promptActivities, projectSharePrompts, shareScope, shareSession],
  );
  const shareStartPrompt = shareSessionPrompts.find(
    (activity) => activity.id === shareStartPromptId,
  );
  const shareEndPrompt = shareSessionPrompts.find(
    (activity) => activity.id === shareEndPromptId,
  );
  const selectedSharePrompts = useMemo(() => {
    if (shareScope === "project") {
      const selectedIds = new Set(shareProjectPromptIds);
      return projectSharePrompts
        .filter((activity) => selectedIds.has(activity.id))
        .sort((first, second) => {
          const firstTime = Date.parse(first.submittedAt);
          const secondTime = Date.parse(second.submittedAt);
          if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime)) {
            return firstTime - secondTime;
          }
          return first.sequence - second.sequence;
        });
    }
    if (!shareStartPrompt) {
      return [];
    }
    if (!shareEndPrompt) {
      return [shareStartPrompt];
    }
    if (shareEndPrompt.sequence <= shareStartPrompt.sequence) {
      return [shareStartPrompt];
    }
    return shareSessionPrompts
      .filter(
        (activity) =>
          activity.sequence >= shareStartPrompt.sequence &&
          activity.sequence <= shareEndPrompt.sequence,
      )
      .sort((first, second) => first.sequence - second.sequence);
  }, [
    projectSharePrompts,
    shareEndPrompt,
    shareProjectPromptIds,
    shareScope,
    shareSessionPrompts,
    shareStartPrompt,
  ]);
  const selectedSharePromptIds = new Set(
    selectedSharePrompts.map((activity) => activity.id),
  );
  const sessionForPrompt = (activity: PromptActivityItem) =>
    data.activities.find((session) => session.id === activity.sessionId) ?? null;
  const openShareSelection = (
    session: ActivityItem,
    prompts: PromptActivityItem[],
  ) => {
    const orderedPrompts = [...prompts].sort(
      (first, second) => first.sequence - second.sequence,
    );
    if (orderedPrompts.length === 0) {
      return;
    }
    setShareScope("session");
    setShareModeSessionId(session.id);
    setShareProjectPromptIds([]);
    setShareStartPromptId(orderedPrompts[0].id);
    setShareEndPromptId(orderedPrompts[orderedPrompts.length - 1].id);
    setIsShareDrawerOpen(true);
  };
  const startShareMode = () => {
    if (!selectedSession) {
      return;
    }
    const defaultPrompt = selectedSessionPrompt ?? selectedSessionPrompts[0] ?? null;
    setShareScope("session");
    setShareModeSessionId(selectedSession.id);
    setShareProjectPromptIds([]);
    setShareStartPromptId(defaultPrompt?.id ?? null);
    setShareEndPromptId(null);
    setIsShareDrawerOpen(Boolean(defaultPrompt));
  };
  const shareEntireSession = () => {
    if (!selectedSession || selectedSessionPrompts.length === 0) {
      return;
    }
    openShareSelection(selectedSession, selectedSessionPrompts);
  };
  const startProjectShareFromPrompt = (activity: PromptActivityItem) => {
    setShareScope("project");
    setShareModeSessionId(null);
    setShareProjectPromptIds([activity.id]);
    setShareStartPromptId(null);
    setShareEndPromptId(null);
    setIsShareDrawerOpen(true);
  };
  const startSessionShareFromPrompt = (activity: PromptActivityItem) => {
    const session = sessionForPrompt(activity);
    if (!session) {
      return;
    }
    setShareScope("session");
    setShareModeSessionId(session.id);
    setShareProjectPromptIds([]);
    setShareStartPromptId(activity.id);
    setShareEndPromptId(null);
    setIsShareDrawerOpen(true);
  };
  const selectSharePrompt = (activity: PromptActivityItem) => {
    if (shareScope === "project") {
      setShareProjectPromptIds((currentIds) => {
        if (currentIds.includes(activity.id)) {
          return currentIds.length > 1
            ? currentIds.filter((promptId) => promptId !== activity.id)
            : currentIds;
        }
        return [...currentIds, activity.id];
      });
      return;
    }
    const session = sessionForPrompt(activity);
    if (!session) {
      return;
    }
    if (
      !shareStartPrompt ||
      activity.sessionId !== shareModeSessionId ||
      shareEndPrompt ||
      activity.id === shareStartPrompt.id ||
      activity.sequence <= shareStartPrompt.sequence
    ) {
      setShareModeSessionId(session.id);
      setShareStartPromptId(activity.id);
      setShareEndPromptId(null);
      return;
    }
    setShareModeSessionId(session.id);
    setShareEndPromptId(activity.id);
  };
  const shareStateForPrompt = (activity: PromptActivityItem) => {
    if (shareScope === "project") {
      return selectedSharePromptIds.has(activity.id) ? ("range" as const) : undefined;
    }
    if (
      activity.sessionId !== shareModeSessionId ||
      !selectedSharePromptIds.has(activity.id)
    ) {
      return undefined;
    }
    if (activity.id === shareStartPromptId) {
      return "start" as const;
    }
    if (activity.id === shareEndPromptId) {
      return "end" as const;
    }
    return "range" as const;
  };

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
          onClick={() => {
            const promptSessionTarget = view === "prompts" ? selectedPrompt : null;
            updateActivityNavigation({
              selectedPromptId: null,
              selectedSessionId:
                promptSessionTarget?.sessionId ?? selectedSessionId,
              selectedSessionPromptId:
                promptSessionTarget?.id ?? selectedSessionPromptId,
              view: "sessions",
            });
            setSessionConversationSearchQuery("");
          }}
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
            <PromptChangeDetail
              activity={selectedPrompt}
              onOpenSession={(activity) => {
                updateActivityNavigation({
                  selectedPromptId: null,
                  selectedSessionId: activity.sessionId,
                  selectedSessionPromptId: activity.id,
                  view: "sessions",
                });
                setSessionConversationSearchQuery("");
              }}
              onSharePrompt={startProjectShareFromPrompt}
            />
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
                  const latestPromptInSession =
                    data.promptActivities
                      .filter((prompt) => prompt.sessionId === activity.id)
                      .sort((first, second) => second.sequence - first.sequence)[0] ??
                    null;
                  updateActivityNavigation({
                    selectedPromptId: null,
                    selectedSessionId: activity.id,
                    selectedSessionPromptId: latestPromptInSession?.id ?? null,
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
                  <div className="bh-session-header-actions">
                    <strong>{sessionPromptCountLabel}</strong>
                    {selectedSessionPrompts.length > 0 ? (
                      <>
                        <button
                          className="bh-header-action-button is-primary"
                          onClick={shareEntireSession}
                          type="button"
                        >
                          <Share2 aria-hidden="true" size={15} strokeWidth={1.5} />
                          <span>Share session</span>
                        </button>
                        <button
                          className="bh-header-action-button"
                          data-active={isShareMode}
                          onClick={isShareMode ? () => {
                            setShareModeSessionId(null);
                            setShareProjectPromptIds([]);
                            setShareStartPromptId(null);
                            setShareEndPromptId(null);
                            setIsShareDrawerOpen(false);
                          } : startShareMode}
                          type="button"
                        >
                          {isShareMode ? (
                            <X aria-hidden="true" size={15} strokeWidth={1.5} />
                          ) : (
                            <Check aria-hidden="true" size={15} strokeWidth={1.5} />
                          )}
                          <span>{isShareMode ? "Cancel" : "Select prompts"}</span>
                        </button>
                      </>
                    ) : null}
                  </div>
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

                {isShareMode ? (
                  <div className="bh-share-mode-bar">
                    <span>{promptRangeLabel(selectedSharePrompts)}</span>
                    <div>
                      <button
                        className="bh-header-action-button"
                        onClick={() => {
                          setShareProjectPromptIds([]);
                          setShareStartPromptId(null);
                          setShareEndPromptId(null);
                          setIsShareDrawerOpen(false);
                        }}
                        type="button"
                      >
                        Clear
                      </button>
                      <button
                        className="bh-header-action-button is-primary"
                        disabled={selectedSharePrompts.length === 0}
                        onClick={() => setIsShareDrawerOpen(true)}
                        type="button"
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                ) : null}

                {selectedSessionPrompts.length > 0 ? (
                  filteredSessionPrompts.length > 0 ? (
                    <div className="bh-prompt-list">
                      {filteredSessionPrompts.map((activity) => (
                        <PromptActivityCard
                          activity={activity}
                          isSelected={activity.id === selectedSessionPrompt?.id}
                          key={activity.id}
                          onOpen={() => {
                            if (isShareMode) {
                              selectSharePrompt(activity);
                              return;
                            }
                            updateActivityNavigation({
                              selectedPromptId: null,
                              selectedSessionId: selectedSession?.id ?? null,
                              selectedSessionPromptId: activity.id,
                              view: "sessions",
                            })
                          }}
                          shareState={shareStateForPrompt(activity)}
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
              </>
            ) : (
              <div className="bh-prompt-search-empty">
                Select a session to inspect its conversations.
              </div>
            )}
          </section>

          <PromptChangeDetail
            activity={selectedSessionPrompt}
            onSharePrompt={startSessionShareFromPrompt}
          />
        </div>
      ) : (
        <EmptyState
          description="Session summaries will appear after AI activity is grouped."
          icon={Activity}
          title="No sessions yet"
        />
      )}

      {isShareDrawerOpen &&
      (shareScope === "project" || shareSession) &&
      selectedSharePrompts.length > 0 ? (
        <PromptFlowShareDrawer
          data={data}
          onClose={() => setIsShareDrawerOpen(false)}
          onSelectPrompt={selectSharePrompt}
          onPublishFlow={onPublishFlow}
          prompts={selectedSharePrompts}
          scope={shareScope}
          session={shareSession}
          sessionPrompts={shareSessionPrompts}
          shareStateForPrompt={shareStateForPrompt}
        />
      ) : null}

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
  onPublishFlow,
  onRepositoryFileSelect,
  onRetry,
}: {
  activityNavigation?: ActivityNavigationState;
  activeTab: ProjectDetailTabId;
  data: ProjectDetailData;
  errorMessage?: string | null;
  isLoading?: boolean;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
  onPublishFlow?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
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
        onPublishFlow={onPublishFlow}
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
  onPublishFlow,
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
          onPublishFlow={onPublishFlow}
          onRepositoryFileSelect={onRepositoryFileSelect}
          onRetry={onRetry}
        />
      </div>
    </section>
  );
}
