import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  ArrowRight,
  Bot,
  Check,
  Clock,
  ExternalLink,
  Folder,
  GitBranch,
  ImagePlus,
  Link,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Terminal,
  User,
  X,
} from "lucide-react";
import {
  siGithub,
  type SimpleIcon,
} from "simple-icons";
import { MarkdownContent } from "./components/MarkdownContent";
import {
  AiModelBadge,
  ProjectDetailPage,
  type ActivityNavigationState,
  type ActivityViewId,
  type FileTreeNode,
  type PublishedFlowAsset,
  type PublishedFlowDetail,
  type ProjectDetailData,
  type ProjectDetailTabId,
  type ProjectHeaderProjectOption,
  type PromptFlowPublishPayload,
  type PromptFlowUpdatePayload,
  type RepositoryFileContent,
} from "./components/project-detail";
import "./App.css";

type SidebarItemId = "projects" | "community" | "settings" | "profile";

type Project = {
  id: string;
  name: string;
  slug?: string;
  latestTimestamp: string;
  latestUpdatedAt: string;
  sessions: number;
  events: number;
  filesChanged: number;
  models: string[];
  githubUrl?: string;
};

type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
};

type EventRecord = {
  id: string;
  project_id: string;
  session_id: string;
  sequence: number;
  tool: string;
  event_type: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

type ProjectSummary = {
  id: string;
  slug?: string;
  name: string;
  git_remote: string | null;
  github_url: string | null;
  default_branch: string;
  sessions: number;
  events: number;
  latest_event_at: string | null;
  updated_at: string;
};

type ProjectDetailApiResponse = {
  activities: Array<{
    events: number;
    files_changed: number;
    id: string;
    last_activity_at: string | null;
    model: string;
    prompts: number;
    responses: number;
    started_at: string | null;
  }>;
  community?: {
    draft_flows: number;
    latest_flow_at: string | null;
    published_flows: number;
    recent_flows: Array<{
      file_count: number;
      id: string;
      prompt_count: number;
      published_at: string | null;
      slug: string;
      status: string;
      summary: string | null;
      title: string;
      updated_at: string | null;
      visibility: string;
    }>;
    total_flows: number;
  };
  prompt_activities?: Array<{
    file_changes?: Array<{
      additions: number | null;
      binary?: boolean;
      deletions: number | null;
      old_path?: string | null;
      patch?: string | null;
      patch_omitted_reason?: string | null;
      patch_truncated?: boolean;
      path: string;
      status: string;
    }>;
    files_changed?: number;
    id: string;
    model: string;
    prompt: string;
    prompt_original_length?: number | null;
    prompt_storage_limit?: number | null;
    prompt_truncated?: boolean;
    response?: string | null;
    response_original_length?: number | null;
    response_received_at?: string | null;
    response_source?: string | null;
    response_storage_limit?: number | null;
    response_truncated?: boolean;
    sequence: number;
    session_id: string;
    submitted_at: string | null;
  }>;
  files: FileTreeNode[];
  metrics: {
    connected_models: string[];
    connected_tools?: string[];
    latest_activity_at: string | null;
    last_modified_at: string | null;
    repository_connected: boolean;
    total_events: number;
    total_prompts?: number;
    total_sessions: number;
    tracked_files: number;
  };
  project: {
    created_at?: string | null;
    default_branch: string;
    description: string | null;
    id: string;
    name: string;
    repository_status: string;
    repository_url: string | null;
    slug?: string;
    updated_at: string | null;
    visibility?: string | null;
  };
};

type ProjectGithubFilesApiResponse = {
  available: boolean;
  default_branch?: string;
  files: FileTreeNode[];
  message: string | null;
  repository: string | null;
  status: string;
  truncated?: boolean;
};

type ProjectGithubFileContentApiResponse = {
  available: boolean;
  branch?: string;
  content: string | null;
  html_url?: string | null;
  message: string | null;
  name?: string;
  path?: string;
  repository?: string;
  size?: number | null;
  status: string;
};

type PublishedFlowSummary = PublishedFlowDetail & {
  author: {
    avatar_url: string | null;
    id: string | null;
    username: string;
  };
  created_at: string | null;
  file_count: number;
  is_owner: boolean;
  metrics: Record<string, unknown>;
  model_name: string | null;
  prompt_count: number;
  published_at: string | null;
  slug: string;
  status: string;
  summary: string | null;
  tags: string[];
  title: string;
  tool_name: string | null;
  updated_at: string | null;
  visibility: string;
};

type PublishedFlowDetailResponse = PublishedFlowSummary & {
  assets: PublishedFlowAsset[];
  context_summary: string | null;
  end_sequence: number | null;
  files: Array<{
    additions: number;
    change_type: string | null;
    deletions: number;
    diff: string | null;
    file_path: string;
    id: string;
    is_included: boolean;
    language: string | null;
    source_event_id: string | null;
  }>;
  items: Array<{
    files_changed: number;
    id: string;
    is_included: boolean;
    item_order: number;
    model_name: string | null;
    prompt_text: string;
    response_received_at: string | null;
    response_text: string | null;
    sequence: number;
    source_event_id: string | null;
    submitted_at: string | null;
    tool_name: string | null;
  }>;
  notes: string | null;
  source_end_event_id: string | null;
  source_project_id: string | null;
  source_session_id: string | null;
  source_start_event_id: string | null;
  start_sequence: number | null;
};

type GithubRepositoryOption = {
  id: number | string | null;
  default_branch: string;
  description: string | null;
  full_name: string;
  html_url: string;
  name: string;
  owner: string;
  private: boolean;
  updated_at: string | null;
};

type GithubRepositoriesApiResponse = {
  available: boolean;
  message: string | null;
  repositories: GithubRepositoryOption[];
  status: string;
};

type ProjectGithubFilesState = {
  files: FileTreeNode[];
  message?: string;
  repository?: string;
  status?: string;
  truncated?: boolean;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";
type UrlNavigationWriteMode = "push" | "replace";

type UrlNavigationState = {
  activityNavigation: ActivityNavigationState;
  activeDetailTab: ProjectDetailTabId;
  activeItem: SidebarItemId;
  repositoryFileContentPath: string | null;
  selectedProjectId: string | null;
  selectedProjectRouteKey: string | null;
};

const API_URL = (
  import.meta.env.VITE_PROMPTHUB_API_URL ?? "http://127.0.0.1:8011"
).replace(/\/$/, "");
const BRAND_NAME = "Promty";
const BRAND_LOGO_SRC = "/promty.svg";
const DEFAULT_URL_NAVIGATION_STATE: UrlNavigationState = {
  activityNavigation: {
    selectedPromptId: null,
    selectedSessionId: null,
    selectedSessionPromptId: null,
    view: "prompts",
  },
  activeDetailTab: "overview",
  activeItem: "projects",
  repositoryFileContentPath: null,
  selectedProjectId: null,
  selectedProjectRouteKey: null,
};
const ACTIVITY_VIEW_IDS = new Set<ActivityViewId>(["prompts", "sessions"]);
const PROJECT_DETAIL_TAB_IDS = new Set<ProjectDetailTabId>([
  "overview",
  "ai-activity",
  "files",
]);
const SIDEBAR_ITEM_IDS = new Set<SidebarItemId>([
  "community",
  "projects",
  "settings",
  "profile",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ROUTE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,254}$/i;
const UUID_ROUTE_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const MAX_URL_FILE_PATH_LENGTH = 1024;

function sanitizeProjectId(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  return UUID_PATTERN.test(value) ? value : null;
}

function sanitizeProjectRouteKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const routeKey = value.trim().toLowerCase();
  return PROJECT_ROUTE_KEY_PATTERN.test(routeKey) ? routeKey : null;
}

function uuidToRouteKey(value: string | null | undefined) {
  const uuid = sanitizeProjectId(value);
  if (!uuid) {
    return null;
  }

  const bytes = uuid
    .replace(/-/g, "")
    .match(/.{1,2}/g)
    ?.map((hex) => Number.parseInt(hex, 16));
  if (!bytes || bytes.some((byte) => Number.isNaN(byte))) {
    return null;
  }

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function routeKeyToUuid(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const uuid = sanitizeProjectId(value);
  if (uuid) {
    return uuid;
  }

  if (!UUID_ROUTE_KEY_PATTERN.test(value)) {
    return null;
  }

  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    if (binary.length !== 16) {
      return null;
    }

    const hex = Array.from(binary, (character) =>
      character.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16,
    )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}

function sanitizeRepositoryFilePath(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const path = value.trim();
  if (
    path.length === 0 ||
    path.length > MAX_URL_FILE_PATH_LENGTH ||
    path.startsWith("/") ||
    path.includes("\\")
  ) {
    return null;
  }

  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }

  return path;
}

function parseSidebarItemId(value: string | null): SidebarItemId {
  return value && SIDEBAR_ITEM_IDS.has(value as SidebarItemId)
    ? (value as SidebarItemId)
    : "projects";
}

function parseProjectDetailTabId(value: string | null): ProjectDetailTabId {
  return value && PROJECT_DETAIL_TAB_IDS.has(value as ProjectDetailTabId)
    ? (value as ProjectDetailTabId)
    : "overview";
}

function parseActivityViewId(value: string | null): ActivityViewId {
  return value && ACTIVITY_VIEW_IDS.has(value as ActivityViewId)
    ? (value as ActivityViewId)
    : "prompts";
}

function normalizeUrlNavigationState(
  state: Partial<UrlNavigationState>,
): UrlNavigationState {
  const activeItem = state.activeItem ?? DEFAULT_URL_NAVIGATION_STATE.activeItem;
  const selectedProjectId =
    activeItem === "projects" ? sanitizeProjectId(state.selectedProjectId) : null;
  const selectedProjectRouteKey =
    activeItem === "projects"
      ? sanitizeProjectRouteKey(
          state.selectedProjectRouteKey ?? state.selectedProjectId,
        )
      : null;
  const hasSelectedProject = Boolean(selectedProjectId || selectedProjectRouteKey);
  const activeDetailTab = hasSelectedProject
    ? state.activeDetailTab ?? DEFAULT_URL_NAVIGATION_STATE.activeDetailTab
    : DEFAULT_URL_NAVIGATION_STATE.activeDetailTab;
  const repositoryFileContentPath =
    activeItem === "projects" && hasSelectedProject && activeDetailTab === "files"
      ? sanitizeRepositoryFilePath(state.repositoryFileContentPath)
      : null;
  const activityView =
    activeItem === "projects" && hasSelectedProject && activeDetailTab === "ai-activity"
      ? state.activityNavigation?.view ??
        DEFAULT_URL_NAVIGATION_STATE.activityNavigation.view
      : DEFAULT_URL_NAVIGATION_STATE.activityNavigation.view;
  const activityNavigation: ActivityNavigationState = {
    selectedPromptId:
      activeItem === "projects" &&
      hasSelectedProject &&
      activeDetailTab === "ai-activity" &&
      activityView === "prompts"
        ? routeKeyToUuid(state.activityNavigation?.selectedPromptId)
        : null,
    selectedSessionId:
      activeItem === "projects" &&
      hasSelectedProject &&
      activeDetailTab === "ai-activity" &&
      activityView === "sessions"
        ? routeKeyToUuid(state.activityNavigation?.selectedSessionId)
        : null,
    selectedSessionPromptId:
      activeItem === "projects" &&
      hasSelectedProject &&
      activeDetailTab === "ai-activity" &&
      activityView === "sessions"
        ? routeKeyToUuid(state.activityNavigation?.selectedSessionPromptId)
        : null,
    view: activityView,
  };

  return {
    activityNavigation,
    activeDetailTab,
    activeItem,
    repositoryFileContentPath,
    selectedProjectId,
    selectedProjectRouteKey,
  };
}

function readUrlNavigationState(): UrlNavigationState {
  const params = new URLSearchParams(window.location.search);
  const projectRouteKey = params.get("project");
  return normalizeUrlNavigationState({
    activityNavigation: {
      selectedPromptId: params.get("prompt"),
      selectedSessionId: params.get("session"),
      selectedSessionPromptId: params.get("prompt"),
      view: parseActivityViewId(params.get("activity")),
    },
    activeDetailTab: parseProjectDetailTabId(params.get("tab")),
    activeItem: parseSidebarItemId(params.get("view")),
    repositoryFileContentPath: params.get("file"),
    selectedProjectId: projectRouteKey,
    selectedProjectRouteKey: projectRouteKey,
  });
}

function buildUrlNavigationSearch(state: UrlNavigationState) {
  const params = new URLSearchParams();

  if (state.activeItem !== "projects") {
    params.set("view", state.activeItem);
  } else if (state.selectedProjectRouteKey ?? state.selectedProjectId) {
    params.set("project", state.selectedProjectRouteKey ?? state.selectedProjectId ?? "");
    params.set("tab", state.activeDetailTab);

    if (state.activeDetailTab === "files" && state.repositoryFileContentPath) {
      params.set("file", state.repositoryFileContentPath);
    } else if (state.activeDetailTab === "ai-activity") {
      params.set("activity", state.activityNavigation.view);

      if (
        state.activityNavigation.view === "prompts" &&
        state.activityNavigation.selectedPromptId
      ) {
        params.set(
          "prompt",
          uuidToRouteKey(state.activityNavigation.selectedPromptId) ??
            state.activityNavigation.selectedPromptId,
        );
      }

      if (
        state.activityNavigation.view === "sessions" &&
        state.activityNavigation.selectedSessionId
      ) {
        params.set(
          "session",
          uuidToRouteKey(state.activityNavigation.selectedSessionId) ??
            state.activityNavigation.selectedSessionId,
        );
      }

      if (
        state.activityNavigation.view === "sessions" &&
        state.activityNavigation.selectedSessionPromptId
      ) {
        params.set(
          "prompt",
          uuidToRouteKey(state.activityNavigation.selectedSessionPromptId) ??
            state.activityNavigation.selectedSessionPromptId,
        );
      }
    }
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}

function writeUrlNavigationState(
  state: UrlNavigationState,
  mode: UrlNavigationWriteMode,
) {
  const normalizedState = normalizeUrlNavigationState(state);
  const nextUrl = `${window.location.pathname}${buildUrlNavigationSearch(normalizedState)}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl === currentUrl) {
    return;
  }

  window.history[mode === "replace" ? "replaceState" : "pushState"](
    { buildhubNavigation: normalizedState },
    "",
    nextUrl,
  );
}

function currentWorkspaceReturnUrl() {
  return `${window.location.origin}${window.location.pathname}${buildUrlNavigationSearch(
    readUrlNavigationState(),
  )}`;
}

function formatCompactNumber(value: number) {
  return Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDate(value: string | null | undefined, fallback = "Not available") {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function formatOptionalTimestamp(value: string | null | undefined, fallback = "No activity") {
  return value ? formatTimestamp(value) : fallback;
}

function formatRelativeTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const diff = timestamp - Date.now();
  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 1000 * 60 * 60 * 24 * 365, unit: "year" },
    { amount: 1000 * 60 * 60 * 24 * 30, unit: "month" },
    { amount: 1000 * 60 * 60 * 24 * 7, unit: "week" },
    { amount: 1000 * 60 * 60 * 24, unit: "day" },
    { amount: 1000 * 60 * 60, unit: "hour" },
    { amount: 1000 * 60, unit: "minute" },
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const absoluteDiff = Math.abs(diff);
  const division =
    divisions.find((item) => absoluteDiff >= item.amount) ??
    ({ amount: 1000, unit: "second" } satisfies {
      amount: number;
      unit: Intl.RelativeTimeFormatUnit;
    });

  return formatter.format(Math.round(diff / division.amount), division.unit);
}

function formatLabelValue(value: string | null | undefined, fallback = "Not available") {
  if (!value?.trim()) {
    return fallback;
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStringPayloadValue(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function basename(pathValue: string | null) {
  if (!pathValue) {
    return null;
  }
  const normalized = pathValue.replace(/\/+$/, "");
  const name = normalized.split("/").filter(Boolean).pop();
  return name ?? null;
}

function projectNameFromEvent(event: EventRecord) {
  return (
    basename(getStringPayloadValue(event.payload, "git_root")) ??
    basename(getStringPayloadValue(event.payload, "cwd")) ??
    `Project ${event.project_id.slice(0, 8)}`
  );
}

const TOOL_MODEL_NAMES = new Set([
  "claude code",
  "claude-code",
  "codex",
  "codex-cli",
  "cursor",
  "gemini cli",
  "gemini-cli",
]);

function normalizeModelName(value: string | null) {
  if (!value) {
    return null;
  }
  return TOOL_MODEL_NAMES.has(value.toLowerCase()) ? null : value;
}

function modelNameFromEvent(event: EventRecord) {
  const model = getStringPayloadValue(event.payload, "model");
  return normalizeModelName(model);
}

function normalizeGithubUrl(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`;
  }

  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return trimmed.startsWith("https://github.com/") ? trimmed : null;
}

function githubUrlFromEvent(event: EventRecord) {
  return normalizeGithubUrl(
    getStringPayloadValue(event.payload, "github_url") ??
      getStringPayloadValue(event.payload, "git_remote"),
  );
}

function projectsFromEvents(events: EventRecord[], summaries: ProjectSummary[]): Project[] {
  const grouped = new Map<
    string,
    {
      events: number;
      filesChanged: number;
      githubUrl: string | null;
      latestTimestamp: string;
      models: Set<string>;
      name: string;
      summaryEventCount?: number;
      summarySessionCount?: number;
      sessions: Set<string>;
      slug?: string;
    }
  >();

  for (const summary of summaries) {
    grouped.set(summary.id, {
      events: 0,
      filesChanged: 0,
      githubUrl: normalizeGithubUrl(summary.github_url ?? summary.git_remote),
      latestTimestamp: summary.latest_event_at ?? summary.updated_at,
      models: new Set<string>(),
      name: summary.name,
      summaryEventCount: summary.events,
      summarySessionCount: summary.sessions,
      sessions: new Set<string>(),
      slug: summary.slug,
    });
  }

  for (const event of events) {
    const existing = grouped.get(event.project_id);
    const current =
      existing ??
      {
        events: 0,
        filesChanged: 0,
        githubUrl: githubUrlFromEvent(event),
        latestTimestamp: event.timestamp,
        models: new Set<string>(),
        name: projectNameFromEvent(event),
        sessions: new Set<string>(),
      };

    current.events += 1;
    current.sessions.add(event.session_id);
    const modelName = modelNameFromEvent(event);
    if (modelName) {
      current.models.add(modelName);
    }
    current.githubUrl = current.githubUrl ?? githubUrlFromEvent(event);
    if (event.event_type === "FilesChanged") {
      const files = event.payload.files;
      current.filesChanged += Array.isArray(files) ? files.length : 1;
    }
    if (new Date(event.timestamp) > new Date(current.latestTimestamp)) {
      current.latestTimestamp = event.timestamp;
      current.name = projectNameFromEvent(event);
    }

    grouped.set(event.project_id, current);
  }

  return Array.from(grouped, ([id, value]) => ({
    id,
    name: value.name,
    slug: value.slug ?? id,
    latestTimestamp: value.latestTimestamp,
    latestUpdatedAt: formatTimestamp(value.latestTimestamp),
    sessions: value.summarySessionCount ?? value.sessions.size,
    events: value.summaryEventCount ?? value.events,
    filesChanged: value.filesChanged,
    models: Array.from(value.models).sort(),
    githubUrl: value.githubUrl ?? undefined,
  })).sort(
    (left, right) =>
      new Date(right.latestTimestamp).getTime() -
      new Date(left.latestTimestamp).getTime(),
  );
}

function emptyProjectDetailData(project: Project | null): ProjectDetailData {
  return {
    activities: [],
    community: {
      draftFlows: 0,
      latestFlowAt: null,
      publishedFlows: 0,
      recentFlows: [],
      totalFlows: 0,
    },
    files: [],
    overview: [],
    promptActivities: [],
    project: {
      description:
        "AI development workspace for prompts, code changes, context, and project memory.",
      id: project?.id ?? "",
      name: project?.name ?? "Project",
      repositoryStatus: project?.githubUrl
        ? "Repository connected"
        : "Repository not connected",
      repositoryUrl: project?.githubUrl,
    },
    repositoryFiles: [],
    repositoryFilesMessage: project?.githubUrl
      ? "GitHub repository files are loading."
      : "This project does not have a GitHub repository remote.",
  };
}

function projectDetailUrl(projectKey: string) {
  const params = new URLSearchParams({
    project: projectKey,
    tab: "overview",
  });
  return `${window.location.origin}/?${params.toString()}`;
}

function projectDetailDataFromApi(
  payload: ProjectDetailApiResponse,
  fallbackProject: Project | null,
): ProjectDetailData {
  const models = payload.metrics.connected_models;
  const community = payload.community;
  const totalPrompts =
    payload.metrics.total_prompts ?? payload.prompt_activities?.length ?? 0;
  const projectDescription =
    payload.project.description ??
    "AI development workspace for prompts, code changes, context, and project memory.";
  const repositoryUrl = payload.project.repository_url ?? fallbackProject?.githubUrl;
  const projectUrl = projectDetailUrl(
    payload.project.slug ?? payload.project.id ?? fallbackProject?.id ?? "",
  );

  return {
    activities: payload.activities.map((activity) => ({
      events: activity.events,
      filesChanged: activity.files_changed,
      id: activity.id,
      lastActivity: formatOptionalTimestamp(activity.last_activity_at),
      model: activity.model,
      prompts: activity.prompts,
      responses: activity.responses,
      startedAt: formatOptionalTimestamp(activity.started_at, "Unknown"),
    })),
    promptActivities: (payload.prompt_activities ?? []).map((activity) => ({
      fileChanges: (activity.file_changes ?? []).map((change) => ({
        additions: change.additions,
        binary: change.binary,
        deletions: change.deletions,
        oldPath: change.old_path,
        patch: change.patch,
        patchOmittedReason: change.patch_omitted_reason,
        patchTruncated: change.patch_truncated,
        path: change.path,
        status: change.status,
      })),
      filesChanged: activity.files_changed ?? activity.file_changes?.length ?? 0,
      id: activity.id,
      model: activity.model,
      prompt: activity.prompt,
      promptOriginalLength: activity.prompt_original_length,
      promptStorageLimit: activity.prompt_storage_limit,
      promptTruncated: activity.prompt_truncated,
      response: activity.response,
      responseOriginalLength: activity.response_original_length,
      responseReceivedAt: activity.response_received_at
        ? formatOptionalTimestamp(activity.response_received_at, "Unknown")
        : null,
      responseSource: activity.response_source,
      responseStorageLimit: activity.response_storage_limit,
      responseTruncated: activity.response_truncated,
      sequence: activity.sequence,
      sessionId: activity.session_id,
      submittedAt: formatOptionalTimestamp(activity.submitted_at, "Unknown"),
    })),
    community: {
      draftFlows: community?.draft_flows ?? 0,
      latestFlowAt: community?.latest_flow_at
        ? formatOptionalTimestamp(community.latest_flow_at, "Unknown")
        : null,
      publishedFlows: community?.published_flows ?? 0,
      recentFlows: (community?.recent_flows ?? []).map((flow) => ({
        fileCount: flow.file_count,
        id: flow.id,
        promptCount: flow.prompt_count,
        publishedAt: flow.published_at
          ? formatOptionalTimestamp(flow.published_at, "Unknown")
          : null,
        slug: flow.slug,
        status: flow.status,
        summary: flow.summary,
        title: flow.title,
        updatedAt: flow.updated_at
          ? formatOptionalTimestamp(flow.updated_at, "Unknown")
          : null,
        visibility: flow.visibility,
      })),
      totalFlows: community?.total_flows ?? 0,
    },
    files: payload.files,
    overview: [
      {
        title: "Repository URL",
        value: repositoryUrl ?? "Not connected",
        description: repositoryUrl
          ? `Default branch ${payload.project.default_branch}`
          : "Connect a GitHub repository to browse source files.",
        href: repositoryUrl ?? undefined,
      },
      {
        title: "Project URL",
        value: projectUrl,
        description: `${BRAND_NAME} project detail page`,
        href: projectUrl,
      },
      {
        title: "Description",
        value: projectDescription,
      },
      {
        title: "Default Branch",
        value: payload.project.default_branch || "Not available",
      },
      {
        title: "Visibility",
        value: formatLabelValue(payload.project.visibility, "Private"),
      },
      {
        title: "AI Models",
        value: models.length > 0 ? models.join(", ") : "Not captured",
      },
      {
        title: "Activities",
        value: formatCompactNumber(payload.metrics.total_events),
      },
      {
        title: "Sessions",
        value: formatCompactNumber(payload.metrics.total_sessions),
      },
      {
        title: "Prompts",
        value: formatCompactNumber(totalPrompts),
      },
      {
        title: "Created",
        value: formatDate(payload.project.created_at),
        description: formatRelativeTimestamp(payload.project.created_at) ?? "Not available",
      },
      {
        title: "Last Activity",
        value: formatDate(payload.metrics.latest_activity_at, "No activity"),
        description:
          formatRelativeTimestamp(payload.metrics.latest_activity_at) ?? "No activity",
      },
      {
        title: "Last Published Prompt",
        value: formatDate(community?.latest_flow_at, "No published prompts"),
        description:
          formatRelativeTimestamp(community?.latest_flow_at) ?? "No published prompts",
      },
      {
        title: "Repository Connected",
        value: repositoryUrl ? "Connected" : "Not connected",
        description: repositoryUrl ? "Connection date not tracked" : "No repository",
      },
    ],
    project: {
      description: projectDescription,
      id: payload.project.id,
      name: payload.project.name || fallbackProject?.name || "Project",
      repositoryStatus: payload.project.repository_status,
      repositoryUrl,
    },
    repositoryFiles: [],
    repositoryFilesMessage: payload.project.repository_url
      ? "GitHub repository files are loading."
      : "This project does not have a GitHub repository remote.",
  };
}

function projectGithubFilesFromApi(
  payload: ProjectGithubFilesApiResponse,
): ProjectGithubFilesState {
  return {
    files: payload.files,
    message: payload.message ?? undefined,
    repository: payload.repository ?? undefined,
    status: payload.status,
    truncated: payload.truncated,
  };
}

function repositoryFileContentFromApi(
  payload: ProjectGithubFileContentApiResponse,
): RepositoryFileContent {
  return {
    branch: payload.branch,
    content: payload.content,
    htmlUrl: payload.html_url,
    message: payload.message,
    name: payload.name,
    path: payload.path,
    repository: payload.repository,
    size: payload.size,
    status: payload.status,
  };
}

function githubRepositoryConnectUrl() {
  return `${API_URL}/api/auth/github/web/start?${new URLSearchParams({
    return_to: currentWorkspaceReturnUrl(),
  })}`;
}

function SimpleBrandIcon({
  icon,
  name,
}: {
  icon: SimpleIcon;
  name: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className="brand-icon"
      data-brand={name}
      viewBox="0 0 24 24"
    >
      <path d={icon.path} />
    </svg>
  );
}

function GitHubIcon() {
  return <SimpleBrandIcon icon={siGithub} name="github" />;
}

function BrandLogo({ className = "" }: { className?: string }) {
  const classNames = ["brand-logo", className].filter(Boolean).join(" ");

  return (
    <img
      alt=""
      aria-hidden="true"
      className={classNames}
      src={BRAND_LOGO_SRC}
    />
  );
}

function BrandLockup() {
  return (
    <>
      <BrandLogo className="is-sidebar" />
      <strong>{BRAND_NAME}</strong>
    </>
  );
}

function CliLoginPage() {
  const params = new URLSearchParams(window.location.search);
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? "";
  const apiUrl = (
    params.get("api_url") ??
    import.meta.env.VITE_PROMPTHUB_API_URL ??
    "http://127.0.0.1:8011"
  ).replace(/\/$/, "");
  const canConnect = redirectUri.length > 0 && state.length > 0;
  const githubLoginUrl = `${apiUrl}/api/auth/github/start?${new URLSearchParams(
    {
      redirect_uri: redirectUri,
      state,
    },
  ).toString()}`;

  return (
    <main className="cli-login-shell">
      <section className="cli-login-panel" aria-labelledby="cli-login-title">
        <div className="cli-login-kicker">
          <BrandLogo className="is-kicker" />
          {BRAND_NAME} CLI
        </div>

        <div className="cli-login-copy">
          <h1 id="cli-login-title">Connect your GitHub account</h1>
          <p>
            {BRAND_NAME} uses GitHub sign-in to issue a local collector token for
            this machine.
          </p>
        </div>

        <a
          aria-disabled={!canConnect}
          className="github-login-button"
          data-disabled={!canConnect}
          href={canConnect ? githubLoginUrl : undefined}
          onClick={(event) => {
            if (!canConnect) {
              event.preventDefault();
            }
          }}
        >
          <GitHubIcon />
          <span>Continue with GitHub</span>
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
        </a>

        <div className="cli-login-footer">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>Only a {BRAND_NAME} collector token is returned to your terminal.</span>
        </div>
      </section>
    </main>
  );
}

function WebLoginPage({
  errorMessage,
  isError = false,
}: {
  errorMessage: string | null;
  isError?: boolean;
}) {
  const returnTo = currentWorkspaceReturnUrl();
  const loginUrl = `${API_URL}/api/auth/github/web/start?${new URLSearchParams({
    return_to: returnTo,
  }).toString()}`;

  return (
    <main className="cli-login-shell">
      <section className="cli-login-panel" aria-labelledby="web-login-title">
        <div className="cli-login-kicker">
          <BrandLogo className="is-kicker" />
          {BRAND_NAME}
        </div>

        <div className="cli-login-copy">
          <h1 id="web-login-title">Sign in with GitHub</h1>
          <p>Open your {BRAND_NAME} workspace and recent AI development activity.</p>
        </div>

        {errorMessage ? (
          <div className="auth-message" data-error={isError}>
            {errorMessage}
          </div>
        ) : null}

        <a className="github-login-button" href={loginUrl}>
          <GitHubIcon />
          <span>Continue with GitHub</span>
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
        </a>
      </section>
    </main>
  );
}

function LoadingScreen() {
  return (
    <div
      aria-busy="true"
      aria-label={`Loading ${BRAND_NAME} workspace`}
      aria-live="polite"
      className="app-shell"
      role="status"
    >
      <aside className="sidebar" aria-hidden="true">
        <div className="sidebar-header">
          <BrandLockup />
        </div>

        <div className="sidebar-divider" />

        <nav className="sidebar-nav" aria-label="Loading navigation">
          <div className="sidebar-item sidebar-item-loading">
            <Folder
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            <span>Projects</span>
          </div>
          <div className="sidebar-item sidebar-item-loading">
            <Share2
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            <span>Community</span>
          </div>
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-divider" />

        <div className="sidebar-footer">
          <div className="sidebar-item sidebar-item-loading">
            <User
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            <span>Profile</span>
          </div>
          <div className="sidebar-item sidebar-item-loading">
            <Settings
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            <span>Settings</span>
          </div>
        </div>
      </aside>

      <main className="page">
        <header className="page-header">
          <div>
            <h1>Projects</h1>
          </div>
          <div className="page-actions">
            <button className="toolbar-button" disabled type="button">
              <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>Refresh</span>
            </button>
            <span className="status-pill">Loading</span>
          </div>
        </header>

        <section className="projects-section" aria-labelledby="loading-projects-title">
          <div className="section-header">
            <div>
              <h2 id="loading-projects-title">Active projects</h2>
              <p>Recent AI workspaces and connected repository context.</p>
            </div>
          </div>

          <div className="inline-loading-status">
            <RefreshCw
              aria-hidden="true"
              className="loading-spinner"
              size={16}
              strokeWidth={1.5}
            />
            <span>Loading workspace</span>
          </div>

          <ProjectGridSkeleton />
        </section>
      </main>
    </div>
  );
}

function EmptyState({
  children,
  description,
  eyebrow,
  icon: EmptyIcon,
  title,
}: {
  children?: ReactNode;
  description: string;
  eyebrow?: string;
  icon: typeof Folder;
  title: string;
}) {
  return (
    <section className="empty-state" aria-label={title}>
      <div className="empty-state-icon">
        <EmptyIcon aria-hidden="true" size={22} strokeWidth={1.5} />
      </div>
      <div className="empty-state-copy">
        {eyebrow ? <span className="empty-state-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children ? <div className="empty-state-body">{children}</div> : null}
    </section>
  );
}

function ProjectGridSkeleton() {
  return (
    <div
      aria-label="Loading projects"
      aria-live="polite"
      className="projects-grid project-grid-skeleton"
      role="status"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <article
          aria-hidden="true"
          className="project-card project-card-skeleton"
          key={index}
        >
          <div className="project-card-header">
            <span className="skeleton-line skeleton-line-title" />
            <span className="skeleton-pill" />
          </div>

          <div className="skeleton-stack">
            <span className="skeleton-line skeleton-line-sm" />
            <span className="skeleton-line skeleton-line-md" />
          </div>

          <div className="project-stats skeleton-stats">
            <span />
            <span />
            <span />
          </div>

          <div className="skeleton-badge-row">
            <span />
            <span />
            <span />
          </div>
        </article>
      ))}
    </div>
  );
}

