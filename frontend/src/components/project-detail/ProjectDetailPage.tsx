import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Activity, BookOpen, ImagePlus, Search, Share2, X } from "lucide-react";
import { MarkdownContent } from "../MarkdownContent";
import {
  ActivityCard,
  PromptActivityCard,
  PromptChangeDetail,
} from "./ActivityCard";
import { AiModelBadge } from "./AiModelBadge";
import { CodeViewer } from "./CodeViewer";
import { EmptyState } from "./EmptyState";
import { FileTree } from "./FileTree";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectTabs } from "./ProjectTabs";
import type {
  ActivityNavigationState,
  ActivityItem,
  OverviewItem,
  PublishedFlowAsset,
  PublishedFlowDetail,
  ProjectDetailData,
  ProjectDetailTab,
  ProjectDetailTabId,
  ProjectHeaderProjectOption,
  PromptActivityItem,
  PromptFlowPublishPayload,
  PromptFlowUpdatePayload,
} from "./types";
import "./project-detail.css";

type ProjectDetailPageProps = {
  activityNavigation?: ActivityNavigationState;
  activeTab: ProjectDetailTabId;
  data: ProjectDetailData;
  errorMessage?: string | null;
  isLoading?: boolean;
  isRefreshing?: boolean;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
  onConnectRepository?: () => void;
  onGenerateSessionMemory?: (sessionId: string) => Promise<void>;
  onOpenAllProjects?: () => void;
  onProjectSelect?: (projectId: string) => void;
  onRepositoryFileSelect?: (path: string) => void;
  onPublishFlow?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onSaveFlowDraft?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onUpdateFlow?: (
    flowKey: string,
    payload: PromptFlowUpdatePayload,
  ) => Promise<PublishedFlowDetail>;
  onUploadFlowAsset?: (
    flowKey: string,
    file: File,
    altText?: string,
  ) => Promise<PublishedFlowAsset>;
  onRetry?: () => void;
  onTabChange: (tabId: ProjectDetailTabId) => void;
  projectOptions?: ProjectHeaderProjectOption[];
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
  { id: "files", label: "Files" },
];

function promptTitle(prompt: string) {
  return prompt.split(/\r?\n/)[0]?.trim().replace(/\s+/g, " ") || "Prompt flow";
}

function shareSelectionTitle(promptCount: number) {
  return promptCount === 1 ? "1 prompt selected" : `${promptCount} prompts selected`;
}

function promptSubmittedTime(prompt: PromptActivityItem) {
  const submittedTime = Date.parse(prompt.submittedAt);
  return Number.isNaN(submittedTime) ? null : submittedTime;
}

function sortPromptsForFlow(
  first: PromptActivityItem,
  second: PromptActivityItem,
) {
  const firstTime = promptSubmittedTime(first);
  const secondTime = promptSubmittedTime(second);

  if (firstTime !== null && secondTime !== null && firstTime !== secondTime) {
    return firstTime - secondTime;
  }

  return first.sequence - second.sequence;
}

function sortPromptsForSelection(
  first: PromptActivityItem,
  second: PromptActivityItem,
) {
  const firstTime = promptSubmittedTime(first);
  const secondTime = promptSubmittedTime(second);

  if (firstTime !== null && secondTime !== null && firstTime !== secondTime) {
    return secondTime - firstTime;
  }

  return second.sequence - first.sequence;
}

function overviewCompactNumber(value: number) {
  return Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

type WorkType = "brainstorming" | "work";
type WorkTypeFilter = "all" | WorkType;

const workTypeFilterOptions: Array<{ id: WorkTypeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "brainstorming", label: "Brainstorming" },
  { id: "work", label: "Work" },
];

function workTypeForFiles(filesChanged: number): WorkType {
  return filesChanged > 0 ? "work" : "brainstorming";
}

function workTypeLabel(workType: WorkType) {
  return workType === "work" ? "Work" : "Brainstorming";
}

function workTypeCounts<T extends { filesChanged: number }>(
  items: T[],
): Record<WorkTypeFilter, number> {
  const counts: Record<WorkTypeFilter, number> = {
    all: items.length,
    brainstorming: 0,
    work: 0,
  };

  for (const item of items) {
    counts[workTypeForFiles(item.filesChanged)] += 1;
  }

  return counts;
}

