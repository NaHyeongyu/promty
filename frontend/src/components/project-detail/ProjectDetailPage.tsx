import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  Activity,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Files,
  Folder,
  GitBranch,
  Globe2,
  ImagePlus,
  Link2,
  LockKeyhole,
  MessageSquare,
  Search,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { siGithub } from "simple-icons";
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
  ProjectMemoryArtifact,
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
  onSaveProjectMetadata?: (metadata: {
    slug?: string;
    tags?: string[];
    visibility?: "private" | "public";
  }) => Promise<void>;
  onSaveDescription?: (description: string) => Promise<void>;
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
  { id: "memory", label: "Memory" },
  { id: "ai-activity", label: "Activity" },
  { id: "files", label: "Files" },
];

function promptTitle(prompt: string) {
  return prompt.split(/\r?\n/)[0]?.trim().replace(/\s+/g, " ") || "Prompt flow";
}

const githubRemoteCommand = "git remote add origin https://github.com/OWNER/REPO.git";

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

function overviewCompactNumber(value: number) {
  return Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function statisticDeltaParts(delta: string | undefined) {
  if (!delta) {
    return null;
  }

  const [value, ...labelParts] = delta.split(" ");
  const label = labelParts.join(" ");
  return {
    label,
    value,
  };
}

function statisticNumericValue(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const normalizedValue = value.trim().replace(/,/g, "");
  const match = normalizedValue.match(/^([+-]?\d+(?:\.\d+)?)([kmb])?/i);
  if (!match) {
    return 0;
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === "b"
      ? 1_000_000_000
      : suffix === "m"
        ? 1_000_000
        : suffix === "k"
          ? 1_000
          : 1;
  return amount * multiplier;
}

function statisticSparklinePoints(value: string, delta: string | undefined) {
  const currentValue = Math.max(0, statisticNumericValue(value));
  const deltaValue = Math.max(0, statisticNumericValue(delta?.split(" ")[0]));

  if (currentValue === 0 && deltaValue === 0) {
    return [0, 0, 0, 0, 0, 0, 0];
  }

  const trendUnit =
    deltaValue > 0 ? deltaValue : Math.max(1, Math.round(currentValue * 0.08));
  const startValue = Math.max(0, currentValue - trendUnit * 2);
  return [
    startValue,
    startValue + trendUnit * 0.28,
    startValue + trendUnit * 0.18,
    startValue + trendUnit * 0.62,
    startValue + trendUnit * 0.52,
    startValue + trendUnit * 0.86,
    currentValue,
  ];
}

function sparklinePointCoordinates(points: number[]) {
  const width = 96;
  const height = 28;
  const maxValue = Math.max(...points, 1);
  const minValue = Math.min(...points);
  const range = Math.max(maxValue - minValue, 1);

  return points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width;
    const y = height - ((point - minValue) / range) * (height - 4) - 2;
    return [x, y] as const;
  });
}