function RepositoryOptionsSkeleton() {
  return (
    <div
      aria-label="Loading GitHub repositories"
      aria-live="polite"
      className="repository-option-list repository-option-list-skeleton"
      role="status"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="repository-option repository-option-skeleton" key={index}>
          <span className="repository-option-main">
            <span className="skeleton-line skeleton-line-title" />
            <span className="skeleton-line skeleton-line-md" />
          </span>
          <span className="repository-option-meta">
            <span className="skeleton-pill skeleton-pill-count" />
            <span className="skeleton-pill" />
            <span className="skeleton-pill skeleton-pill-action" />
          </span>
        </div>
      ))}
    </div>
  );
}

function RepositoryConnector({
  connectGitHubUrl,
  errorMessage,
  isLoadingRepositories,
  isSaving,
  mode,
  onClose,
  onReloadRepositories,
  onRepositorySearchQueryChange,
  onRepositoryUrlInputChange,
  onSelectRepository,
  onSubmitUrl,
  repositories,
  repositoryMessage,
  repositorySearchQuery,
  repositoryUrlInput,
  targetProjectName,
}: {
  connectGitHubUrl: string;
  errorMessage?: string | null;
  isLoadingRepositories: boolean;
  isSaving: boolean;
  mode: "create" | "connect";
  onClose: () => void;
  onReloadRepositories: () => void;
  onRepositorySearchQueryChange: (value: string) => void;
  onRepositoryUrlInputChange: (value: string) => void;
  onSelectRepository: (repository: GithubRepositoryOption) => void;
  onSubmitUrl: () => void;
  repositories: GithubRepositoryOption[];
  repositoryMessage?: string | null;
  repositorySearchQuery: string;
  repositoryUrlInput: string;
  targetProjectName?: string;
}) {
  return (
    <section
      aria-labelledby="repository-connector-title"
      className="repository-connector"
    >
      <div className="repository-connector-header">
        <div>
          <h2 id="repository-connector-title">Connect Repository</h2>
          <p>
            {mode === "create"
              ? `Create a ${BRAND_NAME} project from a GitHub repository.`
              : `Connect a GitHub repository to ${targetProjectName ?? "this project"}.`}
          </p>
        </div>
        <button
          aria-label="Close repository connector"
          className="repository-connector-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>
      </div>

      <form
        className="repository-url-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitUrl();
        }}
      >
        <label htmlFor="repository-url">Repository URL</label>
        <div className="repository-url-row">
          <input
            autoComplete="off"
            id="repository-url"
            inputMode="url"
            onChange={(event) => onRepositoryUrlInputChange(event.target.value)}
            placeholder="https://github.com/owner/repo"
            spellCheck={false}
            type="text"
            value={repositoryUrlInput}
          />
          <button
            className="empty-state-button"
            disabled={isSaving || repositoryUrlInput.trim().length === 0}
            type="submit"
          >
            <Link aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>{isSaving ? "Connecting" : "Connect URL"}</span>
          </button>
        </div>
      </form>

      <div className="repository-picker" aria-label="GitHub repository picker">
        <div className="repository-picker-toolbar">
          <div className="repository-search">
            <Search aria-hidden="true" size={15} strokeWidth={1.5} />
            <input
              aria-label="Search GitHub repositories"
              onChange={(event) => onRepositorySearchQueryChange(event.target.value)}
              placeholder="Search repositories"
              type="search"
              value={repositorySearchQuery}
            />
          </div>
          <button
            className="toolbar-button"
            disabled={isLoadingRepositories}
            onClick={onReloadRepositories}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} strokeWidth={1.5} />
            <span>{isLoadingRepositories ? "Loading" : "Reload"}</span>
          </button>
        </div>

        {errorMessage ? (
          <div className="repository-connector-message" data-error="true">
            {errorMessage}
          </div>
        ) : null}

        {repositoryMessage ? (
          <div className="repository-connector-message">
            <span>{repositoryMessage}</span>
            <a href={connectGitHubUrl}>Connect GitHub access</a>
          </div>
        ) : null}

        {isLoadingRepositories && repositories.length === 0 ? (
          <RepositoryOptionsSkeleton />
        ) : repositories.length > 0 ? (
          <div
            aria-busy={isLoadingRepositories || undefined}
            className="repository-option-list loading-cascade"
            data-loading={isLoadingRepositories ? "true" : undefined}
          >
            {repositories.map((repository) => (
              <button
                className="repository-option"
                disabled={isSaving}
                key={`${repository.full_name}-${repository.id ?? repository.html_url}`}
                onClick={() => onSelectRepository(repository)}
                type="button"
              >
                <span className="repository-option-main">
                  <strong>{repository.full_name}</strong>
                  <span>{repository.description ?? "No description"}</span>
                </span>
                <span className="repository-option-meta">
                  <span>{repository.private ? "Private" : "Public"}</span>
                  <span>
                    <GitBranch aria-hidden="true" size={14} strokeWidth={1.5} />
                    {repository.default_branch}
                  </span>
                  <span>{formatOptionalTimestamp(repository.updated_at, "Unknown")}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="repository-connector-message">
            {repositorySearchQuery.trim()
              ? "No repositories match this search."
              : "No repositories are available from GitHub yet."}
          </div>
        )}
      </div>
    </section>
  );
}

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

function CommunityPage({
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

function WorkspaceApp() {
  const initialNavigationState = useMemo(readUrlNavigationState, []);
  const [activeItem, setActiveItem] = useState<SidebarItemId>(
    initialNavigationState.activeItem,
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialNavigationState.selectedProjectId,
  );
  const [selectedProjectRouteKey, setSelectedProjectRouteKey] = useState<string | null>(
    initialNavigationState.selectedProjectRouteKey,
  );
  const [activeDetailTab, setActiveDetailTab] =
    useState<ProjectDetailTabId>(initialNavigationState.activeDetailTab);
  const [activityNavigation, setActivityNavigation] =
    useState<ActivityNavigationState>(initialNavigationState.activityNavigation);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [hasLoadedWorkspaceData, setHasLoadedWorkspaceData] = useState(false);
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  const [isProjectDetailLoading, setIsProjectDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetailData | null>(null);
  const [projectDetailError, setProjectDetailError] = useState<string | null>(null);
  const [projectGithubFiles, setProjectGithubFiles] =
    useState<ProjectGithubFilesState | null>(null);
  const [projectGithubFilesError, setProjectGithubFilesError] = useState<string | null>(
    null,
  );
  const [isProjectGithubFilesLoading, setIsProjectGithubFilesLoading] = useState(false);
  const [publishedFlows, setPublishedFlows] = useState<PublishedFlowSummary[]>([]);
  const [publishedFlowsError, setPublishedFlowsError] = useState<string | null>(null);
  const [isPublishedFlowsLoading, setIsPublishedFlowsLoading] = useState(false);
  const [selectedPublishedFlowKey, setSelectedPublishedFlowKey] =
    useState<string | null>(null);
  const [selectedPublishedFlow, setSelectedPublishedFlow] =
    useState<PublishedFlowDetailResponse | null>(null);
  const [publishedFlowDetailError, setPublishedFlowDetailError] =
    useState<string | null>(null);
  const [isPublishedFlowDetailLoading, setIsPublishedFlowDetailLoading] =
    useState(false);
  const [isPublishedFlowSaving, setIsPublishedFlowSaving] = useState(false);
  const [repositoryFileContent, setRepositoryFileContent] =
    useState<RepositoryFileContent | null>(null);
  const [repositoryFileContentError, setRepositoryFileContentError] =
    useState<string | null>(null);
  const [repositoryFileContentPath, setRepositoryFileContentPath] =
    useState<string | null>(initialNavigationState.repositoryFileContentPath);
  const [isRepositoryFileContentLoading, setIsRepositoryFileContentLoading] =
    useState(false);
  const [isRepositoryConnectorOpen, setIsRepositoryConnectorOpen] = useState(false);
  const [repositoryConnectorProjectId, setRepositoryConnectorProjectId] =
    useState<string | null>(null);
  const [repositoryUrlInput, setRepositoryUrlInput] = useState("");
  const [repositorySearchQuery, setRepositorySearchQuery] = useState("");
  const [githubRepositoryOptions, setGithubRepositoryOptions] = useState<
    GithubRepositoryOption[]
  >([]);
  const [githubRepositoriesMessage, setGithubRepositoriesMessage] =
    useState<string | null>(null);
  const [githubRepositoriesError, setGithubRepositoriesError] = useState<string | null>(
    null,
  );
  const [repositoryConnectorError, setRepositoryConnectorError] = useState<
    string | null
  >(null);
  const [isGithubRepositoriesLoading, setIsGithubRepositoriesLoading] =
    useState(false);
  const [isRepositorySaving, setIsRepositorySaving] = useState(false);
  const projects = useMemo(
    () => projectsFromEvents(events, projectSummaries),
    [events, projectSummaries],
  );
  const projectHeaderOptions = useMemo<ProjectHeaderProjectOption[]>(
    () =>
      projects.map((project) => ({
        id: project.id,
        latestUpdatedAt: project.latestUpdatedAt,
        name: project.name,
      })),
    [projects],
  );
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
  const repositoryConnectorProject =
    projects.find((project) => project.id === repositoryConnectorProjectId) ?? null;
  const filteredGithubRepositoryOptions = useMemo(() => {
    const query = repositorySearchQuery.trim().toLowerCase();
    if (!query) {
      return githubRepositoryOptions;
    }
    return githubRepositoryOptions.filter(
      (repository) =>
        repository.full_name.toLowerCase().includes(query) ||
        repository.name.toLowerCase().includes(query) ||
        (repository.description?.toLowerCase().includes(query) ?? false),
    );
  }, [githubRepositoryOptions, repositorySearchQuery]);
  const activeTitle =
    activeItem === "projects"
      ? "Projects"
      : activeItem === "community"
        ? "Community"
        : activeItem === "settings"
          ? "Settings"
          : "Profile";
  const currentNavigationState: UrlNavigationState = {
    activityNavigation,
    activeDetailTab,
    activeItem,
    repositoryFileContentPath,
    selectedProjectId,
    selectedProjectRouteKey,
  };
  const projectRouteKey = (project: Project | null | undefined) =>
    sanitizeProjectRouteKey(project?.slug) ?? project?.id ?? null;
  const projectMatchesRouteKey = (project: Project, routeKey: string) =>
    projectRouteKey(project) === routeKey || project.id === routeKey;

  const navigateWorkspace = (
    state: Partial<UrlNavigationState>,
    mode: UrlNavigationWriteMode = "push",
  ) => {
    const requestedProjectId =
      state.selectedProjectId === undefined
        ? currentNavigationState.selectedProjectId
        : state.selectedProjectId;
    const requestedProject =
      requestedProjectId === null
        ? null
        : projects.find((project) => project.id === requestedProjectId) ?? null;
    const requestedProjectRouteKey = Object.prototype.hasOwnProperty.call(
      state,
      "selectedProjectRouteKey",
    )
      ? state.selectedProjectRouteKey
      : undefined;
    const fallbackProjectRouteKey =
      requestedProjectId === null
        ? null
        : projectRouteKey(requestedProject) ??
          requestedProjectId ??
          currentNavigationState.selectedProjectRouteKey;
    const nextState = normalizeUrlNavigationState({
      ...currentNavigationState,
      ...state,
      selectedProjectRouteKey:
        requestedProjectRouteKey !== undefined
          ? requestedProjectRouteKey
          : fallbackProjectRouteKey,
    });

    setActiveItem(nextState.activeItem);
    setSelectedProjectId(nextState.selectedProjectId);
    setSelectedProjectRouteKey(nextState.selectedProjectRouteKey);
    setActiveDetailTab(nextState.activeDetailTab);
    setActivityNavigation(nextState.activityNavigation);
    setRepositoryFileContentPath(nextState.repositoryFileContentPath);

    if (nextState.repositoryFileContentPath !== repositoryFileContentPath) {
      setRepositoryFileContent(null);
      setRepositoryFileContentError(null);
      setIsRepositoryFileContentLoading(false);
    }

    writeUrlNavigationState(nextState, mode);
  };

  const loadProjectDetail = async (
    projectId: string,
    fallbackProject: Project | null,
    signal?: AbortSignal,
  ) => {
    setIsProjectDetailLoading(true);
    setProjectDetailError(null);
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/detail`, {
        credentials: "include",
        signal,
      });
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setProjectDetail(null);
        return;
      }
      if (!response.ok) {
        throw new Error(`Project detail request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as ProjectDetailApiResponse;
      setProjectDetail(projectDetailDataFromApi(payload, fallbackProject));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setProjectDetailError(
        error instanceof Error ? error.message : "Project detail request failed",
      );
    } finally {
      if (!signal?.aborted) {
        setIsProjectDetailLoading(false);
      }
    }
  };

  const loadProjectGithubFiles = async (
    projectId: string,
    signal?: AbortSignal,
  ) => {
    setIsProjectGithubFilesLoading(true);
    setProjectGithubFilesError(null);
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/github/files`, {
        credentials: "include",
        signal,
      });
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setProjectGithubFiles(null);
        return;
      }
      if (!response.ok) {
        throw new Error(`GitHub files request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as ProjectGithubFilesApiResponse;
      setProjectGithubFiles(projectGithubFilesFromApi(payload));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setProjectGithubFilesError(
        error instanceof Error ? error.message : "GitHub files request failed",
      );
    } finally {
      if (!signal?.aborted) {
        setIsProjectGithubFilesLoading(false);
      }
    }
  };

  const loadRepositoryFileContent = async (
    projectId: string,
    path: string,
    signal?: AbortSignal,
  ) => {
    setRepositoryFileContentPath(path);
    setRepositoryFileContent(null);
    setRepositoryFileContentError(null);
    setIsRepositoryFileContentLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/projects/${projectId}/github/files/content?${new URLSearchParams({
          path,
        })}`,
        {
          credentials: "include",
          signal,
        },
      );
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setRepositoryFileContent(null);
        return;
      }
      if (!response.ok) {
        const detail = await response
          .json()
          .then((payload) =>
            typeof payload?.detail === "string" ? payload.detail : null,
          )
          .catch(() => null);
        throw new Error(detail ?? `GitHub file request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as ProjectGithubFileContentApiResponse;
      setRepositoryFileContent(repositoryFileContentFromApi(payload));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setRepositoryFileContentError(
        error instanceof Error ? error.message : "GitHub file request failed",
      );
    } finally {
      if (!signal?.aborted) {
        setIsRepositoryFileContentLoading(false);
      }
    }
  };

  const loadGithubRepositories = async () => {
    setIsGithubRepositoriesLoading(true);
    setGithubRepositoriesError(null);
    setGithubRepositoriesMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/projects/github/repositories`, {
        credentials: "include",
      });
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setGithubRepositoryOptions([]);
        return;
      }
      if (!response.ok) {
        const detail = await response
          .json()
          .then((payload) =>
            typeof payload?.detail === "string" ? payload.detail : null,
          )
          .catch(() => null);
        throw new Error(detail ?? `GitHub repositories request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as GithubRepositoriesApiResponse;
      setGithubRepositoryOptions(payload.repositories);
      setGithubRepositoriesMessage(payload.available ? null : payload.message);
    } catch (error) {
      setGithubRepositoriesError(
        error instanceof Error
          ? error.message
          : "GitHub repositories request failed",
      );
      setGithubRepositoryOptions([]);
    } finally {
      setIsGithubRepositoriesLoading(false);
    }
  };

  const loadEvents = async () => {
    setIsEventsLoading(true);
    setHasLoadedWorkspaceData(false);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/events?limit=500`, {
        credentials: "include",
      });
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setEvents([]);
        setProjectSummaries([]);
        setHasLoadedWorkspaceData(false);
        return;
      }
      if (!response.ok) {
        throw new Error(`Events request failed with HTTP ${response.status}`);
      }
      const projectsResponse = await fetch(`${API_URL}/api/projects`, {
        credentials: "include",
      });
      if (!projectsResponse.ok) {
        throw new Error(`Projects request failed with HTTP ${projectsResponse.status}`);
      }
      const payload = (await response.json()) as EventRecord[];
      const projectPayload = (await projectsResponse.json()) as ProjectSummary[];
      setEvents(payload);
      setProjectSummaries(projectPayload);
      setHasLoadedWorkspaceData(true);
      setAuthStatus("authenticated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Events request failed");
      setHasLoadedWorkspaceData(true);
      setAuthStatus((status) =>
        status === "loading" ? "error" : status,
      );
    } finally {
      setIsEventsLoading(false);
    }
  };

  const loadPublishedFlows = async () => {
    setIsPublishedFlowsLoading(true);
    setPublishedFlowsError(null);
    try {
      const response = await fetch(`${API_URL}/api/published-flows`, {
        credentials: "include",
      });
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setPublishedFlows([]);
        return;
      }
      if (!response.ok) {
        throw new Error(`Prompt flows request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as PublishedFlowSummary[];
      setPublishedFlows(payload);
      if (!selectedPublishedFlowKey && payload.length > 0) {
        setSelectedPublishedFlowKey(payload[0].slug);
      }
    } catch (error) {
      setPublishedFlowsError(
        error instanceof Error ? error.message : "Prompt flows request failed",
      );
      setPublishedFlows([]);
    } finally {
      setIsPublishedFlowsLoading(false);
    }
  };

  const loadPublishedFlowDetail = async (flowKey: string) => {
    setSelectedPublishedFlowKey(flowKey);
    setSelectedPublishedFlow(null);
    setPublishedFlowDetailError(null);
    setIsPublishedFlowDetailLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/published-flows/${flowKey}`, {
        credentials: "include",
      });
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setSelectedPublishedFlow(null);
        return;
      }
      if (!response.ok) {
        const detail = await response
          .json()
          .then((payload) =>
            typeof payload?.detail === "string" ? payload.detail : null,
          )
          .catch(() => null);
        throw new Error(detail ?? `Prompt flow request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as PublishedFlowDetailResponse;
      setSelectedPublishedFlow(payload);
    } catch (error) {
      setPublishedFlowDetailError(
        error instanceof Error ? error.message : "Prompt flow request failed",
      );
    } finally {
      setIsPublishedFlowDetailLoading(false);
    }
  };

  const applyPublishedFlowUpdate = (flow: PublishedFlowDetailResponse) => {
    setPublishedFlows((current) => {
      const next = current.map((item) => (item.id === flow.id ? flow : item));
      return next.some((item) => item.id === flow.id) ? next : [flow, ...current];
    });
    setSelectedPublishedFlowKey(flow.slug);
    setSelectedPublishedFlow(flow);
    setPublishedFlowsError(null);
    setPublishedFlowDetailError(null);
  };

  const publishPromptFlow = async (
    payload: PromptFlowPublishPayload,
  ): Promise<PublishedFlowDetailResponse> => {
    const response = await fetch(`${API_URL}/api/published-flows`, {
      body: JSON.stringify(payload),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (response.status === 401) {
      setAuthStatus("unauthenticated");
      setCurrentUser(null);
      throw new Error("Sign in again before publishing.");
    }
    if (!response.ok) {
      const detail = await response
        .json()
        .then((errorPayload) =>
          typeof errorPayload?.detail === "string" ? errorPayload.detail : null,
        )
        .catch(() => null);
      throw new Error(detail ?? `Publish request failed with HTTP ${response.status}`);
    }

    const flow = (await response.json()) as PublishedFlowDetailResponse;
    applyPublishedFlowUpdate(flow);
    navigateWorkspace({
      activeItem: "community",
      repositoryFileContentPath: null,
      selectedProjectId: null,
      selectedProjectRouteKey: null,
    });
    return flow;
  };

  const savePromptFlowDraft = async (
    payload: PromptFlowPublishPayload,
  ): Promise<PublishedFlowDetailResponse> => {
    setIsPublishedFlowSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/published-flows`, {
        body: JSON.stringify({ ...payload, status: "draft" }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        throw new Error("Sign in again before saving.");
      }
      if (!response.ok) {
        const detail = await response
          .json()
          .then((errorPayload) =>
            typeof errorPayload?.detail === "string" ? errorPayload.detail : null,
          )
          .catch(() => null);
        throw new Error(detail ?? `Draft request failed with HTTP ${response.status}`);
      }

      const flow = (await response.json()) as PublishedFlowDetailResponse;
      applyPublishedFlowUpdate(flow);
      return flow;
    } finally {
      setIsPublishedFlowSaving(false);
    }
  };

  const updatePublishedFlow = async (
    flowKey: string,
    payload: PromptFlowUpdatePayload,
  ): Promise<PublishedFlowDetailResponse> => {
    setIsPublishedFlowSaving(true);
    try {
      const response = await fetch(
        `${API_URL}/api/published-flows/${encodeURIComponent(flowKey)}`,
        {
          body: JSON.stringify(payload),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        throw new Error("Sign in again before saving.");
      }
      if (!response.ok) {
        const detail = await response
          .json()
          .then((errorPayload) =>
            typeof errorPayload?.detail === "string" ? errorPayload.detail : null,
          )
          .catch(() => null);
        throw new Error(detail ?? `Update request failed with HTTP ${response.status}`);
      }

      const flow = (await response.json()) as PublishedFlowDetailResponse;
      applyPublishedFlowUpdate(flow);
      return flow;
    } finally {
      setIsPublishedFlowSaving(false);
    }
  };

  const uploadPublishedFlowAsset = async (
    flowKey: string,
    file: File,
    altText?: string,
  ): Promise<PublishedFlowAsset> => {
    const formData = new FormData();
    formData.append("file", file);
    if (altText?.trim()) {
      formData.append("alt_text", altText.trim());
    }

    const response = await fetch(
      `${API_URL}/api/published-flows/${encodeURIComponent(flowKey)}/assets`,
      {
        body: formData,
        credentials: "include",
        method: "POST",
      },
    );
    if (response.status === 401) {
      setAuthStatus("unauthenticated");
      setCurrentUser(null);
      throw new Error("Sign in again before uploading images.");
    }
    if (!response.ok) {
      const detail = await response
        .json()
        .then((errorPayload) =>
          typeof errorPayload?.detail === "string" ? errorPayload.detail : null,
        )
        .catch(() => null);
      throw new Error(detail ?? `Image upload failed with HTTP ${response.status}`);
    }

    return (await response.json()) as PublishedFlowAsset;
  };

  const archivePublishedFlow = async (
    flowKey: string,
  ): Promise<PublishedFlowDetailResponse> => {
    setIsPublishedFlowSaving(true);
    try {
      const response = await fetch(
        `${API_URL}/api/published-flows/${encodeURIComponent(flowKey)}/archive`,
        {
          credentials: "include",
          method: "POST",
        },
      );
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        throw new Error("Sign in again before archiving.");
      }
      if (!response.ok) {
        const detail = await response
          .json()
          .then((errorPayload) =>
            typeof errorPayload?.detail === "string" ? errorPayload.detail : null,
          )
          .catch(() => null);
        throw new Error(detail ?? `Archive request failed with HTTP ${response.status}`);
      }

      const flow = (await response.json()) as PublishedFlowDetailResponse;
      applyPublishedFlowUpdate(flow);
      return flow;
    } finally {
      setIsPublishedFlowSaving(false);
    }
  };

  const openRepositoryConnector = (projectId: string | null = null) => {
    setRepositoryConnectorProjectId(projectId);
    setRepositoryConnectorError(null);
    setRepositoryUrlInput("");
    setRepositorySearchQuery("");
    setIsRepositoryConnectorOpen(true);
    void loadGithubRepositories();
  };

  const closeRepositoryConnector = () => {
    setIsRepositoryConnectorOpen(false);
    setRepositoryConnectorProjectId(null);
    setRepositoryConnectorError(null);
    setRepositoryUrlInput("");
    setRepositorySearchQuery("");
  };

  const saveRepositoryConnection = async (githubUrl: string) => {
    const trimmedUrl = githubUrl.trim();
    if (!trimmedUrl) {
      setRepositoryConnectorError("Enter a GitHub repository URL.");
      return;
    }

    setIsRepositorySaving(true);
    setRepositoryConnectorError(null);
    try {
      const isProjectUpdate = repositoryConnectorProjectId !== null;
      const response = await fetch(
        isProjectUpdate
          ? `${API_URL}/api/projects/${repositoryConnectorProjectId}/repository`
          : `${API_URL}/api/projects`,
        {
          body: JSON.stringify({ github_url: trimmedUrl }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: isProjectUpdate ? "PATCH" : "POST",
        },
      );
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        return;
      }
      if (!response.ok) {
        const detail = await response
          .json()
          .then((payload) =>
            typeof payload?.detail === "string" ? payload.detail : null,
          )
          .catch(() => null);
        throw new Error(detail ?? `Repository connection failed with HTTP ${response.status}`);
      }

      const project = (await response.json()) as ProjectSummary;
      closeRepositoryConnector();
      await loadEvents();
      navigateWorkspace({
        activeDetailTab: "files",
        activeItem: "projects",
        repositoryFileContentPath: null,
        selectedProjectId: project.id,
        selectedProjectRouteKey: project.slug ?? project.id,
      });
      setProjectDetail(null);
      setProjectGithubFiles(null);
      setRepositoryFileContent(null);
      setRepositoryFileContentError(null);
      setRepositoryFileContentPath(null);
      void loadProjectDetail(project.id, null);
      void loadProjectGithubFiles(project.id);
    } catch (error) {
      setRepositoryConnectorError(
        error instanceof Error ? error.message : "Repository connection failed",
      );
    } finally {
      setIsRepositorySaving(false);
    }
  };

  const loadSession = async () => {
    setAuthStatus("loading");
    setHasLoadedWorkspaceData(false);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
      });
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setEvents([]);
        setProjectSummaries([]);
        setHasLoadedWorkspaceData(false);
        return;
      }
      if (!response.ok) {
        throw new Error(`Session request failed with HTTP ${response.status}`);
      }
      const user = (await response.json()) as AuthUser;
      setCurrentUser(user);
      setAuthStatus("authenticated");
      await loadEvents();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Session request failed");
      setAuthStatus("error");
    }
  };

  const logout = async () => {
    await fetch(`${API_URL}/api/auth/logout`, {
      credentials: "include",
      method: "POST",
    });
    setCurrentUser(null);
    setEvents([]);
    setProjectSummaries([]);
    setHasLoadedWorkspaceData(false);
    setSelectedProjectId(null);
    setSelectedProjectRouteKey(null);
    setActiveItem("projects");
    setActiveDetailTab("overview");
    setActivityNavigation(DEFAULT_URL_NAVIGATION_STATE.activityNavigation);
    setProjectDetail(null);
    setProjectDetailError(null);
    setProjectGithubFiles(null);
    setProjectGithubFilesError(null);
    setPublishedFlows([]);
    setPublishedFlowsError(null);
    setSelectedPublishedFlowKey(null);
    setSelectedPublishedFlow(null);
    setPublishedFlowDetailError(null);
    setRepositoryFileContent(null);
    setRepositoryFileContentError(null);
    setRepositoryFileContentPath(null);
    setIsRepositoryConnectorOpen(false);
    setRepositoryConnectorProjectId(null);
    setRepositoryConnectorError(null);
    setRepositoryUrlInput("");
    setRepositorySearchQuery("");
    setGithubRepositoryOptions([]);
    setGithubRepositoriesMessage(null);
    setGithubRepositoriesError(null);
    setAuthStatus("unauthenticated");
    writeUrlNavigationState(DEFAULT_URL_NAVIGATION_STATE, "replace");
  };

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated" || activeItem !== "community") {
      return;
    }
    void loadPublishedFlows();
  }, [activeItem, authStatus]);

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      activeItem !== "community" ||
      !selectedPublishedFlowKey
    ) {
      return;
    }
    if (selectedPublishedFlow?.slug === selectedPublishedFlowKey) {
      return;
    }
    void loadPublishedFlowDetail(selectedPublishedFlowKey);
  }, [activeItem, authStatus, selectedPublishedFlowKey]);

  useEffect(() => {
    writeUrlNavigationState(initialNavigationState, "replace");
  }, [initialNavigationState]);

  useEffect(() => {
    const handlePopState = () => {
      const nextState = readUrlNavigationState();
      setActiveItem(nextState.activeItem);
      setSelectedProjectId(nextState.selectedProjectId);
      setSelectedProjectRouteKey(nextState.selectedProjectRouteKey);
      setActiveDetailTab(nextState.activeDetailTab);
      setActivityNavigation(nextState.activityNavigation);
      setRepositoryFileContentPath(nextState.repositoryFileContentPath);
      setIsRepositoryConnectorOpen(false);
      setRepositoryConnectorProjectId(null);
      setRepositoryConnectorError(null);
      setRepositoryUrlInput("");
      setRepositorySearchQuery("");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!hasLoadedWorkspaceData || activeItem !== "projects") {
      return;
    }

    if (!selectedProjectId && selectedProjectRouteKey) {
      const resolvedProject = projects.find((project) =>
        projectMatchesRouteKey(project, selectedProjectRouteKey),
      );

      if (resolvedProject) {
        navigateWorkspace(
          {
            selectedProjectId: resolvedProject.id,
            selectedProjectRouteKey: projectRouteKey(resolvedProject),
          },
          "replace",
        );
        return;
      }

      navigateWorkspace(
        {
          activeDetailTab: "overview",
          activeItem: "projects",
          repositoryFileContentPath: null,
          selectedProjectId: null,
          selectedProjectRouteKey: null,
        },
        "replace",
      );
      return;
    }

    if (!selectedProjectId) {
      return;
    }

    const resolvedProject =
      projects.find((project) => project.id === selectedProjectId) ??
      (selectedProjectRouteKey
        ? projects.find((project) =>
            projectMatchesRouteKey(project, selectedProjectRouteKey),
          )
        : null);
    if (!resolvedProject) {
      navigateWorkspace(
        {
          activeDetailTab: "overview",
          activeItem: "projects",
          repositoryFileContentPath: null,
          selectedProjectId: null,
          selectedProjectRouteKey: null,
        },
        "replace",
      );
      return;
    }

    const resolvedProjectRouteKey = projectRouteKey(resolvedProject);
    if (
      resolvedProjectRouteKey &&
      (selectedProjectId !== resolvedProject.id ||
        selectedProjectRouteKey !== resolvedProjectRouteKey)
    ) {
      navigateWorkspace(
        {
          selectedProjectId: resolvedProject.id,
          selectedProjectRouteKey: resolvedProjectRouteKey,
        },
        "replace",
      );
    }
  }, [activeItem, hasLoadedWorkspaceData, projects, selectedProjectId, selectedProjectRouteKey]);

  useEffect(() => {
    if (activeItem !== "projects" || (!selectedProjectId && !selectedProjectRouteKey)) {
      setProjectDetail(null);
      setProjectDetailError(null);
      setProjectGithubFiles(null);
      setProjectGithubFilesError(null);
      setRepositoryFileContent(null);
      setRepositoryFileContentError(null);
      setRepositoryFileContentPath(null);
      setIsProjectDetailLoading(false);
      setIsProjectGithubFilesLoading(false);
      setIsRepositoryFileContentLoading(false);
      return;
    }

    if (!selectedProjectId) {
      setProjectDetail(null);
      setProjectDetailError(null);
      setProjectGithubFiles(null);
      setProjectGithubFilesError(null);
      setRepositoryFileContent(null);
      setRepositoryFileContentError(null);
      setIsProjectDetailLoading(false);
      setIsProjectGithubFilesLoading(false);
      setIsRepositoryFileContentLoading(false);
      return;
    }

    const detailController = new AbortController();
    const githubFilesController = new AbortController();
    setProjectDetail(null);
    setProjectGithubFiles(null);
    setRepositoryFileContent(null);
    setRepositoryFileContentError(null);
    void loadProjectDetail(selectedProjectId, selectedProject, detailController.signal);
    void loadProjectGithubFiles(selectedProjectId, githubFilesController.signal);
    return () => {
      detailController.abort();
      githubFilesController.abort();
    };
  }, [activeItem, selectedProjectId, selectedProjectRouteKey]);

  useEffect(() => {
    if (
      !selectedProjectId ||
      activeItem !== "projects" ||
      activeDetailTab !== "files" ||
      !repositoryFileContentPath
    ) {
      setRepositoryFileContent(null);
      setRepositoryFileContentError(null);
      setIsRepositoryFileContentLoading(false);
      return;
    }

    const controller = new AbortController();
    void loadRepositoryFileContent(
      selectedProjectId,
      repositoryFileContentPath,
      controller.signal,
    );
    return () => controller.abort();
  }, [activeDetailTab, activeItem, repositoryFileContentPath, selectedProjectId]);

  const openProjectDetail = (projectId: string) => {
    closeRepositoryConnector();
    navigateWorkspace({
      activeDetailTab: "overview",
      activeItem: "projects",
      repositoryFileContentPath: null,
      selectedProjectId: projectId,
    });
  };
  const switchProjectDetail = (projectId: string) => {
    if (projectId === selectedProjectId) {
      return;
    }

    closeRepositoryConnector();
    setProjectDetail(null);
    setProjectDetailError(null);
    setProjectGithubFiles(null);
    setProjectGithubFilesError(null);
    setRepositoryFileContent(null);
    setRepositoryFileContentError(null);
    navigateWorkspace({
      activeDetailTab,
      activeItem: "projects",
      activityNavigation: DEFAULT_URL_NAVIGATION_STATE.activityNavigation,
      repositoryFileContentPath: null,
      selectedProjectId: projectId,
    });
  };
  const closeProjectDetail = () => {
    closeRepositoryConnector();
    navigateWorkspace({
      activeDetailTab: "overview",
      activeItem: "projects",
      repositoryFileContentPath: null,
      selectedProjectId: null,
    });
    setProjectDetail(null);
    setProjectDetailError(null);
    setProjectGithubFiles(null);
    setProjectGithubFilesError(null);
    setRepositoryFileContent(null);
    setRepositoryFileContentError(null);
    setRepositoryFileContentPath(null);
  };
  const selectSidebarItem = (item: SidebarItemId) => {
    if (item === "projects" && selectedProjectId) {
      closeProjectDetail();
      return;
    }

    closeRepositoryConnector();
    navigateWorkspace({
      activeDetailTab: "overview",
      activeItem: item,
      repositoryFileContentPath: null,
      selectedProjectId: null,
    });
  };
  const selectProjectDetailTab = (tab: ProjectDetailTabId) => {
    navigateWorkspace({
      activeDetailTab: tab,
      activeItem: "projects",
      repositoryFileContentPath:
        tab === "files" ? repositoryFileContentPath : null,
    });
  };
  const selectRepositoryFile = (path: string) => {
    navigateWorkspace({
      activeDetailTab: "files",
      activeItem: "projects",
      repositoryFileContentPath: path,
    });
  };
  const selectActivityNavigation = (nextActivityNavigation: ActivityNavigationState) => {
    navigateWorkspace({
      activeDetailTab: "ai-activity",
      activeItem: "projects",
      activityNavigation: nextActivityNavigation,
      repositoryFileContentPath: null,
    });
  };

  if (authStatus === "loading") {
    return <LoadingScreen />;
  }

  if (authStatus === "unauthenticated") {
    return <WebLoginPage errorMessage={null} />;
  }

  if (authStatus === "error") {
    return <WebLoginPage errorMessage={errorMessage} isError />;
  }

  const selectedProjectDetailData =
    selectedProject === null
      ? null
      : {
          ...(projectDetail ?? emptyProjectDetailData(selectedProject)),
          repositoryFileContent,
          repositoryFileContentError: repositoryFileContentError ?? undefined,
          repositoryFileContentLoading: isRepositoryFileContentLoading,
          repositoryFileSelectedPath: repositoryFileContentPath,
          repositoryFiles: projectGithubFiles?.files ?? [],
          repositoryFilesConnectUrl: githubRepositoryConnectUrl(),
          repositoryFilesLoading: isProjectGithubFilesLoading,
          repositoryFilesMessage: isProjectGithubFilesLoading
            ? "Loading GitHub repository files."
            : projectGithubFilesError ??
              projectGithubFiles?.message ??
              (selectedProject.githubUrl
                ? "Sign in again with GitHub repository access to browse repository files."
                : "This project does not have a GitHub repository remote."),
          repositoryFilesRepository: projectGithubFiles?.repository,
          repositoryFilesStatus: projectGithubFiles?.status,
          repositoryFilesTruncated: projectGithubFiles?.truncated,
        };
  const repositoryConnector = isRepositoryConnectorOpen ? (
    <RepositoryConnector
      connectGitHubUrl={githubRepositoryConnectUrl()}
      errorMessage={repositoryConnectorError ?? githubRepositoriesError}
      isLoadingRepositories={isGithubRepositoriesLoading}
      isSaving={isRepositorySaving}
      mode={repositoryConnectorProjectId ? "connect" : "create"}
      onClose={closeRepositoryConnector}
      onReloadRepositories={loadGithubRepositories}
      onRepositorySearchQueryChange={setRepositorySearchQuery}
      onRepositoryUrlInputChange={setRepositoryUrlInput}
      onSelectRepository={(repository) => {
        void saveRepositoryConnection(repository.html_url);
      }}
      onSubmitUrl={() => {
        void saveRepositoryConnection(repositoryUrlInput);
      }}
      repositories={filteredGithubRepositoryOptions}
      repositoryMessage={githubRepositoriesMessage}
      repositorySearchQuery={repositorySearchQuery}
      repositoryUrlInput={repositoryUrlInput}
      targetProjectName={repositoryConnectorProject?.name}
    />
  ) : null;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-header">
          <BrandLockup />
        </div>

        <div className="sidebar-divider" />

        <nav className="sidebar-nav" aria-label="Workspace">
          <button
            aria-pressed={activeItem === "projects"}
            className="sidebar-item"
            data-active={activeItem === "projects"}
            onClick={() => selectSidebarItem("projects")}
            type="button"
          >
            <Folder
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            Projects
          </button>
          <button
            aria-pressed={activeItem === "community"}
            className="sidebar-item"
            data-active={activeItem === "community"}
            onClick={() => selectSidebarItem("community")}
            type="button"
          >
            <Share2
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            Community
          </button>
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-divider" />

        <div className="sidebar-footer">
          <button
            aria-pressed={activeItem === "profile"}
            className="sidebar-item profile-item"
            data-active={activeItem === "profile"}
            onClick={() => selectSidebarItem("profile")}
            type="button"
          >
            <User
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            <span>{currentUser?.username ?? "Profile"}</span>
          </button>

          <button
            aria-pressed={activeItem === "settings"}
            className="sidebar-item"
            data-active={activeItem === "settings"}
            onClick={() => selectSidebarItem("settings")}
            type="button"
          >
            <Settings
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            <span>Settings</span>
          </button>

          <button className="sidebar-item" onClick={logout} type="button">
            <LogOut
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="page">
        {activeItem === "projects" && selectedProject ? (
          <>
            {repositoryConnector}
            <ProjectDetailPage
              activityNavigation={activityNavigation}
              activeTab={activeDetailTab}
              data={selectedProjectDetailData ?? emptyProjectDetailData(selectedProject)}
              errorMessage={projectDetailError}
              isLoading={isProjectDetailLoading && projectDetail === null}
              isRefreshing={isProjectDetailLoading && projectDetail !== null}
              onActivityNavigationChange={selectActivityNavigation}
              onConnectRepository={() => openRepositoryConnector(selectedProject.id)}
              onOpenAllProjects={closeProjectDetail}
              onPublishFlow={publishPromptFlow}
              onProjectSelect={switchProjectDetail}
              onRepositoryFileSelect={selectRepositoryFile}
              onSaveFlowDraft={savePromptFlowDraft}
              onTabChange={selectProjectDetailTab}
              onUpdateFlow={updatePublishedFlow}
              onUploadFlowAsset={uploadPublishedFlowAsset}
              projectOptions={projectHeaderOptions}
              onRetry={() => {
                void loadProjectDetail(selectedProject.id, selectedProject);
                void loadProjectGithubFiles(selectedProject.id);
                if (repositoryFileContentPath) {
                  void loadRepositoryFileContent(
                    selectedProject.id,
                    repositoryFileContentPath,
                  );
                }
              }}
            />
          </>
        ) : activeItem === "projects" ? (
          <>
            <header className="page-header">
              <div>
                <h1>{activeTitle}</h1>
              </div>
              <div className="page-actions">
                <button
                  className="toolbar-button"
                  onClick={() => openRepositoryConnector(null)}
                  type="button"
                >
                  <Plus
                    aria-hidden="true"
                    size={16}
                    strokeWidth={1.5}
                  />
                  <span>Connect Repository</span>
                </button>
                <button
                  className="toolbar-button"
                  disabled={isEventsLoading}
                  onClick={loadEvents}
                  type="button"
                >
                  <RefreshCw
                    aria-hidden="true"
                    size={16}
                    strokeWidth={1.5}
                  />
                  <span>{isEventsLoading ? "Refreshing" : "Refresh"}</span>
                </button>
                <span className="status-pill">{projects.length} projects</span>
              </div>
            </header>

            {repositoryConnector}

            <section
              className="projects-section"
              aria-labelledby="projects-title"
            >
              <div className="section-header">
                <div>
                  <h2 id="projects-title">Active projects</h2>
                  <p>Recent AI workspaces and connected repository context.</p>
                </div>
              </div>

              {isEventsLoading && projects.length === 0 ? (
                <ProjectGridSkeleton />
              ) : errorMessage ? (
                <EmptyState
                  description={errorMessage}
                  eyebrow="Sync issue"
                  icon={RefreshCw}
                  title="Could not load events"
                >
                  <button
                    className="empty-state-button"
                    disabled={isEventsLoading}
                    onClick={loadEvents}
                    type="button"
                  >
                    <RefreshCw
                      aria-hidden="true"
                      size={16}
                      strokeWidth={1.5}
                    />
                    <span>{isEventsLoading ? "Retrying" : "Retry"}</span>
                  </button>
                </EmptyState>
              ) : projects.length === 0 ? (
                <EmptyState
                  description={`${BRAND_NAME} is ready for the first collector upload from this workspace.`}
                  eyebrow="Waiting for data"
                  icon={Terminal}
                  title="No events yet"
                >
                  <div className="empty-state-actions">
                    <button
                      className="empty-state-button"
                      onClick={() => openRepositoryConnector(null)}
                      type="button"
                    >
                      <Plus aria-hidden="true" size={16} strokeWidth={1.5} />
                      <span>Connect Repository</span>
                    </button>
                  </div>
                  <div className="empty-state-steps" aria-hidden="true">
                    <span>Connect repo</span>
                    <span>Install collector</span>
                    <span>First event</span>
                  </div>
                </EmptyState>
              ) : (
                <div
                  aria-busy={isEventsLoading || undefined}
                  className="projects-grid loading-cascade"
                  data-loading={isEventsLoading ? "true" : undefined}
                >
                  {projects.map((project) => (
                  <article
                    aria-label={`Open ${project.name} details`}
                    className="project-card"
                    key={project.id}
                    onClick={() => openProjectDetail(project.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProjectDetail(project.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="project-card-header">
                      <h3>{project.name}</h3>
                      {project.githubUrl ? (
                        <a
                          aria-label={`Open ${project.name} on GitHub`}
                          className="github-button"
                          href={project.githubUrl}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <GitHubIcon />
                          <span>GitHub</span>
                          <ExternalLink
                            aria-hidden="true"
                            size={14}
                            strokeWidth={1.5}
                          />
                        </a>
                      ) : (
                        <button
                          className="github-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openRepositoryConnector(project.id);
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                          type="button"
                        >
                          <GitHubIcon />
                          <span>Connect</span>
                        </button>
                      )}
                    </div>

                    <dl className="project-meta">
                      <div>
                        <dt>
                          <Clock
                            aria-hidden="true"
                            size={15}
                            strokeWidth={1.5}
                          />
                          Latest update
                        </dt>
                        <dd>{project.latestUpdatedAt}</dd>
                      </div>
                    </dl>

                    <dl className="project-stats" aria-label="Project activity">
                      <div>
                        <dt>Sessions</dt>
                        <dd>{project.sessions}</dd>
                      </div>
                      <div>
                        <dt>Events</dt>
                        <dd>{formatCompactNumber(project.events)}</dd>
                      </div>
                      <div>
                        <dt>Files</dt>
                        <dd>{formatCompactNumber(project.filesChanged)}</dd>
                      </div>
                    </dl>

                    <div className="model-group" aria-label="Models used">
                      <span className="model-group-label">
                        <Bot aria-hidden="true" size={15} strokeWidth={1.5} />
                        Model
                      </span>
                      <div className="model-list">
                        {project.models.length > 0 ? project.models.map((model) => (
                          <AiModelBadge className="is-compact" key={model} model={model} />
                        )) : (
                          <span className="ai-model-badge is-compact is-muted">
                            Model unknown
                          </span>
                        )}
                      </div>
                    </div>

                  </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : activeItem === "community" ? (
          <>
            <header className="page-header">
              <div>
                <h1>{activeTitle}</h1>
              </div>
              <div className="page-actions">
                <button
                  className="toolbar-button"
                  disabled={isPublishedFlowsLoading}
                  onClick={loadPublishedFlows}
                  type="button"
                >
                  <RefreshCw
                    aria-hidden="true"
                    size={16}
                    strokeWidth={1.5}
                  />
                  <span>{isPublishedFlowsLoading ? "Refreshing" : "Refresh"}</span>
                </button>
                <span className="status-pill">
                  {publishedFlows.length} flows
                </span>
              </div>
            </header>

            {publishedFlowDetailError ? (
              <div className="auth-message" data-error="true">
                {publishedFlowDetailError}
              </div>
            ) : null}

            <CommunityPage
              errorMessage={publishedFlowsError}
              flows={publishedFlows}
              isDetailLoading={isPublishedFlowDetailLoading}
              isLoading={isPublishedFlowsLoading}
              isSaving={isPublishedFlowSaving}
              onArchiveFlow={archivePublishedFlow}
              onReload={loadPublishedFlows}
              onSelectFlow={(flowKey) => {
                void loadPublishedFlowDetail(flowKey);
              }}
              onUpdateFlow={updatePublishedFlow}
              onUploadAsset={uploadPublishedFlowAsset}
              selectedFlow={selectedPublishedFlow}
            />
          </>
        ) : (
          <>
            <header className="page-header">
              <div>
                <h1>{activeTitle}</h1>
              </div>
            </header>

            {activeItem === "profile" ? (
              <EmptyState
                description={
                  currentUser?.email ??
                  "Your GitHub account is connected to this workspace."
                }
                eyebrow="Profile"
                icon={User}
                title={currentUser?.username ?? "Profile"}
              >
                <div className="profile-summary">
                  <div className="profile-avatar" aria-hidden="true">
                    {currentUser?.avatar_url ? (
                      <img alt="" src={currentUser.avatar_url} />
                    ) : (
                      <span>
                        {(currentUser?.username ?? "U").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="profile-summary-copy">
                    <strong>{currentUser?.username ?? "Signed in"}</strong>
                    <span>{currentUser?.email ?? "GitHub authenticated"}</span>
                  </div>
                  <span className="profile-status">Active session</span>
                </div>
              </EmptyState>
            ) : (
              <EmptyState
                description="Workspace controls will be grouped into focused sections as they become available."
                eyebrow="Settings"
                icon={Settings}
                title="Settings are ready for configuration"
              >
                <div className="settings-preview-grid" aria-hidden="true">
                  <div>
                    <ShieldCheck size={17} strokeWidth={1.5} />
                    <span>Security</span>
                  </div>
                  <div>
                    <Terminal size={17} strokeWidth={1.5} />
                    <span>Collector</span>
                  </div>
                  <div>
                    <RefreshCw size={17} strokeWidth={1.5} />
                    <span>Sync</span>
                  </div>
                </div>
              </EmptyState>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  if (window.location.pathname === "/cli/login") {
    return <CliLoginPage />;
  }

  return <WorkspaceApp />;
}

export default App;