function WorkTypeFilterControl({
  ariaLabel,
  counts,
  onChange,
  value,
}: {
  ariaLabel: string;
  counts: Record<WorkTypeFilter, number>;
  onChange: (value: WorkTypeFilter) => void;
  value: WorkTypeFilter;
}) {
  return (
    <div className="bh-work-type-filter" role="group" aria-label={ariaLabel}>
      {workTypeFilterOptions.map((option) => (
        <button
          data-active={value === option.id}
          key={option.id}
          onClick={() => onChange(option.id)}
          type="button"
        >
          <span>{option.label}</span>
          <strong>{counts[option.id]}</strong>
        </button>
      ))}
    </div>
  );
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

type MarkdownEditorView = {
  destroy: () => void;
  dispatch: (transaction: {
    changes: { from: number; insert: string; to: number };
    selection?: { anchor: number };
  }) => void;
  focus: () => void;
  state: {
    doc: {
      toString: () => string;
    };
    selection: {
      main: {
        from: number;
        to: number;
      };
    };
  };
};

type MarkdownInsertRequest = {
  id: number;
  text: string;
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
  insertRequest,
  onChange,
  onInsertHandled,
  placeholder,
  value,
}: {
  insertRequest?: MarkdownInsertRequest | null;
  onChange: (value: string) => void;
  onInsertHandled?: (insertRequestId: number) => void;
  placeholder: string;
  value: string;
}) {
  const editorElementRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<MarkdownEditorView | null>(null);
  const lastInsertRequestIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const [editorReadyVersion, setEditorReadyVersion] = useState(0);

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
      setEditorReadyVersion((version) => version + 1);
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

  useEffect(() => {
    if (
      !insertRequest ||
      lastInsertRequestIdRef.current === insertRequest.id
    ) {
      return;
    }

    const editorView = editorViewRef.current;
    if (!editorView) {
      return;
    }

    lastInsertRequestIdRef.current = insertRequest.id;
    const currentValue = editorView.state.doc.toString();
    const selection = editorView.state.selection.main;
    const beforeSelection = currentValue.slice(0, selection.from);
    const afterSelection = currentValue.slice(selection.to);
    const needsLeadingBreak =
      beforeSelection.length > 0 && !beforeSelection.endsWith("\n\n");
    const needsTrailingBreak =
      afterSelection.length > 0 && !afterSelection.startsWith("\n\n");
    const textToInsert = `${needsLeadingBreak ? "\n\n" : ""}${
      insertRequest.text
    }${needsTrailingBreak ? "\n\n" : ""}`;

    editorView.dispatch({
      changes: {
        from: selection.from,
        insert: textToInsert,
        to: selection.to,
      },
      selection: { anchor: selection.from + textToInsert.length },
    });
    editorView.focus();
    onInsertHandled?.(insertRequest.id);
  }, [editorReadyVersion, insertRequest, onInsertHandled]);

  return <div className="bh-markdown-editor" ref={editorElementRef} />;
}

