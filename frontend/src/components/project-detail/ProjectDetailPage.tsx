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
  isProjectResolving?: boolean;
  isLoading?: boolean;
  isRefreshing?: boolean;
  onActivityNavigationChange?: (state: ActivityNavigationState) => void;
  onConnectRepository?: () => void;
  onOpenAllProjects?: () => void;
  onProjectSelect?: (projectId: string) => void;
  onRepositoryFileSelect?: (path: string) => void;
  onSaveProjectMetadata?: (metadata: {
    slug?: string;
    tags?: string[];
    visibility?: "private" | "public";
  }) => Promise<void>;
  onSaveDescription?: (description: string) => Promise<void>;
  onCheckpointMemory?: (sessionIds: string[]) => Promise<MemoryCheckpointResult>;
  onSaveProjectMemory?: (bodyMarkdown: string) => Promise<void>;
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

type MemoryCheckpointResult = {
  message: string;
  status: "generation_failed" | "memory_generated" | "no_memory" | string;
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
  onSaveDescription,
  onSaveProjectMetadata,
}: {
  data: ProjectDetailData;
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
      delta: undefined,
      label: "Memories",
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

function memoryArtifactIsGenerated(artifact: ProjectMemoryArtifact) {
  return (
    (artifact.artifactStage === "generated_memory" &&
      artifact.reviewState === "generated") ||
    (artifact.artifactStage === "verified_memory" &&
      artifact.reviewState === "verified")
  );
}

function memoryTypeLabel(value: string | null) {
  if (!value) {
    return "Generated memory";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function memoryTriggerLabel(value: string | null) {
  if (value === "batch_organize" || value === "manual_checkpoint" || value === "checkpoint") {
    return "User batch";
  }
  if (value === "session_end") {
    return "Imported from older session-end policy";
  }
  if (value === "idle") {
    return "Imported from older idle policy";
  }
  if (value) {
    return `Batch result · ${value.replaceAll("_", " ")}`;
  }
  return "Batch result";
}

function memorySequenceLabel(artifact: ProjectMemoryArtifact) {
  if (artifact.startSequence !== null && artifact.endSequence !== null) {
    return `Events ${artifact.startSequence}-${artifact.endSequence}`;
  }
  if (artifact.promptCount !== null) {
    return `${artifact.promptCount} prompts`;
  }
  return "Event range not reported";
}

function MemoryArtifactSections({ artifact }: { artifact: ProjectMemoryArtifact }) {
  const orderedTitles = ["Summary", "Tasks", "Decisions", "Follow-ups"];
  const sections = [
    ...orderedTitles
      .map((title) => artifact.sections.find((section) => section.title === title))
      .filter((section): section is { summary: string; title: string } => Boolean(section)),
    ...artifact.sections.filter((section) => !orderedTitles.includes(section.title)),
  ];

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="bh-memory-structured-sections">
      {sections.map((section) => (
        <div key={section.title}>
          <strong>{section.title}</strong>
          <span>{section.summary}</span>
        </div>
      ))}
    </div>
  );
}

function MemoryPanel({
  data,
  onCheckpointMemory,
  onSaveProjectMemory,
}: {
  data: ProjectDetailData;
  onCheckpointMemory?: (sessionIds: string[]) => Promise<MemoryCheckpointResult>;
  onSaveProjectMemory?: (bodyMarkdown: string) => Promise<void>;
}) {
  const generatedMemories = data.memory.recentArtifacts.filter(memoryArtifactIsGenerated);
  const checkpointableRanges = data.memory.pendingRanges.filter(
    (range) => range.canCheckpoint,
  );
  const pendingPromptCount = data.memory.pendingRanges.reduce(
    (total, range) => total + range.promptCount,
    0,
  );
  const pendingEventCount = data.memory.pendingRanges.reduce(
    (total, range) => total + range.eventCount,
    0,
  );
  const pendingSessionCount = new Set(
    data.memory.pendingRanges.map((range) => range.sessionId),
  ).size;
  const [checkpointStatus, setCheckpointStatus] = useState<string | null>(null);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [isCheckpointing, setIsCheckpointing] = useState(false);
  const [isEditingProjectMemory, setIsEditingProjectMemory] = useState(false);
  const [isProjectMemorySaving, setIsProjectMemorySaving] = useState(false);
  const [projectMemoryDraft, setProjectMemoryDraft] = useState(
    data.memory.projectMemory?.bodyMarkdown ?? "",
  );
  const [projectMemoryError, setProjectMemoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditingProjectMemory) {
      setProjectMemoryDraft(data.memory.projectMemory?.bodyMarkdown ?? "");
    }
  }, [data.memory.projectMemory?.bodyMarkdown, isEditingProjectMemory]);

  const organizePendingBatch = async () => {
    if (!onCheckpointMemory || isCheckpointing) {
      return;
    }
    const sessionIds = checkpointableRanges.map((range) => range.sessionId);
    if (sessionIds.length === 0) {
      return;
    }

    setIsCheckpointing(true);
    setCheckpointError(null);
    setCheckpointStatus(null);
    try {
      const result = await onCheckpointMemory(sessionIds);
      setCheckpointStatus(result.message);
    } catch (error) {
      setCheckpointError(
        error instanceof Error ? error.message : "Pending Memory organization failed.",
      );
    } finally {
      setIsCheckpointing(false);
    }
  };

  const saveProjectMemory = async () => {
    if (!onSaveProjectMemory || isProjectMemorySaving) {
      return;
    }
    setIsProjectMemorySaving(true);
    setProjectMemoryError(null);
    try {
      await onSaveProjectMemory(projectMemoryDraft);
      setIsEditingProjectMemory(false);
    } catch (error) {
      setProjectMemoryError(
        error instanceof Error ? error.message : "Project Memory save failed.",
      );
    } finally {
      setIsProjectMemorySaving(false);
    }
  };

  return (
    <section className="bh-memory-workspace" aria-label="Memory">
      <header className="bh-memory-toolbar">
        <div>
          <h2>Memory</h2>
          <p>Organize Pending Memory into generated context and update Project Memory.</p>
        </div>
        <button
          className="bh-memory-primary-action"
          disabled={
            checkpointableRanges.length === 0 || !onCheckpointMemory || isCheckpointing
          }
          onClick={() => void organizePendingBatch()}
          type="button"
        >
          <Sparkles aria-hidden="true" size={16} strokeWidth={1.7} />
          <span>{isCheckpointing ? "Organizing" : "Organize pending batch"}</span>
        </button>
      </header>

      <div className="bh-memory-summary-strip" aria-label="Memory status summary">
        <span>Pending: {data.memory.pendingRanges.length > 0 ? "1 batch" : "0 batches"}</span>
        <span>Generated: {generatedMemories.length}</span>
        <span>Project Memory: {data.memory.projectMemory ? "Ready" : "Not generated"}</span>
      </div>

      {checkpointStatus ? (
        <div className="bh-memory-status" role="status">
          {checkpointStatus}
        </div>
      ) : null}
      {checkpointError ? (
        <div className="bh-memory-status" data-error="true" role="alert">
          {checkpointError}
        </div>
      ) : null}

      <div className="bh-memory-flow">
        <section className="bh-memory-section" aria-labelledby="memory-pending-title">
          <div className="bh-memory-section-header">
            <div>
              <span className="bh-memory-step-kicker">Backlog</span>
              <h3 id="memory-pending-title">Pending Memory</h3>
              <p>Stored work waiting to become generated context memory.</p>
            </div>
            <span>{data.memory.pendingRanges.length > 0 ? "1 batch" : "0 batches"}</span>
          </div>

          {data.memory.pendingRanges.length > 0 ? (
            <article className="bh-memory-pending-row">
              <div>
                <strong>Pending Memory backlog</strong>
                <span>
                  {pendingPromptCount} prompts · {pendingEventCount} events ·{" "}
                  {pendingSessionCount} sessions
                </span>
              </div>
            </article>
          ) : (
            <div className="bh-memory-empty">
              <strong>No Pending Memory</strong>
              <span>All captured work is already covered by generated memory.</span>
            </div>
          )}
        </section>

        <section className="bh-memory-section" aria-labelledby="memory-generated-title">
          <div className="bh-memory-section-header">
            <div>
              <span className="bh-memory-step-kicker">Generated</span>
              <h3 id="memory-generated-title">Generated Memory</h3>
              <p>Context memories saved automatically from organized batches.</p>
            </div>
            <span>{generatedMemories.length} items</span>
          </div>

          {generatedMemories.length > 0 ? (
            <div className="bh-memory-draft-list">
              {generatedMemories.map((memory) => (
                <article className="bh-memory-draft-card" key={memory.id}>
                  <div className="bh-memory-card-meta">
                    <span>{memoryTypeLabel(memory.draftType)}</span>
                    <span>{memoryTriggerLabel(memory.triggerReason)}</span>
                    <span>{memory.updatedAt ?? memory.createdAt ?? "Date not reported"}</span>
                  </div>
                  <div className="bh-memory-card-copy">
                    <h4>{memory.title}</h4>
                    <p>{memory.summary ?? "No summary provided."}</p>
                    <details className="bh-memory-card-details">
                      <summary>Details</summary>
                      <MemoryArtifactSections artifact={memory} />
                      {memory.whyItMatters ? (
                        <div>
                          <strong>Why it matters</strong>
                          <span>{memory.whyItMatters}</span>
                        </div>
                      ) : null}
                    </details>
                  </div>
                  <div className="bh-memory-card-footer">
                    <span>{memorySequenceLabel(memory)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="bh-memory-empty">
              <strong>No generated memory yet</strong>
              <span>
                {data.memory.pendingRanges.length > 0
                  ? "Pending Memory is ready. Organize it to update Project Memory."
                  : "No memory work right now."}
              </span>
            </div>
          )}
        </section>

        <section className="bh-memory-section" aria-labelledby="memory-project-title">
          <div className="bh-memory-section-header">
            <div>
              <span className="bh-memory-step-kicker">Context</span>
              <h3 id="memory-project-title">Project Memory</h3>
              <p>The final context document future AI coding sessions should read.</p>
            </div>
            <span>{data.memory.projectMemory ? "Ready" : "Empty"}</span>
          </div>

          {projectMemoryError ? (
            <div className="bh-memory-status" data-error="true" role="alert">
              {projectMemoryError}
            </div>
          ) : null}

          {data.memory.projectMemory ? (
            <article className="bh-memory-project-card">
              {isEditingProjectMemory ? (
                <div className="bh-memory-edit-form">
                  <label>
                    <span>Project Memory markdown</span>
                    <textarea
                      onChange={(event) => setProjectMemoryDraft(event.target.value)}
                      rows={18}
                      value={projectMemoryDraft}
                    />
                  </label>
                  <div className="bh-memory-card-actions">
                    <button
                      disabled={!onSaveProjectMemory || isProjectMemorySaving}
                      onClick={() => void saveProjectMemory()}
                      type="button"
                    >
                      {isProjectMemorySaving ? "Saving" : "Save Project Memory"}
                    </button>
                    <button
                      disabled={isProjectMemorySaving}
                      onClick={() => {
                        setProjectMemoryDraft(data.memory.projectMemory?.bodyMarkdown ?? "");
                        setIsEditingProjectMemory(false);
                        setProjectMemoryError(null);
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <pre>{data.memory.projectMemory.bodyMarkdown}</pre>
                  <div className="bh-memory-card-actions">
                    <button
                      disabled={!onSaveProjectMemory}
                      onClick={() => {
                        setProjectMemoryDraft(data.memory.projectMemory?.bodyMarkdown ?? "");
                        setIsEditingProjectMemory(true);
                        setProjectMemoryError(null);
                      }}
                      type="button"
                    >
                      Edit Project Memory
                    </button>
                  </div>
                </>
              )}
            </article>
          ) : (
            <div className="bh-memory-empty">
              <strong>No Project Memory yet</strong>
              <span>Organize Pending Memory to generate the first Project Memory snapshot.</span>
            </div>
          )}
        </section>
      </div>
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
        className="bh-detail-skeleton bh-detail-skeleton-activity bh-activity-layout"
        data-view="prompts"
        role="status"
      >
        <div className="bh-activity-view-tabs bh-activity-view-tabs-skeleton">
          {Array.from({ length: 2 }).map((_, index) => (
            <span className="skeleton-pill skeleton-pill-action" key={index} />
          ))}
        </div>

        <div className="bh-prompt-activity-layout">
          <div className="bh-prompt-sidebar">
            <div className="bh-prompt-search bh-prompt-search-skeleton">
              <span className="skeleton-icon" />
              <span className="skeleton-line skeleton-line-md" />
            </div>
            <div className="bh-work-type-filter bh-work-type-filter-skeleton">
              {Array.from({ length: 3 }).map((_, index) => (
                <span className="skeleton-pill" key={index} />
              ))}
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
      className="bh-detail-skeleton bh-detail-skeleton-overview bh-overview-dashboard"
      role="status"
    >
      <section className="bh-overview-statistics" aria-label="Loading statistics">
        <dl>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              className="bh-overview-stat-card bh-overview-stat-card-skeleton"
              key={index}
            >
              <div className="bh-overview-stat-copy">
                <dt>
                  <span className="skeleton-line skeleton-line-sm" />
                </dt>
                <dd>
                  <span className="skeleton-line skeleton-line-title" />
                </dd>
                <span className="skeleton-line skeleton-line-sm" />
              </div>
              <span className="bh-overview-stat-sparkline bh-overview-stat-sparkline-skeleton" />
            </div>
          ))}
        </dl>
      </section>

      <div className="bh-overview-detail-grid">
        <section
          className="bh-overview-card bh-overview-card-repository bh-overview-card-skeleton"
        >
          <div className="bh-overview-card-header">
            <span className="skeleton-line skeleton-line-section" />
            <span className="skeleton-pill skeleton-pill-action" />
          </div>
          <div className="bh-project-context-layout">
            <div className="bh-project-context-links">
              {Array.from({ length: 2 }).map((_, index) => (
                <div className="bh-project-context-link-field" key={index}>
                  <span className="skeleton-line skeleton-line-sm" />
                  <span className="skeleton-line skeleton-line-description" />
                </div>
              ))}
            </div>
            <div className="bh-overview-card-divider" />
            <div className="bh-project-context-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <section className="bh-project-context-section" key={index}>
                  <span className="skeleton-line skeleton-line-sm" />
                  <span className="skeleton-line skeleton-line-md" />
                </section>
              ))}
            </div>
          </div>
        </section>

        <section
          className="bh-overview-card bh-overview-card-description bh-overview-card-skeleton"
        >
          <div className="bh-overview-card-header">
            <span className="skeleton-line skeleton-line-section" />
            <span className="skeleton-pill skeleton-pill-action" />
          </div>
          <div className="bh-overview-description-skeleton">
            {Array.from({ length: 5 }).map((_, index) => (
              <span className="skeleton-line skeleton-line-md" key={index} />
            ))}
          </div>
        </section>
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
  onCheckpointMemory,
  onPublishFlow,
  onSaveProjectMetadata,
  onSaveDescription,
  onSaveFlowDraft,
  onSaveProjectMemory,
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
  onCheckpointMemory?: (sessionIds: string[]) => Promise<MemoryCheckpointResult>;
  onPublishFlow?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onSaveFlowDraft?: (payload: PromptFlowPublishPayload) => Promise<PublishedFlowDetail>;
  onSaveProjectMemory?: (bodyMarkdown: string) => Promise<void>;
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
        onSaveProjectMetadata={onSaveProjectMetadata}
        onSaveDescription={onSaveDescription}
      />
    );
  }

  if (activeTab === "memory") {
    return (
      <MemoryPanel
        data={data}
        onCheckpointMemory={onCheckpointMemory}
        onSaveProjectMemory={onSaveProjectMemory}
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
  isProjectResolving,
  isLoading,
  isRefreshing,
  onActivityNavigationChange,
  onCheckpointMemory,
  onConnectRepository,
  onOpenAllProjects,
  onPublishFlow,
  onProjectSelect,
  onRepositoryFileSelect,
  onRetry,
  onSaveProjectMetadata,
  onSaveDescription,
  onSaveFlowDraft,
  onSaveProjectMemory,
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
        isLoading={isProjectResolving}
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
          onCheckpointMemory={onCheckpointMemory}
          onPublishFlow={onPublishFlow}
          onSaveProjectMetadata={onSaveProjectMetadata}
          onSaveDescription={onSaveDescription}
          onSaveFlowDraft={onSaveFlowDraft}
          onSaveProjectMemory={onSaveProjectMemory}
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