function SparklineChart({
  points,
  type,
}: {
  points: number[];
  type: "bar" | "line";
}) {
  const coordinates = sparklinePointCoordinates(points);
  const linePath = coordinates
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L 96 30 L 0 30 Z`;
  const maxValue = Math.max(...points, 1);

  return (
    <svg
      aria-hidden="true"
      className="bh-overview-stat-sparkline"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 96 30"
    >
      {type === "bar" ? (
        points.map((point, index) => {
          const barHeight = Math.max(3, (point / maxValue) * 24);
          return (
            <rect
              height={barHeight}
              key={`${point}-${index}`}
              rx="1.5"
              width="7"
              x={index * 14 + 2}
              y={28 - barHeight}
            />
          );
        })
      ) : (
        <>
          <path className="bh-overview-stat-sparkline-area" d={areaPath} />
          <path className="bh-overview-stat-sparkline-line" d={linePath} />
        </>
      )}
    </svg>
  );
}

function projectTagsFromInput(value: string) {
  const tags = new Set<string>();
  for (const tag of value.split(",")) {
    const normalizedTag = tag.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalizedTag) {
      continue;
    }
    tags.add(normalizedTag.slice(0, 40));
    if (tags.size >= 12) {
      break;
    }
  }
  return Array.from(tags);
}

function projectVisibilityFromValue(value: string | undefined): "private" | "public" {
  return value?.toLowerCase() === "public" ? "public" : "private";
}

type OverviewEditorKind = "project" | "description";

const OVERVIEW_EDIT_DRAWER_ANIMATION_MS = 200;

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

function PlainDescriptionContent({
  emptyLabel,
  value,
}: {
  emptyLabel: string;
  value: string;
}) {
  const trimmedValue = value.trim();

  return (
    <div
      className={`bh-plain-description${trimmedValue ? "" : " is-empty"}`}
    >
      {trimmedValue || emptyLabel}
    </div>
  );
}

function OverviewPanel({
  data,
  onOpenMemory,
  onSaveDescription,
  onSaveProjectMetadata,
}: {
  data: ProjectDetailData;
  onOpenMemory?: () => void;
  onSaveDescription?: (description: string) => Promise<void>;
  onSaveProjectMetadata?: (metadata: {
    slug?: string;
    tags?: string[];
    visibility?: "private" | "public";
  }) => Promise<void>;
}) {
  const overviewEditDrawerRef = useRef<HTMLElement | null>(null);
  const overviewEditCloseTimerRef = useRef<number | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState(data.project.description);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [isDescriptionSaving, setIsDescriptionSaving] = useState(false);
  const [isProjectMetadataEditing, setIsProjectMetadataEditing] = useState(false);
  const [isProjectMetadataSaving, setIsProjectMetadataSaving] = useState(false);
  const [projectMetadataError, setProjectMetadataError] = useState<string | null>(null);
  const [projectSlugDraft, setProjectSlugDraft] = useState(data.project.slug ?? data.project.id);
  const [projectTagsDraft, setProjectTagsDraft] = useState(
    data.project.tags.join(", "),
  );
  const [projectVisibilityDraft, setProjectVisibilityDraft] = useState<
    "private" | "public"
  >(projectVisibilityFromValue(data.project.visibility));
  const [closingOverviewEditor, setClosingOverviewEditor] =
    useState<OverviewEditorKind | null>(null);
  const isProjectMetadataDrawerVisible =
    isProjectMetadataEditing || closingOverviewEditor === "project";
  const isDescriptionDrawerVisible =
    isDescriptionEditing || closingOverviewEditor === "description";
  const isOverviewDrawerOpen =
    isProjectMetadataDrawerVisible || isDescriptionDrawerVisible;

  useEffect(() => {
    setDescriptionDraft(data.project.description);
    setDescriptionError(null);
  }, [data.project.description, data.project.id]);

  useEffect(() => {
    setProjectSlugDraft(data.project.slug ?? data.project.id);
    setProjectTagsDraft(data.project.tags.join(", "));
    setProjectVisibilityDraft(projectVisibilityFromValue(data.project.visibility));
    setProjectMetadataError(null);
  }, [data.project.id, data.project.slug, data.project.tags, data.project.visibility]);

  useEffect(() => {
    if (overviewEditCloseTimerRef.current !== null) {
      window.clearTimeout(overviewEditCloseTimerRef.current);
      overviewEditCloseTimerRef.current = null;
    }
    setClosingOverviewEditor(null);
    setIsDescriptionEditing(false);
    setIsProjectMetadataEditing(false);
  }, [data.project.id]);

  useEffect(() => {
    if (!isOverviewDrawerOpen) {
      return;
    }

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";

    const focusTimer = window.setTimeout(() => {
      overviewEditDrawerRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      previousActiveElement?.focus({ preventScroll: true });
    };
  }, [isOverviewDrawerOpen]);

  useEffect(
    () => () => {
      if (overviewEditCloseTimerRef.current !== null) {
        window.clearTimeout(overviewEditCloseTimerRef.current);
      }
    },
    [],
  );

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
  const aiModelsItem = overviewItems.get("AI Models");
  const lastActivityItem = overviewItems.get("Last Activity");
  const repositoryConnectedItem = overviewItems.get("Repository Connected");
  const visibilityItem = overviewItems.get("Visibility");
  const filesChanged = data.activities.reduce(
    (total, activity) => total + activity.filesChanged,
    0,
  );
  const statisticItems = [
    {
      chart: "line" as const,
      delta: overviewItems.get("Sessions Added")?.value,
      label: "Sessions",
      tone: "sessions",
      value: overviewItems.get("Sessions")?.value ?? "0",
    },
    {
      chart: "line" as const,
      delta: overviewItems.get("Prompts Added")?.value,
      label: "Prompts",
      tone: "prompts",
      value: overviewItems.get("Prompts")?.value ?? "0",
    },
    {
      chart: "line" as const,
      delta: overviewItems.get("Files Changed Added")?.value,
      label: "Files changed",
      tone: "files",
      value: overviewCompactNumber(filesChanged),
    },
    {
      chart: "line" as const,
      delta: overviewItems.get("Memory Added")?.value,
      label: "Memory",
      tone: "memory",
      value: overviewCompactNumber(data.memory.totalArtifacts),
    },
    // Community publishing is paused for now.
    // {
    //   label: "Published Prompts",
    //   value: overviewCompactNumber(data.community.publishedFlows),
    // },
  ];
  const renderedStatisticItems = statisticItems.map((item) => ({
    ...item,
    deltaParts: statisticDeltaParts(item.delta),
    sparklinePoints: statisticSparklinePoints(item.value, item.delta),
  }));
  const projectAiModelNames =
    aiModelsItem?.value && aiModelsItem.value !== "Not captured"
      ? aiModelsItem.value.split(",").map((model) => model.trim()).filter(Boolean)
      : [];
  const projectTagDraftItems = projectTagsFromInput(projectTagsDraft);
  const rawDescriptionValue = data.project.description.trim();
  const latestActivity = data.activities[0] ?? null;
  const latestMemoryArtifact = data.memory.recentArtifacts[0] ?? null;
  const repositoryConnected = repositoryConnectedItem?.value === "Connected";
  const repositoryStatusText = repositoryConnected
    ? "Connected"
    : data.project.repositoryStatus?.replace(/^Repository\s+/i, "") || "Not connected";
  const projectVisibility = projectVisibilityFromValue(
    data.project.visibility ?? visibilityItem?.value,
  );
  const lastActivityDisplay =
    lastActivityItem?.description && lastActivityItem.description !== "No activity"
      ? lastActivityItem.description
      : lastActivityItem?.value ?? latestActivity?.lastActivity ?? "No activity";
  const canEditDescription = Boolean(onSaveDescription);
  const canEditProjectMetadata = Boolean(onSaveProjectMetadata);
  const clearOverviewEditCloseTimer = () => {
    if (overviewEditCloseTimerRef.current !== null) {
      window.clearTimeout(overviewEditCloseTimerRef.current);
      overviewEditCloseTimerRef.current = null;
    }
  };
  const resetProjectMetadataDraft = () => {
    setProjectSlugDraft(data.project.slug ?? data.project.id);
    setProjectTagsDraft(data.project.tags.join(", "));
    setProjectVisibilityDraft(projectVisibilityFromValue(data.project.visibility));
    setProjectMetadataError(null);
  };
  const resetDescriptionDraft = () => {
    setDescriptionDraft(rawDescriptionValue);
    setDescriptionError(null);
  };
  const completeOverviewEditorClose = (editor: OverviewEditorKind) => {
    if (editor === "project") {
      resetProjectMetadataDraft();
      setIsProjectMetadataEditing(false);
    } else {
      resetDescriptionDraft();
      setIsDescriptionEditing(false);
    }
    setClosingOverviewEditor((currentEditor) =>
      currentEditor === editor ? null : currentEditor,
    );
    overviewEditCloseTimerRef.current = null;
  };
  const closeOverviewEditorWithAnimation = (editor: OverviewEditorKind) => {
    clearOverviewEditCloseTimer();
    setClosingOverviewEditor(editor);
    overviewEditCloseTimerRef.current = window.setTimeout(() => {
      completeOverviewEditorClose(editor);
    }, OVERVIEW_EDIT_DRAWER_ANIMATION_MS);
  };
  const openProjectMetadataEditor = () => {
    clearOverviewEditCloseTimer();
    setClosingOverviewEditor(null);
    resetProjectMetadataDraft();
    setIsDescriptionEditing(false);
    setIsProjectMetadataEditing(true);
  };
  const closeProjectMetadataEditor = () => {
    closeOverviewEditorWithAnimation("project");
  };
  const openDescriptionEditor = () => {
    clearOverviewEditCloseTimer();
    setClosingOverviewEditor(null);
    resetDescriptionDraft();
    setIsProjectMetadataEditing(false);
    setIsDescriptionEditing(true);
  };
  const closeDescriptionEditor = () => {
    closeOverviewEditorWithAnimation("description");
  };
  const saveDescription = async (nextDescription: string) => {
    if (!onSaveDescription || isDescriptionSaving) {
      return;
    }

    setDescriptionError(null);
    setIsDescriptionSaving(true);
    try {
      await onSaveDescription(nextDescription);
      closeDescriptionEditor();
    } catch (error) {
      setDescriptionError(
        error instanceof Error ? error.message : "Description could not be saved",
      );
    } finally {
      setIsDescriptionSaving(false);
    }
  };
  const saveProjectMetadata = async (tagInput = projectTagsDraft) => {
    if (!onSaveProjectMetadata || isProjectMetadataSaving) {
      return;
    }

    setProjectMetadataError(null);
    setIsProjectMetadataSaving(true);
    try {
      await onSaveProjectMetadata({
        slug: projectSlugDraft,
        tags: projectTagsFromInput(tagInput),
        visibility: projectVisibilityDraft,
      });
      closeProjectMetadataEditor();
    } catch (error) {
      setProjectMetadataError(
        error instanceof Error ? error.message : "Project metadata could not be saved",
      );
    } finally {
      setIsProjectMetadataSaving(false);
    }
  };
  const handleOverviewDrawerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (isProjectMetadataSaving || isDescriptionSaving) {
        return;
      }
      if (isProjectMetadataEditing) {
        closeProjectMetadataEditor();
      } else {
        closeDescriptionEditor();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const drawerElement = overviewEditDrawerRef.current;
    if (!drawerElement) {
      return;
    }

    const focusableElements = focusableModalElements(drawerElement);
    if (focusableElements.length === 0) {
      event.preventDefault();
      drawerElement.focus({ preventScroll: true });
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
    <div className="bh-overview-dashboard">
      <section className="bh-overview-statistics" aria-label="Project statistics">
        <dl>
          {renderedStatisticItems.map((item) => (
            <div
              className="bh-overview-stat-card"
              data-tone={item.tone}
              key={item.label}
            >
              <div className="bh-overview-stat-copy">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
                {item.deltaParts ? (
                  <span className="bh-overview-statistics-change">
                    <strong>{item.deltaParts.value}</strong>
                    {item.deltaParts.label ? (
                      <small>{item.deltaParts.label}</small>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <SparklineChart points={item.sparklinePoints} type={item.chart} />
            </div>
          ))}
        </dl>
      </section>

      <div className="bh-overview-detail-grid">
        <section
          className="bh-overview-card bh-overview-card-repository"
          aria-labelledby="project-repository-title"
        >
          <div className="bh-overview-card-header">
            <h2 id="project-repository-title">
              <Folder aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>Project</span>
            </h2>
            {canEditProjectMetadata ? (
              <button
                className="bh-overview-card-action"
                onClick={openProjectMetadataEditor}
                type="button"
              >
                Edit
              </button>
            ) : null}
          </div>

          <div className="bh-project-context-layout">
            <div className="bh-project-context-links" aria-label="Project links">
              <div className="bh-project-context-link-field">
                <span className="bh-project-context-link-label">Project URL</span>
                {projectUrlItem ? (
                  <a
                    className="bh-project-context-link"
                    href={projectUrlItem.href ?? projectUrlItem.value}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="bh-project-context-link-icon">
                      <Link2 aria-hidden="true" size={16} strokeWidth={1.5} />
                    </span>
                    <span className="bh-project-context-link-value">
                      {projectUrlItem.value}
                    </span>
                    <ExternalLink aria-hidden="true" size={16} strokeWidth={1.5} />
                  </a>
                ) : (
                  <span className="bh-project-context-link is-disabled">
                    <span className="bh-project-context-link-icon">
                      <Link2 aria-hidden="true" size={16} strokeWidth={1.5} />
                    </span>
                    <span className="bh-project-context-link-value">Not available</span>
                  </span>
                )}
              </div>

              <div className="bh-project-context-link-field">
                <span className="bh-project-context-link-label">GitHub URL</span>
                {repositoryUrlItem?.href ? (
                  <a
                    className="bh-project-context-link"
                    href={repositoryUrlItem.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span
                      className="bh-project-context-link-icon"
                      data-kind="github"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d={siGithub.path} />
                      </svg>
                    </span>
                    <span className="bh-project-context-link-value">
                      {repositoryUrlItem.value}
                    </span>
                    <ExternalLink aria-hidden="true" size={16} strokeWidth={1.5} />
                  </a>
                ) : (
                  <span className="bh-project-context-link is-disabled">
                    <span
                      className="bh-project-context-link-icon"
                      data-kind="github"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d={siGithub.path} />
                      </svg>
                    </span>
                    <span className="bh-project-context-link-value">
                      {repositoryUrlItem?.value ?? "Not connected"}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="bh-overview-card-divider" />

            <div className="bh-project-context-grid">
              <section className="bh-project-context-section" aria-label="Repository">
                <h3>Repository</h3>
                <div className="bh-project-summary-strip">
                  <span data-state={repositoryConnected ? "connected" : "idle"}>
                    <i aria-hidden="true" />
                    <strong>Status</strong>
                    {repositoryStatusText}
                  </span>
                  <span>
                    {projectVisibility === "public" ? (
                      <Globe2 aria-hidden="true" size={16} strokeWidth={1.5} />
                    ) : (
                      <LockKeyhole aria-hidden="true" size={16} strokeWidth={1.5} />
                    )}
                    {visibilityItem?.value ?? "Private"}
                  </span>
                </div>
              </section>

              <section className="bh-project-context-section" aria-label="AI context">
                <h3>AI Context</h3>
                <div className="bh-overview-model-badge-list">
                  {projectAiModelNames.length > 0 ? (
                    projectAiModelNames.map((model) => (
                      <AiModelBadge className="is-compact" key={model} model={model} />
                    ))
                  ) : (
                    <span className="ai-model-badge is-muted">No models captured</span>
                  )}
                </div>
              </section>

              <section className="bh-project-context-section" aria-label="Project tags">
                <h3>Tags</h3>
                {data.project.tags.length > 0 ? (
                  <div className="bh-project-tag-list">
                    {data.project.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : (
                  <span className="bh-project-profile-empty">No tags</span>
                )}
              </section>

              <section
                className="bh-project-context-section"
                aria-label="Last activity"
              >
                <h3>Last Activity</h3>
                <p title={lastActivityItem?.value ?? undefined}>
                  {lastActivityDisplay}
                </p>
              </section>
            </div>
          </div>
        </section>

        <section
          className="bh-overview-card bh-overview-card-description"
          aria-labelledby="project-description-title"
        >
          <div className="bh-overview-card-header">
            <h2 id="project-description-title">
              <FileText aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>Description</span>
            </h2>
            {canEditDescription ? (
              <button
                className="bh-overview-card-action"
                onClick={openDescriptionEditor}
                type="button"
              >
                Edit
              </button>
            ) : null}
          </div>
          <PlainDescriptionContent
            emptyLabel="Not provided"
            value={rawDescriptionValue || descriptionItem?.value.trim() || ""}
          />
        </section>

        <section
          className="bh-overview-card bh-overview-card-latest-memory"
          aria-labelledby="project-latest-memory-title"
        >
          <div className="bh-overview-card-header">
            <h2 id="project-latest-memory-title">
              <span>Latest Memory</span>
            </h2>
            {onOpenMemory ? (
              <button
                className="bh-overview-card-action"
                onClick={onOpenMemory}
                type="button"
              >
                View all
              </button>
            ) : null}
          </div>

          {latestMemoryArtifact ? (
            <article className="bh-overview-latest-memory-row">
              <span className="bh-overview-latest-memory-icon">
                <Sparkles aria-hidden="true" size={20} strokeWidth={1.5} />
              </span>
              <div>
                <strong>{latestMemoryArtifact.title}</strong>
                {latestMemoryArtifact.summary ? (
                  <p>{latestMemoryArtifact.summary}</p>
                ) : null}
                <div className="bh-overview-latest-memory-meta">
                  {latestMemoryArtifact.promptCount ? (
                    <span>
                      <MessageSquare aria-hidden="true" size={16} strokeWidth={1.5} />
                      {latestMemoryArtifact.promptCount} prompts
                    </span>
                  ) : null}
                  <span>
                    <Files aria-hidden="true" size={16} strokeWidth={1.5} />
                    {latestMemoryArtifact.changedFileCount} files
                  </span>
                </div>
              </div>
              <time>
                {latestMemoryArtifact.updatedAt ??
                  latestMemoryArtifact.createdAt ??
                  data.memory.latestArtifactAt ??
                  "Unknown"}
              </time>
            </article>
          ) : (
            <div className="bh-overview-latest-memory-empty">
              <strong>No memory yet</strong>
              <span>
                Latest generated memory will appear after a completed AI session.
              </span>
            </div>
          )}
        </section>
      </div>

      {isProjectMetadataDrawerVisible ? (
        <div
          className="bh-overview-edit-overlay"
          data-state={closingOverviewEditor === "project" ? "closing" : "open"}
          role="presentation"
        >
          <section
            aria-labelledby="project-edit-drawer-title"
            aria-modal="true"
            className="bh-overview-edit-drawer"
            data-state={closingOverviewEditor === "project" ? "closing" : "open"}
            onKeyDown={handleOverviewDrawerKeyDown}
            ref={overviewEditDrawerRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="bh-overview-edit-drawer-header">
              <div>
                <span>Project</span>
                <h2 id="project-edit-drawer-title">Edit project</h2>
              </div>
              <button
                aria-label="Close project editor"
                className="bh-icon-button"
                disabled={isProjectMetadataSaving}
                onClick={closeProjectMetadataEditor}
                type="button"
              >
                <X aria-hidden="true" size={16} strokeWidth={1.5} />
              </button>
            </div>
            <form
              className="bh-overview-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveProjectMetadata();
              }}
            >
              <label>
                <span>Project URL</span>
                <input
                  maxLength={255}
                  onChange={(event) => setProjectSlugDraft(event.target.value)}
                  placeholder="project-url"
                  value={projectSlugDraft}
                />
              </label>
              {repositoryUrlItem?.href ? (
                <div className="bh-overview-edit-readonly">
                  <span>GitHub URL</span>
                  <a href={repositoryUrlItem.href} rel="noreferrer" target="_blank">
                    <span className="bh-project-link-chip-icon" data-kind="github">
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d={siGithub.path} />
                      </svg>
                    </span>
                    <span>{repositoryUrlItem.value}</span>
                    <ExternalLink aria-hidden="true" size={16} strokeWidth={1.5} />
                  </a>
                </div>
              ) : null}
              <label>
                <span>Tags</span>
                <input
                  onChange={(event) => setProjectTagsDraft(event.target.value)}
                  placeholder="frontend, dashboard, ai"
                  value={projectTagsDraft}
                />
              </label>
              {projectTagDraftItems.length > 0 ? (
                <div className="bh-project-tag-list">
                  {projectTagDraftItems.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : (
                <span className="bh-project-profile-empty">No tags</span>
              )}
              <fieldset className="bh-overview-edit-field">
                <legend>Visibility</legend>
                <div
                  aria-label="Project visibility"
                  className="bh-project-visibility"
                  role="radiogroup"
                >
                  {(["private", "public"] as const).map((option) => (
                    <button
                      aria-checked={projectVisibilityDraft === option}
                      className="bh-project-visibility-option"
                      data-active={projectVisibilityDraft === option}
                      key={option}
                      onClick={() => setProjectVisibilityDraft(option)}
                      role="radio"
                      type="button"
                    >
                      {option === "private" ? (
                        <LockKeyhole aria-hidden="true" size={16} strokeWidth={1.5} />
                      ) : (
                        <Globe2 aria-hidden="true" size={16} strokeWidth={1.5} />
                      )}
                      {option === "private" ? "Private" : "Public"}
                    </button>
                  ))}
                </div>
              </fieldset>
              {projectMetadataError ? (
                <p className="bh-description-editor-error">{projectMetadataError}</p>
              ) : null}
              <div className="bh-overview-edit-actions">
                <button
                  disabled={isProjectMetadataSaving}
                  type="button"
                  onClick={closeProjectMetadataEditor}
                >
                  Cancel
                </button>
                <button
                  disabled={isProjectMetadataSaving || projectTagsDraft.trim().length === 0}
                  type="button"
                  onClick={() => {
                    setProjectTagsDraft("");
                    void saveProjectMetadata("");
                  }}
                >
                  Clear tags
                </button>
                <button disabled={isProjectMetadataSaving} type="submit">
                  {isProjectMetadataSaving ? "Saving" : "Save"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isDescriptionDrawerVisible ? (
        <div
          className="bh-overview-edit-overlay"
          data-state={closingOverviewEditor === "description" ? "closing" : "open"}
          role="presentation"
        >
          <section
            aria-labelledby="description-edit-drawer-title"
            aria-modal="true"
            className="bh-overview-edit-drawer is-wide"
            data-state={closingOverviewEditor === "description" ? "closing" : "open"}
            onKeyDown={handleOverviewDrawerKeyDown}
            ref={overviewEditDrawerRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="bh-overview-edit-drawer-header">
              <div>
                <span>Description</span>
                <h2 id="description-edit-drawer-title">Edit description</h2>
              </div>
              <button
                aria-label="Close description editor"
                className="bh-icon-button"
                disabled={isDescriptionSaving}
                onClick={closeDescriptionEditor}
                type="button"
              >
                <X aria-hidden="true" size={16} strokeWidth={1.5} />
              </button>
            </div>
            <form
              className="bh-overview-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveDescription(descriptionDraft);
              }}
            >
              <div className="bh-description-editor-header">
                <span>Plain text</span>
                <span>{descriptionDraft.length}/2000</span>
              </div>
              <textarea
                aria-label="Project description"
                className="bh-description-plain-editor"
                maxLength={2000}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                placeholder="Write a short project introduction."
                value={descriptionDraft}
              />
              {descriptionError ? (
                <p className="bh-description-editor-error">{descriptionError}</p>
              ) : null}
              <div className="bh-overview-edit-actions">
                <button
                  disabled={isDescriptionSaving}
                  type="button"
                  onClick={closeDescriptionEditor}
                >
                  Cancel
                </button>
                <button
                  disabled={isDescriptionSaving || !rawDescriptionValue}
                  type="button"
                  onClick={() => {
                    setDescriptionDraft("");
                    void saveDescription("");
                  }}
                >
                  Delete
                </button>
                <button disabled={isDescriptionSaving} type="submit">
                  {isDescriptionSaving ? "Saving" : "Save"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function memoryArtifactSearchText(artifact: ProjectMemoryArtifact) {
  return [
    artifact.title,
    artifact.summary,
    artifact.reason,
    artifact.outcome,
    artifact.generator,
    artifact.model,
    artifact.commitSha,
    artifact.memoryScope,
    artifact.windowReason,
    ...artifact.tags,
    ...artifact.technologies,
    ...artifact.changedFiles.map((file) => file.path),
    ...artifact.sections.flatMap((section) => [section.title, section.summary]),
    ...artifact.versions.flatMap((version) => [
      version.title,
      version.summary,
      version.reason,
      version.outcome,
      version.generator,
      version.model,
      version.commitSha,
      version.memoryScope,
      version.windowReason,
      ...version.tags,
      ...version.technologies,
      ...version.changedFiles.map((file) => file.path),
      ...version.sections.flatMap((section) => [section.title, section.summary]),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function memoryWindowReasonLabel(reason: string | null) {
  if (reason === "prompt_count") {
    return "Prompt window";
  }
  if (reason === "time_window") {
    return "Time window";
  }
  if (reason === "session_finalized") {
    return "Session final";
  }
  return "Memory";
}

function memoryWindowLabel(
  promptCount: number | null,
  windowReason: string | null,
  sliceIndex: number | null,
) {
  const parts = [];
  if (sliceIndex) {
    parts.push(`Slice ${sliceIndex}`);
  }
  if (promptCount) {
    parts.push(`${promptCount} prompts`);
  }
  parts.push(memoryWindowReasonLabel(windowReason));
  return parts.join(" · ");
}

function MemoryPanel({
  data,
  onGenerateSessionMemory,
}: {
  data: ProjectDetailData;
  onGenerateSessionMemory?: (sessionId: string) => Promise<void>;
}) {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    data.memory.recentArtifacts[0]?.id ?? null,
  );
  const [selectedVersionIds, setSelectedVersionIds] = useState<
    Record<string, string>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isGeneratingMemory, setIsGeneratingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const latestActivity = data.activities[0] ?? null;

  useEffect(() => {
    if (
      selectedArtifactId &&
      data.memory.recentArtifacts.some((artifact) => artifact.id === selectedArtifactId)
    ) {
      return;
    }
    setSelectedArtifactId(data.memory.recentArtifacts[0]?.id ?? null);
  }, [data.memory.recentArtifacts, selectedArtifactId]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredArtifacts = normalizedSearchQuery
    ? data.memory.recentArtifacts.filter((artifact) =>
        memoryArtifactSearchText(artifact).includes(normalizedSearchQuery),
      )
    : data.memory.recentArtifacts;
  const selectedArtifact =
    filteredArtifacts.find((artifact) => artifact.id === selectedArtifactId) ??
    filteredArtifacts[0] ??
    null;
  const selectedVersion =
    selectedArtifact?.versions.find(
      (version) => version.id === selectedVersionIds[selectedArtifact.id],
    ) ??
    selectedArtifact?.versions[0] ??
    null;
  const memoryStatusText =
    data.memory.latestArtifactAt
      ? `Last generated ${data.memory.latestArtifactAt}`
      : latestActivity
        ? "Waiting for the next closed prompt window"
        : "No completed AI sessions captured yet";

  const generateLatestMemory = () => {
    if (!latestActivity || !onGenerateSessionMemory) {
      return;
    }
    setIsGeneratingMemory(true);
    setMemoryError(null);
    void onGenerateSessionMemory(latestActivity.id)
      .catch((error) => {
        setMemoryError(
          error instanceof Error ? error.message : "Memory generation failed.",
        );
      })
      .finally(() => setIsGeneratingMemory(false));
  };

  const detailChangedFiles =
    selectedVersion?.changedFiles ?? selectedArtifact?.changedFiles ?? [];
  const detailCommitSha = selectedVersion?.commitSha ?? selectedArtifact?.commitSha ?? null;
  const detailGenerator = selectedVersion?.generator ?? selectedArtifact?.generator ?? null;
  const detailModel = selectedVersion?.model ?? selectedArtifact?.model ?? null;
  const detailOutcome = selectedVersion?.outcome ?? selectedArtifact?.outcome ?? null;
  const detailPromptCount =
    selectedVersion?.promptCount ?? selectedArtifact?.promptCount ?? null;
  const detailReason = selectedVersion?.reason ?? selectedArtifact?.reason ?? null;
  const detailSections = selectedVersion?.sections ?? selectedArtifact?.sections ?? [];
  const detailSessionId = selectedVersion?.sessionId ?? selectedArtifact?.sessionId ?? null;
  const detailSummary = selectedVersion?.summary ?? selectedArtifact?.summary ?? null;
  const detailTags = selectedVersion?.tags ?? selectedArtifact?.tags ?? [];
  const detailTechnologies =
    selectedVersion?.technologies ?? selectedArtifact?.technologies ?? [];
  const detailTimestamp =
    selectedVersion?.createdAt ??
    selectedArtifact?.updatedAt ??
    selectedArtifact?.createdAt ??
    null;
  const detailTitle = selectedVersion?.title ?? selectedArtifact?.title ?? "";
  const detailWindowReason =
    selectedVersion?.windowReason ?? selectedArtifact?.windowReason ?? null;
  const detailSliceIndex =
    selectedVersion?.sliceIndex ?? selectedArtifact?.sliceIndex ?? null;
  const selectedVersionNumber = selectedVersion?.version ?? null;

  return (
    <section className="bh-memory-workspace" aria-labelledby="project-memory-workspace-title">
      <header className="bh-memory-toolbar">
        <div>
          <h2 id="project-memory-workspace-title">Project Memory</h2>
          <p>
            {data.memory.totalArtifacts} artifacts · {memoryStatusText}
          </p>
        </div>
        <div className="bh-memory-toolbar-actions">
          <span>Automatic by prompt count or time window</span>
          <button
            className="bh-overview-primary-button"
            disabled={!latestActivity || isGeneratingMemory || !onGenerateSessionMemory}
            onClick={generateLatestMemory}
            type="button"
          >
            {isGeneratingMemory ? "Refreshing" : "Refresh Memory"}
          </button>
        </div>
      </header>

      {memoryError ? <div className="bh-overview-memory-error">{memoryError}</div> : null}

      {data.memory.recentArtifacts.length > 0 ? (
        <div className="bh-memory-layout">
          <aside className="bh-memory-sidebar" aria-label="Memory artifacts">
            <label className="bh-prompt-search">
              <Search aria-hidden="true" size={15} strokeWidth={1.8} />
              <input
                aria-label="Search memory artifacts"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search memory"
                type="search"
                value={searchQuery}
              />
            </label>

            <div className="bh-memory-artifact-list">
              {filteredArtifacts.length > 0 ? (
                filteredArtifacts.map((artifact) => (
                  <button
                    className="bh-memory-artifact-row"
                    data-selected={artifact.id === selectedArtifact?.id}
                    key={artifact.id}
                    onClick={() => setSelectedArtifactId(artifact.id)}
                    type="button"
                  >
                    <strong>{artifact.title}</strong>
                    {artifact.summary ? <span>{artifact.summary}</span> : null}
                    <small>
                      {artifact.updatedAt ?? artifact.createdAt ?? "Unknown"} ·{" "}
                      {artifact.promptCount ? `${artifact.promptCount} prompts · ` : ""}
                      {artifact.changedFileCount} files
                      {artifact.versions[0]?.version
                        ? ` · v${artifact.versions[0].version}`
                        : ""}
                    </small>
                  </button>
                ))
              ) : (
                <div className="bh-prompt-search-empty">
                  No memory artifacts match this search.
                </div>
              )}
            </div>
          </aside>

          {selectedArtifact ? (
            <article className="bh-memory-detail">
              <header className="bh-memory-detail-header">
                <div>
                  <span>
                    AI Memory Artifact
                    {selectedVersionNumber ? ` · v${selectedVersionNumber}` : ""}
                  </span>
                  <h3>{detailTitle}</h3>
                </div>
                <dl>
                  <div>
                    <dt>Generator</dt>
                    <dd>{detailGenerator ?? "Unknown"}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{detailModel ?? "Unknown"}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{detailTimestamp ?? "Unknown"}</dd>
                  </div>
                </dl>
              </header>

              {selectedArtifact.versions.length > 0 ? (
                <section className="bh-memory-detail-section">
                  <div className="bh-memory-version-heading">
                    <h4>Version History</h4>
                    <span>{selectedArtifact.versions.length} saved</span>
                  </div>
                  <div className="bh-memory-version-list">
                    {selectedArtifact.versions.map((version) => (
                      <button
                        aria-pressed={version.id === selectedVersion?.id}
                        className="bh-memory-version-row"
                        data-current={version.id === selectedArtifact.versions[0]?.id}
                        data-selected={version.id === selectedVersion?.id}
                        key={version.id}
                        onClick={() =>
                          setSelectedVersionIds((currentVersions) => ({
                            ...currentVersions,
                            [selectedArtifact.id]: version.id,
                          }))
                        }
                        type="button"
                      >
                        <strong>
                          v{version.version}
                          {version.id === selectedArtifact.versions[0]?.id ? (
                            <span>Current</span>
                          ) : null}
                        </strong>
                        <small>
                          {version.createdAt ?? "Unknown"} ·{" "}
                          {version.promptCount ? `${version.promptCount} prompts · ` : ""}
                          {version.changedFileCount} files
                        </small>
                        {version.summary ? <p>{version.summary}</p> : null}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {detailSummary ? (
                <section className="bh-memory-detail-section">
                  <h4>Summary</h4>
                  <p>{detailSummary}</p>
                </section>
              ) : null}

              <div className="bh-memory-detail-grid">
                {detailReason ? (
                  <section className="bh-memory-detail-section">
                    <h4>Why</h4>
                    <p>{detailReason}</p>
                  </section>
                ) : null}
                {detailOutcome ? (
                  <section className="bh-memory-detail-section">
                    <h4>Outcome</h4>
                    <p>{detailOutcome}</p>
                  </section>
                ) : null}
              </div>

              {detailTechnologies.length > 0 ? (
                <section className="bh-memory-detail-section">
                  <h4>Technologies</h4>
                  <div className="bh-memory-chip-list">
                    {detailTechnologies.map((technology) => (
                      <span key={`${selectedArtifact.id}-${technology}`}>
                        {technology}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {detailSections.length > 0 ? (
                <section className="bh-memory-detail-section">
                  <h4>Generated Sections</h4>
                  <div className="bh-memory-section-list">
                    {detailSections.map((section) => (
                      <div key={`${selectedArtifact.id}-${section.title}`}>
                        <strong>{section.title}</strong>
                        <p>{section.summary}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {detailChangedFiles.length > 0 ? (
                <section className="bh-memory-detail-section">
                  <h4>Changed Files</h4>
                  <div className="bh-memory-file-list">
                    {detailChangedFiles.slice(0, 24).map((file) => (
                      <div key={`${selectedArtifact.id}-${file.path}`}>
                        <code>{file.path}</code>
                        <span>{file.status ?? "changed"}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <footer className="bh-memory-source">
                <span>
                  {memoryWindowLabel(
                    detailPromptCount,
                    detailWindowReason,
                    detailSliceIndex,
                  )}
                </span>
                <span>Session {detailSessionId ?? "Unknown"}</span>
                {detailCommitSha ? (
                  <span>Commit {detailCommitSha.slice(0, 12)}</span>
                ) : null}
                {detailTags.length > 0 ? (
                  <span>{detailTags.slice(0, 6).join(", ")}</span>
                ) : null}
              </footer>
            </article>
          ) : (
            <EmptyState
              description="Try a different search or refresh memory after the latest session completes."
              icon={BookOpen}
              title="No memory artifact selected"
            />
          )}
        </div>
      ) : (
        <EmptyState
          description="Promty creates memory automatically when a prompt or time window closes. Use refresh only when testing or retrying generation."
          icon={BookOpen}
          title="No memory artifacts yet"
        >
          {latestActivity && onGenerateSessionMemory ? (
            <button
              className="bh-empty-state-button"
              disabled={isGeneratingMemory}
              onClick={generateLatestMemory}
              type="button"
            >
              {isGeneratingMemory ? "Refreshing" : "Refresh Memory"}
            </button>
          ) : null}
        </EmptyState>
      )}
    </section>
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
        aria-label="Loading activity"
        aria-live="polite"
        className="bh-detail-skeleton bh-detail-skeleton-activity"
        role="status"
      >
        <div className="bh-activity-view-tabs bh-activity-view-tabs-skeleton">
          <span className="skeleton-pill skeleton-pill-action" />
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
  const [activityWorkTypeFilter, setActivityWorkTypeFilter] =
    useState<WorkTypeFilter>("all");
  const [sessionConversationSearchQuery, setSessionConversationSearchQuery] =
    useState("");
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
  const unfilteredActivityFeedItems = useMemo<ActivityFeedItem[]>(() => {
    const promptItems: ActivityFeedItem[] = data.promptActivities.map(
      (activity, index) => ({
        activity,
        key: `prompt-${activity.id}`,
        kind: "prompt",
        sequenceIndex: index,
        timestamp: promptSubmittedTime(activity),
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

            {/* Community sharing is paused for now; share handler intentionally omitted. */}
            <PromptChangeDetail activity={selectedSessionPrompt} />
          </>
        ) : (
          <>
            {/* Community sharing is paused for now; share handler intentionally omitted. */}
            <PromptChangeDetail activity={selectedPrompt} />
          </>
        )}
      </div>

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
  const isRepositoryLinked = Boolean(data.project.repositoryUrl);

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
        {!isRepositoryLinked ? (
          <GitHubRepositorySetupState />
        ) : data.repositoryFilesLoading && data.repositoryFiles.length === 0 ? (
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

function GitHubRepositorySetupState() {
  const [hasCopiedCommand, setHasCopiedCommand] = useState(false);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(githubRemoteCommand);
      setHasCopiedCommand(true);
      window.setTimeout(() => setHasCopiedCommand(false), 1600);
    } catch {
      setHasCopiedCommand(false);
    }
  };

  return (
    <section className="bh-repository-setup" aria-labelledby="github-setup-title">
      <div className="bh-repository-setup-copy">
        <GitBranch aria-hidden="true" size={20} strokeWidth={1.5} />
        <div>
          <h3 id="github-setup-title">GitHub repository not linked</h3>
          <p>
            Add the GitHub remote in this project, then run repository setup again
            to attach source context.
          </p>
        </div>
      </div>
      <div className="bh-repository-command" aria-label="GitHub remote command">
        <code>{githubRemoteCommand}</code>
        <button
          aria-label={hasCopiedCommand ? "Copied command" : "Copy command"}
          onClick={copyCommand}
          title={hasCopiedCommand ? "Copied" : "Copy command"}
          type="button"
        >
          {hasCopiedCommand ? (
            <Check aria-hidden="true" size={16} strokeWidth={1.5} />
          ) : (
            <Copy aria-hidden="true" size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </section>
  );
}

function projectHeaderModelNames(data: ProjectDetailData) {
  const modelItem = data.overview.find((item) => item.title === "AI Models");
  if (!modelItem?.value || modelItem.value === "Not captured") {
    return [];
  }

  return modelItem.value
    .split(",")
    .map((modelName) => modelName.trim())
    .filter(Boolean);
}

function projectHeaderLastActivityLabel(data: ProjectDetailData) {
  const lastActivityItem = data.overview.find(
    (item) => item.title === "Last Activity",
  );

  if (!lastActivityItem) {
    return undefined;
  }

  if (
    lastActivityItem.description &&
    lastActivityItem.description !== "No activity"
  ) {
    return lastActivityItem.description;
  }

  return lastActivityItem.value !== "No activity"
    ? lastActivityItem.value
    : undefined;
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
  onSaveProjectMetadata,
  onSaveDescription,
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
  onSaveProjectMetadata?: (metadata: {
    slug?: string;
    tags?: string[];
    visibility?: "private" | "public";
  }) => Promise<void>;
  onSaveDescription?: (description: string) => Promise<void>;
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
        onOpenMemory={() => onTabChange("memory")}
        onSaveProjectMetadata={onSaveProjectMetadata}
        onSaveDescription={onSaveDescription}
      />
    );
  }

  if (activeTab === "memory") {
    return (
      <MemoryPanel
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
  onSaveProjectMetadata,
  onSaveDescription,
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
        lastActivityLabel={projectHeaderLastActivityLabel(data)}
        modelNames={projectHeaderModelNames(data)}
        name={data.project.name}
        onConnectRepository={data.project.repositoryUrl ? undefined : onConnectRepository}
        onOpenAllProjects={onOpenAllProjects}
        onProjectSelect={onProjectSelect}
        projectOptions={projectOptions}
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
          onSaveProjectMetadata={onSaveProjectMetadata}
          onSaveDescription={onSaveDescription}
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