function PromptFlowShareDrawer({
  availablePrompts,
  data,
  initialPromptIds,
  onClose,
  onPublishFlow,
  onSaveFlowDraft,
  onUpdateFlow,
  onUploadFlowAsset,
  scope,
  session,
}: {
  availablePrompts: PromptActivityItem[];
  data: ProjectDetailData;
  initialPromptIds: string[];
  onClose: () => void;
  onPublishFlow?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onSaveFlowDraft?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onUpdateFlow?: (
    flowKey: string,
    payload: PromptFlowUpdatePayload,
  ) => Promise<PublishedFlowDetail>;
  onUploadFlowAsset?: (
    flowKey: string,
    file: File,
    altText?: string,
  ) => Promise<PublishedFlowAsset>;
  scope: "project" | "session";
  session: ActivityItem | null;
}) {
  const modalElementRef = useRef<HTMLElement | null>(null);
  const assetInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPromptIds, setSelectedPromptIds] =
    useState<string[]>(initialPromptIds);
  const availablePromptIds = useMemo(
    () => new Set(availablePrompts.map((prompt) => prompt.id)),
    [availablePrompts],
  );
  const initialSelectionKey = initialPromptIds.join(":");
  const selectionPrompts = useMemo(
    () => [...availablePrompts].sort(sortPromptsForSelection),
    [availablePrompts],
  );
  const rangePrompts = useMemo(
    () => [...availablePrompts].sort(sortPromptsForFlow),
    [availablePrompts],
  );
  const orderedPrompts = useMemo(
    () =>
      availablePrompts
        .filter((prompt) => selectedPromptIds.includes(prompt.id))
        .sort(sortPromptsForFlow),
    [availablePrompts, selectedPromptIds],
  );
  const selectionKey = orderedPrompts.map((prompt) => prompt.id).join(":");
  const selectedPromptIdSet = useMemo(
    () => new Set(selectedPromptIds),
    [selectedPromptIds],
  );
  const selectedFilesChanged = orderedPrompts.reduce(
    (total, prompt) => total + prompt.filesChanged,
    0,
  );
  const defaultTitle =
    orderedPrompts.length > 0
      ? `${data.project.name}: ${promptTitle(orderedPrompts[0].prompt)}`
      : `${data.project.name}: Prompt flow`;
  const defaultSummary =
    orderedPrompts.length > 0
      ? `${orderedPrompts.length} prompt flow from ${
          session?.model ?? data.project.name
        } with ${selectedFilesChanged} linked file changes.`
      : "";
  const defaultContext =
    orderedPrompts.length > 0
      ? scope === "session" && session
        ? `${orderedPrompts.length} selected prompts from session ${session.id.slice(0, 8)}.`
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
  const [draftFlow, setDraftFlow] = useState<PublishedFlowDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [assetUploadError, setAssetUploadError] = useState<string | null>(null);
  const [isAssetUploading, setIsAssetUploading] = useState(false);
  const [insertRequest, setInsertRequest] =
    useState<MarkdownInsertRequest | null>(null);
  const [rangeStartPromptId, setRangeStartPromptId] = useState(
    rangePrompts[0]?.id ?? "",
  );
  const [rangeEndPromptId, setRangeEndPromptId] = useState(
    rangePrompts[rangePrompts.length - 1]?.id ?? "",
  );
  const rangeStartPrompt = rangePrompts.find(
    (prompt) => prompt.id === rangeStartPromptId,
  );
  const rangeEndPrompt = rangePrompts.find(
    (prompt) => prompt.id === rangeEndPromptId,
  );
  const rangeStatusLabel = !rangeStartPromptId
    ? "Select start"
    : rangeEndPromptId
    ? "Range selected"
    : "Select end";
  const rangeSummaryLabel =
    rangeStartPrompt && rangeEndPrompt
      ? `Prompt ${rangeStartPrompt.sequence} to Prompt ${rangeEndPrompt.sequence}`
      : rangeStartPrompt
      ? `Start: Prompt ${rangeStartPrompt.sequence}`
      : "No range selected";

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
    setSelectedPromptIds(
      initialPromptIds.filter((promptId) => availablePromptIds.has(promptId)),
    );
  }, [availablePromptIds, initialSelectionKey]);

  useEffect(() => {
    const selectedPromptIdSet = new Set(initialPromptIds);
    const selectedRangePrompts = rangePrompts.filter((prompt) =>
      selectedPromptIdSet.has(prompt.id),
    );
    setRangeStartPromptId(
      selectedRangePrompts[0]?.id ?? rangePrompts[0]?.id ?? "",
    );
    setRangeEndPromptId(
      selectedRangePrompts.length > 1
        ? selectedRangePrompts[selectedRangePrompts.length - 1]?.id ?? ""
        : "",
    );
  }, [initialSelectionKey, rangePrompts]);

  useEffect(() => {
    setTitle(defaultTitle);
    setSummary(defaultSummary);
    setContextSummary(defaultContext);
    setTags(tagsFromPrompts(orderedPrompts));
    setContent("");
    setEditorMode("write");
    setShareStep("select");
    setDraftFlow(null);
    setErrorMessage(null);
    setAssetUploadError(null);
    setInsertRequest(null);
  }, [defaultContext, defaultSummary, defaultTitle, selectionKey]);

  const canContinue = orderedPrompts.length > 0;
  const canPublish =
    Boolean(onPublishFlow) &&
    data.project.id.length > 0 &&
    orderedPrompts.length > 0 &&
    title.trim().length > 0;
  const isSubmitting = publishIntent !== null;

  const buildFlowPayload = (
    status: PromptFlowPublishPayload["status"],
  ): PromptFlowPublishPayload => ({
      context_summary: contextSummary.trim() || null,
      end_prompt_event_id: null,
      notes: content.trim() || null,
      prompt_event_ids: orderedPrompts.map((prompt) => prompt.id),
      project_id: data.project.id,
      session_id: scope === "session" ? session?.id ?? null : null,
      start_prompt_event_id: null,
      status,
      summary: summary.trim() || null,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      title: title.trim(),
      visibility,
    });

  const ensureDraftFlow = async () => {
    if (draftFlow) {
      return draftFlow;
    }
    if (!onSaveFlowDraft) {
      throw new Error("Draft save is not available.");
    }
    if (orderedPrompts.length === 0 || !title.trim()) {
      throw new Error("Select prompts and add a title before uploading images.");
    }

    const flow = await onSaveFlowDraft(buildFlowPayload("draft"));
    setDraftFlow(flow);
    return flow;
  };

  const submitFlow = (status: PromptFlowPublishPayload["status"]) => {
    if (orderedPrompts.length === 0 || !title.trim()) {
      return;
    }

    setPublishIntent(status);
    setErrorMessage(null);

    const saveFlow = draftFlow && onUpdateFlow
      ? onUpdateFlow(draftFlow.slug, {
          context_summary: contextSummary.trim() || null,
          notes: content.trim() || null,
          status,
          summary: summary.trim() || null,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          title: title.trim(),
          visibility,
        })
      : onPublishFlow?.(buildFlowPayload(status));

    if (!saveFlow) {
      setPublishIntent(null);
      setErrorMessage("Flow publishing is not available.");
      return;
    }

    void saveFlow
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

  const handleAssetInputChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (!file || !onUploadFlowAsset) {
      return;
    }

    setAssetUploadError(null);
    setIsAssetUploading(true);
    try {
      const flow = await ensureDraftFlow();
      const altText = file.name.replace(/\.[^.]+$/, "").trim() || file.name;
      const asset = await onUploadFlowAsset(flow.slug, file, altText);
      setEditorMode("write");
      setInsertRequest({ id: Date.now(), text: asset.markdown });
    } catch (error) {
      setAssetUploadError(
        error instanceof Error ? error.message : "Image upload failed.",
      );
    } finally {
      setIsAssetUploading(false);
    }
  };
  const handleInsertHandled = useCallback((insertRequestId: number) => {
    setInsertRequest((currentRequest) =>
      currentRequest?.id === insertRequestId ? null : currentRequest,
    );
  }, []);
  const selectPromptRange = (startPromptId: string, endPromptId: string) => {
    const startIndex = rangePrompts.findIndex(
      (prompt) => prompt.id === startPromptId,
    );
    const endIndex = rangePrompts.findIndex(
      (prompt) => prompt.id === endPromptId,
    );

    if (startIndex < 0 || endIndex < 0) {
      return;
    }

    const firstIndex = Math.min(startIndex, endIndex);
    const lastIndex = Math.max(startIndex, endIndex);
    setSelectedPromptIds(
      rangePrompts
        .slice(firstIndex, lastIndex + 1)
        .map((prompt) => prompt.id),
    );
  };
  const startRangeFromPrompt = (prompt: PromptActivityItem) => {
    setRangeStartPromptId(prompt.id);
    setRangeEndPromptId("");
    setSelectedPromptIds([prompt.id]);
  };
  const completeRangeAtPrompt = (prompt: PromptActivityItem) => {
    if (!rangeStartPromptId) {
      startRangeFromPrompt(prompt);
      return;
    }

    setRangeEndPromptId(prompt.id);
    selectPromptRange(rangeStartPromptId, prompt.id);
  };
  const selectPromptForRange = (prompt: PromptActivityItem) => {
    if (!rangeStartPromptId || rangeEndPromptId) {
      startRangeFromPrompt(prompt);
      return;
    }

    completeRangeAtPrompt(prompt);
  };
  const selectPromptList = (prompts: PromptActivityItem[]) => {
    const orderedSelectedPrompts = [...prompts].sort(sortPromptsForFlow);
    setSelectedPromptIds(orderedSelectedPrompts.map((prompt) => prompt.id));
    setRangeStartPromptId(orderedSelectedPrompts[0]?.id ?? "");
    setRangeEndPromptId(
      orderedSelectedPrompts.length > 1
        ? orderedSelectedPrompts[orderedSelectedPrompts.length - 1]?.id ?? ""
        : "",
    );
  };
  const selectAllPrompts = () => {
    selectPromptList(rangePrompts);
  };
  const selectCurrentPrompts = () => {
    selectPromptList(
      rangePrompts.filter((prompt) => initialPromptIds.includes(prompt.id)),
    );
  };
  const selectLatestPrompts = () => {
    selectPromptList(selectionPrompts.slice(0, 5));
  };
  const clearPromptSelection = () => {
    setSelectedPromptIds([]);
    setRangeStartPromptId("");
    setRangeEndPromptId("");
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
              {shareSelectionTitle(orderedPrompts.length)}
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
                    <span>{scope === "session" ? "Session flow" : "Project flow"}</span>
                    <strong>{data.project.name}</strong>
                  </div>
                  <span>
                    {orderedPrompts.length}/{selectionPrompts.length} selected
                  </span>
                </div>

                <div className="bh-share-selection-toolbar">
                  <div>
                    <strong>{shareSelectionTitle(orderedPrompts.length)}</strong>
                    <span>{selectedFilesChanged} file links</span>
                  </div>
                  <div>
                    <button onClick={selectAllPrompts} type="button">
                      Share all
                    </button>
                    <button
                      disabled={selectionPrompts.length === 0}
                      onClick={selectLatestPrompts}
                      type="button"
                    >
                      Latest 5
                    </button>
                    <button
                      disabled={initialPromptIds.length === 0}
                      onClick={selectCurrentPrompts}
                      type="button"
                    >
                      Current only
                    </button>
                    <button onClick={clearPromptSelection} type="button">
                      Clear
                    </button>
                  </div>
                </div>

                <div className="bh-share-range-guide">
                  <div>
                    <span>Range</span>
                    <strong>{rangeSummaryLabel}</strong>
                  </div>
                  <ol className="bh-share-range-steps">
                    <li data-active={Boolean(rangeStartPromptId)}>
                      <span>1</span>
                      <strong>Start</strong>
                    </li>
                    <li data-active={Boolean(rangeEndPromptId)}>
                      <span>2</span>
                      <strong>End</strong>
                    </li>
                  </ol>
                  <span>{rangeStatusLabel}</span>
                </div>

                <div className="bh-share-selection-content">
                  <div className="bh-share-selection-list">
                    {selectionPrompts.map((prompt) => {
                      const isSelected = selectedPromptIdSet.has(prompt.id);
                      const rangeBoundary =
                        prompt.id === rangeStartPromptId
                          ? "start"
                          : prompt.id === rangeEndPromptId
                          ? "end"
                          : undefined;
                      const rangeMarkerLabel =
                        rangeBoundary === "start"
                          ? "Start"
                          : rangeBoundary === "end"
                          ? "End"
                          : isSelected
                          ? "In"
                          : "Pick";
                      const workType = workTypeForFiles(prompt.filesChanged);

                      return (
                        <button
                          aria-pressed={isSelected}
                          className="bh-share-selection-row"
                          data-range-boundary={rangeBoundary}
                          data-selected={isSelected}
                          key={prompt.id}
                          onClick={() => selectPromptForRange(prompt)}
                          type="button"
                        >
                          <span className="bh-share-selection-marker">
                            {rangeMarkerLabel}
                          </span>
                          <span className="bh-share-selection-copy">
                            <span className="bh-share-selection-row-header">
                              <time>{prompt.submittedAt}</time>
                              <span>Prompt {prompt.sequence}</span>
                            </span>
                            <span
                              className="bh-prompt-row-meta"
                              aria-label="Prompt metadata"
                            >
                              <AiModelBadge className="is-compact" model={prompt.model} />
                              <span
                                className="bh-work-type-badge"
                                data-work-type={workType}
                              >
                                {workTypeLabel(workType)}
                              </span>
                              <span className="bh-prompt-row-chip">
                                {prompt.filesChanged} files
                              </span>
                            </span>
                            <span className="bh-share-selection-prompt">
                              {prompt.prompt}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <aside
                    aria-label="Selected prompts preview"
                    className="bh-share-selection-preview"
                  >
                    <div>
                      <span>Preview</span>
                      <strong>{shareSelectionTitle(orderedPrompts.length)}</strong>
                    </div>
                    {orderedPrompts.length > 0 ? (
                      <ol>
                        {orderedPrompts.slice(0, 8).map((prompt) => (
                          <li key={prompt.id}>
                            <span>Prompt {prompt.sequence}</span>
                            <strong>{promptTitle(prompt.prompt)}</strong>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>Select at least one prompt to continue.</p>
                    )}
                  </aside>
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
                  <div className="bh-share-editor-tools">
                    {onUploadFlowAsset ? (
                      <>
                        <input
                          accept="image/gif,image/jpeg,image/png,image/webp"
                          className="bh-visually-hidden"
                          onChange={(event) => {
                            void handleAssetInputChange(event);
                          }}
                          ref={assetInputRef}
                          type="file"
                        />
                        <button
                          className="bh-share-editor-image-button"
                          disabled={isSubmitting || isAssetUploading || !canPublish}
                          onClick={() => assetInputRef.current?.click()}
                          type="button"
                        >
                          <ImagePlus aria-hidden="true" size={15} strokeWidth={1.5} />
                          <span>{isAssetUploading ? "Uploading" : "Image"}</span>
                        </button>
                      </>
                    ) : null}
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
                </div>
                {editorMode === "write" ? (
                  <MarkdownEditor
                    insertRequest={insertRequest}
                    onChange={setContent}
                    onInsertHandled={handleInsertHandled}
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
              {assetUploadError ? (
                <div className="bh-share-error">{assetUploadError}</div>
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

function OverviewPanel({
  data,
  onGenerateSessionMemory,
}: {
  data: ProjectDetailData;
  onGenerateSessionMemory?: (sessionId: string) => Promise<void>;
}) {
  const [isGeneratingMemory, setIsGeneratingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  if (data.overview.length === 0) {
    return (
      <EmptyState
        description="Project metadata will appear after Promty receives project activity."
        icon={BookOpen}
        title="No overview data yet"
      />
    );
  }

  const overviewItems = new Map(data.overview.map((item) => [item.title, item]));
  const repositoryUrlItem = overviewItems.get("Repository URL");
  const projectUrlItem = overviewItems.get("Project URL");
  const descriptionItem = overviewItems.get("Description");
  const modelItem = overviewItems.get("AI Models");
  const connectedModels =
    modelItem?.value && modelItem.value !== "Not captured"
      ? modelItem.value.split(",").map((model) => model.trim()).filter(Boolean)
      : [];
  const filesChanged = data.activities.reduce(
    (total, activity) => total + activity.filesChanged,
    0,
  );
  const latestActivity = data.activities[0] ?? null;
  const statisticItems = [
    { label: "Activities", value: overviewItems.get("Activities")?.value ?? "0" },
    { label: "Prompts", value: overviewItems.get("Prompts")?.value ?? "0" },
    { label: "Files Changed", value: overviewCompactNumber(filesChanged) },
    { label: "Memory", value: overviewCompactNumber(data.memory.totalArtifacts) },
    // Community publishing is paused for now.
    // {
    //   label: "Published Prompts",
    //   value: overviewCompactNumber(data.community.publishedFlows),
    // },
  ];
  const projectItems = [
    repositoryUrlItem,
    projectUrlItem,
    descriptionItem,
    overviewItems.get("Default Branch"),
    overviewItems.get("Visibility"),
  ].filter((item): item is OverviewItem => Boolean(item));
  const timelineItems = [
    overviewItems.get("Created"),
    overviewItems.get("Last Activity"),
    overviewItems.get("Memory Artifacts"),
    // Community publishing is paused for now.
    // overviewItems.get("Last Published Prompt"),
    overviewItems.get("Repository Connected"),
  ].filter((item): item is OverviewItem => Boolean(item));

  return (
    <div className="bh-overview-dashboard">
      <section className="bh-overview-meta-strip" aria-label="Project metadata">
        <div className="bh-overview-hero-meta" aria-label="Connected models">
          <div className="bh-overview-model-badges" aria-label="Connected models">
            {connectedModels.length > 0 ? (
              connectedModels.map((model) => (
                <AiModelBadge className="is-overview" key={model} model={model} />
              ))
            ) : (
              <span className="ai-model-badge is-muted">No models captured</span>
            )}
          </div>
        </div>
      </section>

      <section className="bh-overview-statistics" aria-label="Project statistics">
        <dl>
          {statisticItems.map((item) => (
            <div key={item.label}>
              <dd>{item.value}</dd>
              <dt>{item.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <div className="bh-overview-content-grid">
        <section className="bh-overview-panel" aria-labelledby="project-identity-title">
          <h2 id="project-identity-title">Project</h2>
          <dl className="bh-overview-info-list">
            {projectItems.map((item) => (
              <div key={item.title}>
                <dt>{item.title}</dt>
                <dd>
                  {item.href ? (
                    <a href={item.href} rel="noreferrer" target="_blank">
                      {item.value}
                    </a>
                  ) : (
                    item.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="bh-overview-panel" aria-labelledby="project-timeline-title">
          <h2 id="project-timeline-title">Timeline</h2>
          <dl className="bh-overview-timeline">
            {timelineItems.map((item) => (
              <div key={item.title}>
                <dt>{item.title}</dt>
                <dd>{item.value}</dd>
                {item.description ? <span>{item.description}</span> : null}
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="bh-overview-memory" aria-labelledby="project-memory-title">
        <div className="bh-overview-memory-header">
          <div>
            <h2 id="project-memory-title">Project Memory</h2>
            <p>Promty turns completed development sessions into searchable decision history.</p>
          </div>
          <button
            className="bh-overview-primary-button"
            disabled={!latestActivity || isGeneratingMemory || !onGenerateSessionMemory}
            onClick={() => {
              if (!latestActivity || !onGenerateSessionMemory) {
                return;
              }
              setIsGeneratingMemory(true);
              setMemoryError(null);
              void onGenerateSessionMemory(latestActivity.id)
                .catch((error) => {
                  setMemoryError(
                    error instanceof Error
                      ? error.message
                      : "Memory generation failed.",
                  );
                })
                .finally(() => setIsGeneratingMemory(false));
            }}
            type="button"
          >
            {isGeneratingMemory ? "Generating" : "Generate Latest Memory"}
          </button>
        </div>

        {memoryError ? <div className="bh-overview-memory-error">{memoryError}</div> : null}

        {data.memory.recentArtifacts.length > 0 ? (
          <div className="bh-overview-memory-list">
            {data.memory.recentArtifacts.map((artifact) => (
              <article className="bh-overview-memory-row" key={artifact.id}>
                <strong>{artifact.title}</strong>
                {artifact.summary ? <p>{artifact.summary}</p> : null}
                <span>
                  {artifact.updatedAt ?? artifact.createdAt ?? "Unknown"} ·{" "}
                  {artifact.changedFileCount} files
                </span>
                {artifact.technologies.length > 0 ? (
                  <div className="bh-overview-memory-technologies" aria-label="Technologies">
                    {artifact.technologies.slice(0, 5).map((technology) => (
                      <span key={`${artifact.id}-${technology}`}>{technology}</span>
                    ))}
                  </div>
                ) : null}
                {artifact.sections.length > 0 ? (
                  <div className="bh-overview-memory-sections">
                    {artifact.sections.slice(0, 2).map((section) => (
                      <div key={`${artifact.id}-${section.title}`}>
                        <strong>{section.title}</strong>
                        <p>{section.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {artifact.tags.length > 0 ? (
                  <div className="bh-overview-memory-tags">
                    {artifact.tags.slice(0, 6).map((tag) => (
                      <span key={`${artifact.id}-${tag}`}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="bh-overview-memory-empty">
            <strong>No memory artifacts yet.</strong>
            <span>Generate memory from the latest completed session.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectDetailLoadingSkeleton({
  activeTab,
}: {
  activeTab: ProjectDetailTabId;
}) {
  if (activeTab === "ai-activity") {
    return (
      <section
        aria-label="Loading AI activity"
        aria-live="polite"
        className="bh-detail-skeleton bh-detail-skeleton-activity"
        role="status"
      >
        <div className="bh-activity-view-tabs bh-activity-view-tabs-skeleton">
          <span className="skeleton-pill skeleton-pill-action" />
          <span className="skeleton-pill skeleton-pill-action" />
        </div>

        <div className="bh-prompt-activity-layout">
          <div className="bh-prompt-sidebar">
            <div className="bh-prompt-search bh-prompt-search-skeleton">
              <span className="skeleton-icon" />
              <span className="skeleton-line skeleton-line-md" />
            </div>

            <div className="bh-prompt-list">
              {Array.from({ length: 7 }).map((_, index) => (
                <article className="bh-prompt-row bh-prompt-row-skeleton" key={index}>
                  <div className="bh-prompt-row-main">
                    <div className="bh-prompt-row-header">
                      <span className="skeleton-line skeleton-line-sm" />
                      <span className="skeleton-line skeleton-line-sm" />
                    </div>
                    <div className="bh-prompt-row-meta">
                      <span className="skeleton-pill" />
                      <span className="skeleton-pill" />
                    </div>
                    <div className="bh-prompt-text">
                      <span className="skeleton-line skeleton-line-md" />
                      <span className="skeleton-line skeleton-line-description" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="bh-prompt-change-detail bh-prompt-change-detail-skeleton">
            <div className="bh-prompt-change-header">
              <div>
                <span className="skeleton-line skeleton-line-title" />
                <span className="skeleton-line skeleton-line-md" />
              </div>
              <span className="skeleton-pill skeleton-pill-action" />
            </div>
            <div className="bh-prompt-change-summary">
              <span className="skeleton-line skeleton-line-section" />
              <span className="skeleton-line skeleton-line-description" />
              <span className="skeleton-line skeleton-line-md" />
            </div>
            <div className="bh-prompt-change-list">
              {Array.from({ length: 4 }).map((_, index) => (
                <span className="skeleton-line skeleton-code-line" key={index} />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (activeTab === "files") {
    return (
      <section
        aria-label="Loading repository files"
        aria-live="polite"
        className="bh-detail-skeleton bh-detail-skeleton-files"
        role="status"
      >
        <div className="bh-files-layout">
          {Array.from({ length: 2 }).map((_, sectionIndex) => (
            <section className="bh-files-section" key={sectionIndex}>
              <div className="bh-files-section-header">
                <span className="skeleton-line skeleton-line-section" />
                <span className="skeleton-line skeleton-line-description" />
              </div>
              <div
                className={
                  sectionIndex === 0
                    ? "bh-detail-skeleton-tree"
                    : "bh-detail-skeleton-code"
                }
              >
                {Array.from({ length: sectionIndex === 0 ? 10 : 14 }).map((_, index) => (
                  <span
                    className={
                      sectionIndex === 0
                        ? index % 3 === 0
                          ? "skeleton-line skeleton-line-md"
                          : "skeleton-line skeleton-line-sm"
                        : "skeleton-line skeleton-code-line"
                    }
                    key={index}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Loading project overview"
      aria-live="polite"
      className="bh-detail-skeleton bh-detail-skeleton-overview"
      role="status"
    >
      <div className="bh-overview-meta-strip bh-overview-meta-strip-skeleton">
        <div className="skeleton-badge-row">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="bh-detail-skeleton-stats">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index}>
            <span className="skeleton-line skeleton-line-title" />
            <span className="skeleton-line skeleton-line-sm" />
          </div>
        ))}
      </div>
      <div className="bh-detail-skeleton-split">
        <div className="bh-detail-skeleton-panel">
          <span className="skeleton-line skeleton-line-section" />
          {Array.from({ length: 5 }).map((_, index) => (
            <span className="skeleton-line skeleton-line-md" key={index} />
          ))}
        </div>
        <div className="bh-detail-skeleton-panel">
          <span className="skeleton-line skeleton-line-section" />
          {Array.from({ length: 4 }).map((_, index) => (
            <span className="skeleton-line skeleton-line-md" key={index} />
          ))}
        </div>
      </div>
      {/* Community overview skeleton is paused for now.
      <div className="bh-detail-skeleton-community">
        <span className="skeleton-line skeleton-line-section" />
        <span className="skeleton-line skeleton-line-description" />
      </div>
      */}
    </section>
  );
}

function ActivityPanel({
  activityNavigation,
  data,
  onActivityNavigationChange,
  onPublishFlow,
  onSaveFlowDraft,
  onUpdateFlow,
  onUploadFlowAsset,
}: {
  activityNavigation?: ActivityNavigationState;
  data: ProjectDetailData;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
  onPublishFlow?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onSaveFlowDraft?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onUpdateFlow?: (
    flowKey: string,
    payload: PromptFlowUpdatePayload,
  ) => Promise<PublishedFlowDetail>;
  onUploadFlowAsset?: (
    flowKey: string,
    file: File,
    altText?: string,
  ) => Promise<PublishedFlowAsset>;
}) {
  const [localActivityNavigation, setLocalActivityNavigation] =
    useState<ActivityNavigationState>(defaultActivityNavigation);
  const [promptSearchQuery, setPromptSearchQuery] = useState("");
  const [promptWorkTypeFilter, setPromptWorkTypeFilter] =
    useState<WorkTypeFilter>("all");
  const [sessionConversationSearchQuery, setSessionConversationSearchQuery] =
    useState("");
  const [sessionWorkTypeFilter, setSessionWorkTypeFilter] =
    useState<WorkTypeFilter>("all");
  const [shareScope, setShareScope] = useState<"project" | "session">("session");
  const [shareSessionId, setShareSessionId] = useState<string | null>(null);
  const [initialSharePromptIds, setInitialSharePromptIds] = useState<string[]>([]);
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
  const promptWorkTypeCounts = useMemo(
    () => workTypeCounts(data.promptActivities),
    [data.promptActivities],
  );
  const sessionWorkTypeCounts = useMemo(
    () => workTypeCounts(data.activities),
    [data.activities],
  );
  const filteredPromptActivities = useMemo(() => {
    const query = promptSearchQuery.trim().toLowerCase();

    return data.promptActivities.filter((activity) => {
      if (
        promptWorkTypeFilter !== "all" &&
        workTypeForFiles(activity.filesChanged) !== promptWorkTypeFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      return `${activity.prompt} ${activity.submittedAt}`
        .toLowerCase()
        .includes(query);
    });
  }, [data.promptActivities, promptSearchQuery, promptWorkTypeFilter]);
  const selectedPrompt =
    filteredPromptActivities.find((activity) => activity.id === selectedPromptId) ??
    filteredPromptActivities[0] ??
    null;
  const filteredSessions = useMemo(() => {
    if (sessionWorkTypeFilter === "all") {
      return data.activities;
    }

    return data.activities.filter(
      (activity) => workTypeForFiles(activity.filesChanged) === sessionWorkTypeFilter,
    );
  }, [data.activities, sessionWorkTypeFilter]);
  const selectedSession =
    filteredSessions.find((activity) => activity.id === selectedSessionId) ??
    filteredSessions[0] ??
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
  const shareSession =
    shareScope === "session"
      ? data.activities.find((activity) => activity.id === shareSessionId) ?? null
      : null;
  const projectSharePrompts = useMemo(
    () => [...data.promptActivities].sort(sortPromptsForSelection),
    [data.promptActivities],
  );
  const shareAvailablePrompts = useMemo(
    () =>
      shareScope === "project"
        ? projectSharePrompts
        : shareSession
        ? data.promptActivities
            .filter((activity) => activity.sessionId === shareSession.id)
            .sort(sortPromptsForSelection)
        : [],
    [data.promptActivities, projectSharePrompts, shareScope, shareSession],
  );
  const sessionForPrompt = (activity: PromptActivityItem) =>
    data.activities.find((session) => session.id === activity.sessionId) ?? null;
  const startProjectShareFromPrompt = (activity: PromptActivityItem) => {
    setShareScope("project");
    setShareSessionId(null);
    setInitialSharePromptIds([activity.id]);
    setIsShareDrawerOpen(true);
  };
  const startSessionShareFromPrompt = (activity: PromptActivityItem) => {
    const session = sessionForPrompt(activity);
    if (!session) {
      return;
    }
    setShareScope("session");
    setShareSessionId(session.id);
    setInitialSharePromptIds([activity.id]);
    setIsShareDrawerOpen(true);
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
    <div className="bh-activity-layout" data-view={view}>
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
            if (promptSessionTarget) {
              setSessionWorkTypeFilter("all");
            }
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
              <WorkTypeFilterControl
                ariaLabel="Filter prompts by activity type"
                counts={promptWorkTypeCounts}
                onChange={setPromptWorkTypeFilter}
                value={promptWorkTypeFilter}
              />

              <div className="bh-latest-prompt-list">
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
            </div>
            {/* Community sharing is paused for now; share handler intentionally omitted. */}
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
            <WorkTypeFilterControl
              ariaLabel="Filter sessions by activity type"
              counts={sessionWorkTypeCounts}
              onChange={setSessionWorkTypeFilter}
              value={sessionWorkTypeFilter}
            />
            <div className="bh-session-list">
              {filteredSessions.length > 0 ? (
                filteredSessions.map((activity) => (
                  <ActivityCard
                    activity={activity}
                    isSelected={activity.id === selectedSession?.id}
                    key={activity.id}
                    onOpen={() => {
                      const latestPromptInSession =
                        data.promptActivities
                          .filter((prompt) => prompt.sessionId === activity.id)
                          .sort(
                            (first, second) => second.sequence - first.sequence,
                          )[0] ?? null;
                      updateActivityNavigation({
                        selectedPromptId: null,
                        selectedSessionId: activity.id,
                        selectedSessionPromptId: latestPromptInSession?.id ?? null,
                        view: "sessions",
                      });
                      setSessionConversationSearchQuery("");
                    }}
                  />
                ))
              ) : (
                <div className="bh-prompt-search-empty">
                  No sessions match this filter.
                </div>
              )}
            </div>
          </div>

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
                    placeholder="Search conversations or dates"
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
                                selectedSessionId: selectedSession?.id ?? null,
                                selectedSessionPromptId: activity.id,
                                view: "sessions",
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

          {/* Community sharing is paused for now; share handler intentionally omitted. */}
          <PromptChangeDetail activity={selectedSessionPrompt} />
        </div>
      ) : (
        <EmptyState
          description="Session summaries will appear after AI activity is grouped."
          icon={Activity}
          title="No sessions yet"
        />
      )}

      {/* Community share drawer is paused for now.
      {isShareDrawerOpen &&
      (shareScope === "project" || shareSession) &&
      initialSharePromptIds.length > 0 ? (
        <PromptFlowShareDrawer
          availablePrompts={shareAvailablePrompts}
          data={data}
          initialPromptIds={initialSharePromptIds}
          onClose={() => setIsShareDrawerOpen(false)}
          onPublishFlow={onPublishFlow}
          onSaveFlowDraft={onSaveFlowDraft}
          onUpdateFlow={onUpdateFlow}
          onUploadFlowAsset={onUploadFlowAsset}
          scope={shareScope}
          session={shareSession}
        />
      ) : null}
      */}

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
          <p>Files captured from Promty collector events.</p>
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
        {data.repositoryFilesLoading && data.repositoryFiles.length === 0 ? (
          <div
            aria-busy="true"
            aria-label="Loading GitHub repository files"
            aria-live="polite"
            className="bh-repository-browser bh-repository-browser-skeleton"
            role="status"
          >
            <div className="bh-detail-skeleton-tree">
              {Array.from({ length: 10 }).map((_, index) => (
                <span
                  className={
                    index % 3 === 0
                      ? "skeleton-line skeleton-line-md"
                      : "skeleton-line skeleton-line-sm"
                  }
                  key={index}
                />
              ))}
            </div>
            <div className="bh-detail-skeleton-code">
              <span className="skeleton-line skeleton-line-title" />
              {Array.from({ length: 14 }).map((_, index) => (
                <span className="skeleton-line skeleton-code-line" key={index} />
              ))}
            </div>
          </div>
        ) : data.repositoryFiles.length > 0 ? (
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
  onGenerateSessionMemory,
  onPublishFlow,
  onSaveFlowDraft,
  onUpdateFlow,
  onUploadFlowAsset,
  onRepositoryFileSelect,
  onRetry,
  onTabChange,
}: {
  activityNavigation?: ActivityNavigationState;
  activeTab: ProjectDetailTabId;
  data: ProjectDetailData;
  errorMessage?: string | null;
  isLoading?: boolean;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
  onGenerateSessionMemory?: (sessionId: string) => Promise<void>;
  onPublishFlow?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onSaveFlowDraft?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onUpdateFlow?: (
    flowKey: string,
    payload: PromptFlowUpdatePayload,
  ) => Promise<PublishedFlowDetail>;
  onUploadFlowAsset?: (
    flowKey: string,
    file: File,
    altText?: string,
  ) => Promise<PublishedFlowAsset>;
  onRepositoryFileSelect?: (path: string) => void;
  onRetry?: () => void;
  onTabChange: (tabId: ProjectDetailTabId) => void;
}) {
  if (isLoading) {
    return <ProjectDetailLoadingSkeleton activeTab={activeTab} />;
  }

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

  if (activeTab === "overview") {
    return (
      <OverviewPanel
        data={data}
        onGenerateSessionMemory={onGenerateSessionMemory}
      />
    );
  }

  if (activeTab === "ai-activity") {
    return (
      <ActivityPanel
        activityNavigation={activityNavigation}
        data={data}
        onActivityNavigationChange={onActivityNavigationChange}
        onPublishFlow={onPublishFlow}
        onSaveFlowDraft={onSaveFlowDraft}
        onUpdateFlow={onUpdateFlow}
        onUploadFlowAsset={onUploadFlowAsset}
      />
    );
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
  isRefreshing,
  onActivityNavigationChange,
  onConnectRepository,
  onGenerateSessionMemory,
  onOpenAllProjects,
  onPublishFlow,
  onProjectSelect,
  onRepositoryFileSelect,
  onRetry,
  onSaveFlowDraft,
  onTabChange,
  onUpdateFlow,
  onUploadFlowAsset,
  projectOptions = [],
}: ProjectDetailPageProps) {
  return (
    <section
      className="bh-project-detail"
      data-active-tab={activeTab}
      aria-labelledby="project-detail-title"
    >
      <ProjectHeader
        description={data.project.description}
        name={data.project.name}
        onConnectRepository={data.project.repositoryUrl ? undefined : onConnectRepository}
        onOpenAllProjects={onOpenAllProjects}
        onProjectSelect={onProjectSelect}
        projectOptions={projectOptions}
        repositoryStatus={data.project.repositoryStatus}
        repositoryUrl={data.project.repositoryUrl}
        selectedProjectId={data.project.id}
      />

      <ProjectTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        repositoryUrl={data.project.repositoryUrl}
        tabs={projectTabs}
      />

      <div
        aria-labelledby={`project-tab-${activeTab}`}
        aria-busy={isRefreshing || undefined}
        className="bh-project-panel loading-cascade"
        data-loading={isRefreshing ? "true" : undefined}
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
          onGenerateSessionMemory={onGenerateSessionMemory}
          onPublishFlow={onPublishFlow}
          onSaveFlowDraft={onSaveFlowDraft}
          onUpdateFlow={onUpdateFlow}
          onUploadFlowAsset={onUploadFlowAsset}
          onRepositoryFileSelect={onRepositoryFileSelect}
          onRetry={onRetry}
          onTabChange={onTabChange}
        />
      </div>
    </section>
  );
}
