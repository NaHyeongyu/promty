import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  Clock,
  Copy,
  Database,
  ExternalLink,
  Folder,
  Gauge,
  ImagePlus,
  KeyRound,
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

type SidebarItemId = "projects" | "community" | "admin" | "settings" | "profile";

type Project = {
  id: string;
  name: string;
  createdTimestamp: string;
  slug?: string;
  tags: string[];
  visibility: "private" | "public";
  latestTimestamp: string;
  latestUpdatedAt: string;
  latestActivityLabel: string;
  sessions: number;
  events: number;
  filesChanged: number;
  prompts: number;
  trackedFiles: number;
  models: string[];
  githubUrl?: string;
};

const MOCK_GITHUB_UNLINKED_PROJECT_ID = "mock-github-unlinked-project";

type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
  is_admin?: boolean;
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
  created_at: string;
  connected_models: string[];
  tags: string[];
  sessions: number;
  events: number;
  prompts: number;
  tracked_files: number;
  latest_event_at: string | null;
  updated_at: string;
  visibility: "private" | "public";
};

type ProjectSortMode = "recent" | "added";

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
  memory?: {
    latest_artifact_at: string | null;
    recent_artifacts: Array<{
      changed_file_count: number;
      changed_files?: Array<{
        additions?: number | null;
        deletions?: number | null;
        path: string;
        status?: string | null;
      }>;
      commit_sha?: string | null;
      created_at: string | null;
      end_sequence?: number | null;
      generator: string | null;
      id: string;
      memory_scope?: string | null;
      model: string | null;
      outcome: string | null;
      prompt_count?: number | null;
      reason?: string | null;
      sections?: Array<{
        summary: string;
        title: string;
      }>;
      session_id: string | null;
      slice_index?: number | null;
      start_sequence?: number | null;
      summary: string | null;
      tags: string[];
      technologies?: string[];
      title: string;
      updated_at: string | null;
      window_reason?: string | null;
      versions?: Array<{
        changed_file_count: number;
        changed_files?: Array<{
          additions?: number | null;
          deletions?: number | null;
          path: string;
          status?: string | null;
        }>;
        commit_sha?: string | null;
        created_at: string | null;
        end_sequence?: number | null;
        generator: string | null;
        id: string;
        memory_scope?: string | null;
        model: string | null;
        outcome: string | null;
        prompt_count?: number | null;
        reason?: string | null;
        sections?: Array<{
          summary: string;
          title: string;
        }>;
        session_id: string | null;
        slice_index?: number | null;
        start_sequence?: number | null;
        summary: string | null;
        tags: string[];
        technologies?: string[];
        title: string;
        version: number;
        window_reason?: string | null;
      }>;
    }>;
    total_artifacts: number;
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
    files_changed_since_yesterday?: number;
    latest_activity_at: string | null;
    last_modified_at: string | null;
    memory_artifacts_since_yesterday?: number;
    prompts_since_yesterday?: number;
    repository_connected: boolean;
    sessions_since_yesterday?: number;
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
    tags?: string[];
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

type AdminOverview = {
  breakdowns: {
    events_by_tool: Array<{ count: number; key: string }>;
    events_by_type: Array<{ count: number; key: string }>;
    jobs_by_status: Array<{ count: number; key: string }>;
    projects_by_visibility: Array<{ count: number; key: string }>;
  };
  generated_at: string | null;
  metrics: {
    active_collector_tokens: number;
    events: number;
    events_24h: number;
    events_7d: number;
    github_connections: number;
    memory_artifacts: number;
    projects: number;
    prompts: number;
    responses: number;
    sessions: number;
    tracked_files: number;
    users: number;
  };
  recent_events: Array<{
    created_at: string | null;
    event_type: string;
    id: string;
    project_id: string;
    sequence: number;
    session_id: string;
    tool: string;
  }>;
  recent_projects: Array<{
    counts: {
      events: number;
      files: number;
      prompts: number;
      sessions: number;
    };
    default_branch: string;
    github_connected: boolean;
    id: string;
    latest_event_at: string | null;
    name: string;
    owner: {
      id: string;
      username: string;
    };
    slug: string;
    tags: string[];
    updated_at: string | null;
  }>;
  recent_users: Array<{
    created_at: string | null;
    email: string | null;
    github_connected: boolean;
    id: string;
    project_count: number;
    username: string;
  }>;
  risks: Array<{
    detail: string;
    severity: string;
    title: string;
  }>;
  system: {
    admin_configured: boolean;
    app_url: string;
    cors_origins: string[];
    gemini_configured: boolean;
    memory_generator: string;
    published_flows_enabled: boolean;
    session_cookie_secure: boolean;
    session_cookie_samesite: string;
  };
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
const COMMUNITY_FEATURE_ENABLED = false;
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
  "memory",
  "ai-activity",
  "files",
]);
const SIDEBAR_ITEM_IDS = new Set<SidebarItemId>([
  "admin",
  "projects",
  "settings",
  "profile",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ROUTE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,254}$/i;
const UUID_ROUTE_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const ACTIVITY_ROUTE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
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

function sanitizeActivityRouteId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const routeId = value.trim();
  return ACTIVITY_ROUTE_ID_PATTERN.test(routeId) ? routeId : null;
}

function activityIdToRouteKey(value: string | null | undefined) {
  return uuidToRouteKey(value) ?? sanitizeActivityRouteId(value);
}

function activityRouteKeyToId(value: string | null | undefined) {
  return routeKeyToUuid(value) ?? sanitizeActivityRouteId(value);
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
        ? activityRouteKeyToId(state.activityNavigation?.selectedPromptId)
        : null,
    selectedSessionId:
      activeItem === "projects" &&
      hasSelectedProject &&
      activeDetailTab === "ai-activity" &&
      activityView === "sessions"
        ? activityRouteKeyToId(state.activityNavigation?.selectedSessionId)
        : null,
    selectedSessionPromptId:
      activeItem === "projects" &&
      hasSelectedProject &&
      activeDetailTab === "ai-activity" &&
      activityView === "sessions"
        ? activityRouteKeyToId(state.activityNavigation?.selectedSessionPromptId)
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
  const previewMode = new URLSearchParams(window.location.search).get("preview");

  if (
    previewMode === "empty-projects" ||
    previewMode === "github-unlinked-project" ||
    previewMode === "project-loading"
  ) {
    params.set("preview", previewMode);
  }

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
          activityIdToRouteKey(state.activityNavigation.selectedPromptId) ??
            state.activityNavigation.selectedPromptId,
        );
      }

      if (
        state.activityNavigation.view === "sessions" &&
        state.activityNavigation.selectedSessionId
      ) {
        params.set(
          "session",
          activityIdToRouteKey(state.activityNavigation.selectedSessionId) ??
            state.activityNavigation.selectedSessionId,
        );
      }

      if (
        state.activityNavigation.view === "sessions" &&
        state.activityNavigation.selectedSessionPromptId
      ) {
        params.set(
          "prompt",
          activityIdToRouteKey(state.activityNavigation.selectedSessionPromptId) ??
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

function formatSinceYesterdayDelta(value: number | null | undefined) {
  const normalizedValue = value ?? 0;
  return normalizedValue > 0
    ? `+${formatCompactNumber(normalizedValue)} since yesterday`
    : "0 since yesterday";
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
      createdTimestamp: string;
      events: number;
      filesChanged: number;
      githubUrl: string | null;
      latestTimestamp: string;
      models: Set<string>;
      name: string;
      summaryEventCount?: number;
      summaryPromptCount?: number;
      summarySessionCount?: number;
      summaryTrackedFiles?: number;
      prompts: number;
      sessions: Set<string>;
      slug?: string;
      tags: string[];
      visibility: "private" | "public";
    }
  >();

  for (const summary of summaries) {
    grouped.set(summary.id, {
      createdTimestamp: summary.created_at,
      events: 0,
      filesChanged: 0,
      githubUrl: normalizeGithubUrl(summary.github_url ?? summary.git_remote),
      latestTimestamp: summary.latest_event_at ?? summary.updated_at,
      models: new Set<string>(summary.connected_models ?? []),
      name: summary.name,
      summaryEventCount: summary.events,
      summaryPromptCount: summary.prompts,
      summarySessionCount: summary.sessions,
      summaryTrackedFiles: summary.tracked_files,
      prompts: 0,
      sessions: new Set<string>(),
      slug: summary.slug,
      tags: summary.tags ?? [],
      visibility: summary.visibility === "public" ? "public" : "private",
    });
  }

  for (const event of events) {
    const existing = grouped.get(event.project_id);
    const current =
      existing ??
      {
        createdTimestamp: event.timestamp,
        events: 0,
        filesChanged: 0,
        githubUrl: githubUrlFromEvent(event),
        latestTimestamp: event.timestamp,
        models: new Set<string>(),
        name: projectNameFromEvent(event),
        prompts: 0,
        sessions: new Set<string>(),
        tags: [],
        visibility: "private",
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
    if (event.event_type === "PromptSubmitted") {
      current.prompts += 1;
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
    createdTimestamp: value.createdTimestamp,
    slug: value.slug ?? id,
    latestTimestamp: value.latestTimestamp,
    latestUpdatedAt: formatTimestamp(value.latestTimestamp),
    latestActivityLabel:
      formatRelativeTimestamp(value.latestTimestamp) ?? formatTimestamp(value.latestTimestamp),
    sessions: value.summarySessionCount ?? value.sessions.size,
    events: value.summaryEventCount ?? value.events,
    filesChanged: value.filesChanged,
    prompts: value.summaryPromptCount ?? value.prompts,
    trackedFiles: value.summaryTrackedFiles ?? value.filesChanged,
    models: Array.from(value.models).sort(),
    githubUrl: value.githubUrl ?? undefined,
    tags: value.tags,
    visibility: value.visibility,
  })).sort(
    (left, right) =>
      new Date(right.latestTimestamp).getTime() -
      new Date(left.latestTimestamp).getTime(),
  );
}

function mockGithubUnlinkedProject(): Project {
  const timestamp = "2026-07-04T14:18:00Z";

  return {
    createdTimestamp: "2026-07-01T09:00:00Z",
    events: 42,
    filesChanged: 12,
    id: MOCK_GITHUB_UNLINKED_PROJECT_ID,
    latestActivityLabel: formatRelativeTimestamp(timestamp) ?? formatTimestamp(timestamp),
    latestTimestamp: timestamp,
    latestUpdatedAt: formatTimestamp(timestamp),
    models: ["gpt-5", "claude-sonnet-4"],
    name: "Unlinked Repository Preview",
    prompts: 18,
    sessions: 4,
    slug: "unlinked-repository-preview",
    tags: ["frontend", "preview"],
    trackedFiles: 12,
    visibility: "private",
  };
}

function isMockGithubUnlinkedProject(projectId: string | null | undefined) {
  return projectId === MOCK_GITHUB_UNLINKED_PROJECT_ID;
}

function mockGithubUnlinkedProjectDetail(project: Project): ProjectDetailData {
  return {
    activities: [
      {
        events: 18,
        filesChanged: 7,
        id: "mock-session-1",
        lastActivity: "Today 2:18 PM",
        model: "gpt-5",
        prompts: 8,
        responses: 8,
        startedAt: "Today 1:42 PM",
      },
      {
        events: 12,
        filesChanged: 3,
        id: "mock-session-2",
        lastActivity: "Yesterday 5:30 PM",
        model: "claude-sonnet-4",
        prompts: 5,
        responses: 5,
        startedAt: "Yesterday 5:04 PM",
      },
    ],
    community: {
      draftFlows: 0,
      latestFlowAt: null,
      publishedFlows: 0,
      recentFlows: [],
      totalFlows: 0,
    },
    files: [
      {
        children: [
          { name: "App.tsx", path: "frontend/src/App.tsx", type: "file" },
          { name: "project-detail.css", path: "frontend/src/components/project-detail/project-detail.css", type: "file" },
        ],
        name: "frontend",
        type: "folder",
      },
      {
        children: [
          { name: "projects.py", path: "backend/app/api/projects.py", type: "file" },
        ],
        name: "backend",
        type: "folder",
      },
    ],
    memory: {
      latestArtifactAt: null,
      recentArtifacts: [],
      totalArtifacts: 0,
    },
    overview: [
      {
        description: "GitHub remote has not been added yet.",
        title: "Repository URL",
        value: "Not connected",
      },
      {
        description: "Promty project detail page",
        href: projectDetailUrl(project.slug ?? project.id),
        title: "Project URL",
        value: projectDetailUrl(project.slug ?? project.id),
      },
      {
        title: "Description",
        value: "Frontend preview data for the GitHub unlinked project state.",
      },
      {
        title: "Visibility",
        value: formatLabelValue(project.visibility, "Private"),
      },
      {
        title: "AI Models",
        value: project.models.join(", "),
      },
      {
        title: "Activities",
        value: formatCompactNumber(project.events),
      },
      {
        title: "Sessions",
        value: formatCompactNumber(project.sessions),
      },
      {
        title: "Sessions Added",
        value: "+1 since yesterday",
      },
      {
        title: "Prompts",
        value: formatCompactNumber(project.prompts),
      },
      {
        title: "Prompts Added",
        value: "+4 since yesterday",
      },
      {
        title: "Files Changed Added",
        value: "+2 since yesterday",
      },
      {
        description: "No memory yet",
        title: "Memory Artifacts",
        value: "0",
      },
      {
        title: "Memory Added",
        value: "0 since yesterday",
      },
      {
        description: formatRelativeTimestamp(project.createdTimestamp) ?? "Not available",
        title: "Created",
        value: formatDate(project.createdTimestamp),
      },
      {
        description: project.latestActivityLabel,
        title: "Last Activity",
        value: formatDate(project.latestTimestamp),
      },
      {
        description: "No repository",
        title: "Repository Connected",
        value: "Not connected",
      },
    ],
    project: {
      description: "Frontend preview data for the GitHub unlinked project state.",
      id: project.id,
      name: project.name,
      repositoryStatus: "Repository not connected",
      repositoryUrl: undefined,
      slug: project.slug,
      tags: project.tags,
      visibility: project.visibility,
    },
    promptActivities: [],
    repositoryFiles: [],
    repositoryFilesMessage: "This project does not have a GitHub repository remote.",
  };
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
    memory: {
      latestArtifactAt: null,
      recentArtifacts: [],
      totalArtifacts: 0,
    },
    overview: [],
    promptActivities: [],
    project: {
      description: "",
      id: project?.id ?? "",
      name: project?.name ?? "Project",
      repositoryStatus: project?.githubUrl
        ? "Repository connected"
        : "Repository not connected",
      repositoryUrl: project?.githubUrl,
      slug: project?.slug,
      tags: project?.tags ?? [],
      visibility: project?.visibility ?? "private",
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
  const memory = payload.memory;
  const totalPrompts =
    payload.metrics.total_prompts ?? payload.prompt_activities?.length ?? 0;
  const projectDescription = payload.project.description?.trim() ?? "";
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
    memory: {
      latestArtifactAt: memory?.latest_artifact_at
        ? formatOptionalTimestamp(memory.latest_artifact_at, "Unknown")
        : null,
      recentArtifacts: (memory?.recent_artifacts ?? []).map((artifact) => ({
        changedFileCount: artifact.changed_file_count,
        changedFiles: artifact.changed_files ?? [],
        commitSha: artifact.commit_sha ?? null,
        createdAt: artifact.created_at
          ? formatOptionalTimestamp(artifact.created_at, "Unknown")
          : null,
        endSequence: artifact.end_sequence ?? null,
        generator: artifact.generator,
        id: artifact.id,
        memoryScope: artifact.memory_scope ?? null,
        model: artifact.model,
        outcome: artifact.outcome,
        promptCount: artifact.prompt_count ?? null,
        reason: artifact.reason ?? null,
        sections: artifact.sections ?? [],
        sessionId: artifact.session_id,
        sliceIndex: artifact.slice_index ?? null,
        startSequence: artifact.start_sequence ?? null,
        summary: artifact.summary,
        tags: artifact.tags,
        technologies: artifact.technologies ?? [],
        title: artifact.title,
        updatedAt: artifact.updated_at
          ? formatOptionalTimestamp(artifact.updated_at, "Unknown")
          : null,
        windowReason: artifact.window_reason ?? null,
        versions: (artifact.versions ?? []).map((version) => ({
          changedFileCount: version.changed_file_count,
          changedFiles: version.changed_files ?? [],
          commitSha: version.commit_sha ?? null,
          createdAt: version.created_at
            ? formatOptionalTimestamp(version.created_at, "Unknown")
            : null,
          endSequence: version.end_sequence ?? null,
          generator: version.generator,
          id: version.id,
          memoryScope: version.memory_scope ?? null,
          model: version.model,
          outcome: version.outcome,
          promptCount: version.prompt_count ?? null,
          reason: version.reason ?? null,
          sections: version.sections ?? [],
          sessionId: version.session_id,
          sliceIndex: version.slice_index ?? null,
          startSequence: version.start_sequence ?? null,
          summary: version.summary,
          tags: version.tags,
          technologies: version.technologies ?? [],
          title: version.title,
          version: version.version,
          windowReason: version.window_reason ?? null,
        })),
      })),
      totalArtifacts: memory?.total_artifacts ?? 0,
    },
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
        value: projectDescription || "Not provided",
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
        title: "Sessions Added",
        value: formatSinceYesterdayDelta(payload.metrics.sessions_since_yesterday),
      },
      {
        title: "Prompts",
        value: formatCompactNumber(totalPrompts),
      },
      {
        title: "Prompts Added",
        value: formatSinceYesterdayDelta(payload.metrics.prompts_since_yesterday),
      },
      {
        title: "Files Changed Added",
        value: formatSinceYesterdayDelta(payload.metrics.files_changed_since_yesterday),
      },
      {
        title: "Memory Artifacts",
        value: formatCompactNumber(memory?.total_artifacts ?? 0),
        description:
          formatRelativeTimestamp(memory?.latest_artifact_at) ?? "No memory yet",
      },
      {
        title: "Memory Added",
        value: formatSinceYesterdayDelta(
          payload.metrics.memory_artifacts_since_yesterday,
        ),
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
      slug: payload.project.slug ?? fallbackProject?.slug,
      tags: payload.project.tags ?? fallbackProject?.tags ?? [],
      visibility:
        payload.project.visibility === "public" || payload.project.visibility === "private"
          ? payload.project.visibility
          : fallbackProject?.visibility ?? "private",
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
          <h1 id="cli-login-title">Connect GitHub</h1>
          <p>
            Issue a local collector token for AI session history on this machine.
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
          <h1 id="web-login-title">Sign in to {BRAND_NAME}</h1>
          <p>Searchable memory for prompts, responses, and code changes.</p>
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

        <div className="cli-login-footer">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>GitHub sign-in keeps project access tied to your workspace.</span>
        </div>
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
      <LoadingSidebar />

      <main className="page">
        <header className="page-header">
          <div>
            <h1>Projects</h1>
          </div>
        </header>

        <section className="projects-section" aria-label="Projects">
          <ProjectListLoadingState />
        </section>
      </main>
    </div>
  );
}

function LoadingSidebar() {
  return (
    <aside className="sidebar sidebar-loading" aria-hidden="true">
      <div className="sidebar-header">
        <div className="sidebar-loading-brand">
          <span />
          <span />
        </div>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav" aria-label="Loading navigation">
        <div className="sidebar-loading-item">
          <span />
          <span />
        </div>
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-divider" />

      <div className="sidebar-footer">
        <div className="sidebar-loading-item is-profile">
          <span />
          <span />
        </div>
        <div className="sidebar-loading-item">
          <span />
          <span />
        </div>
      </div>
    </aside>
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

function EmptyProjectsState() {
  return (
    <section className="empty-projects-state" aria-labelledby="empty-projects-title">
      <div className="empty-projects-copy">
        <h2 id="empty-projects-title">No projects yet</h2>
        <p>Run this from a project directory to link the repository and install local AI tool hooks.</p>
      </div>
      <SetupCommandBlock command={setupCommandText()} />
    </section>
  );
}

function ProjectListLoadingState({ delayMs = 500 }: { delayMs?: number }) {
  const [shouldShow, setShouldShow] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setShouldShow(true);
      return;
    }

    setShouldShow(false);
    const timer = window.setTimeout(() => {
      setShouldShow(true);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="project-list-loading-state">
      <div className="project-loading-controls" aria-hidden="true">
        <div className="project-loading-search" />
        <div className="project-loading-sort" />
      </div>
      <ProjectGridSkeleton />
    </div>
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
      {Array.from({ length: 12 }, (_, index) => (
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

function setupCommandText() {
  return `npx @prompthub/cli init --app-url ${window.location.origin} --api-url ${API_URL}`;
}

function SetupCommandBlock({
  command,
  label,
}: {
  command: string;
  label?: string;
}) {
  const [hasCopied, setHasCopied] = useState(false);
  const copyCommand = async () => {
    await navigator.clipboard.writeText(command);
    setHasCopied(true);
    window.setTimeout(() => setHasCopied(false), 1400);
  };

  return (
    <div className="setup-command-block">
      {label ? <span>{label}</span> : null}
      <div className="setup-command-surface">
        <pre><code>{command}</code></pre>
        <button
          aria-label={hasCopied ? "Copied" : "Copy command"}
          className="setup-command-copy"
          onClick={copyCommand}
          title={hasCopied ? "Copied" : "Copy command"}
          type="button"
        >
          {hasCopied ? (
            <Check aria-hidden="true" size={16} strokeWidth={1.5} />
          ) : (
            <Copy aria-hidden="true" size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
}

function RepositoryConnector({
  onManualConnect,
  onClose,
  targetProjectName,
}: {
  onManualConnect?: (githubUrl: string) => Promise<void>;
  onClose: () => void;
  targetProjectName?: string;
}) {
  const setupCommand = setupCommandText();
  const [manualRepositoryUrl, setManualRepositoryUrl] = useState("");
  const [manualRepositoryError, setManualRepositoryError] = useState<string | null>(
    null,
  );
  const [isManualRepositorySaving, setIsManualRepositorySaving] = useState(false);
  const canSubmitManualRepository =
    Boolean(onManualConnect) && manualRepositoryUrl.trim().length > 0;

  const submitManualRepository = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onManualConnect || !manualRepositoryUrl.trim()) {
      return;
    }

    setIsManualRepositorySaving(true);
    setManualRepositoryError(null);
    try {
      await onManualConnect(manualRepositoryUrl.trim());
      onClose();
    } catch (error) {
      setManualRepositoryError(
        error instanceof Error ? error.message : "Repository could not be connected.",
      );
    } finally {
      setIsManualRepositorySaving(false);
    }
  };

  return (
    <div className="repository-connector-overlay" role="presentation">
      <section
        aria-labelledby="repository-connector-title"
        aria-modal="true"
        className="repository-connector"
        role="dialog"
      >
        <div className="repository-connector-header">
          <div>
            <h2 id="repository-connector-title">Connect Repository</h2>
            <p>
              {onManualConnect
                ? `Paste a GitHub URL or run setup inside ${targetProjectName ?? "this project"}.`
                : `Run this inside ${targetProjectName ?? "your project"} to link the project and install local AI tool hooks.`}
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

        <SetupCommandBlock command={setupCommand} label="Project terminal" />

        {onManualConnect ? (
          <form className="repository-url-form" onSubmit={submitManualRepository}>
            <label htmlFor="repository-url">GitHub repository URL</label>
            <div className="repository-url-row">
              <input
                autoComplete="off"
                id="repository-url"
                inputMode="url"
                onChange={(event) => setManualRepositoryUrl(event.target.value)}
                placeholder="https://github.com/owner/repo"
                spellCheck={false}
                type="url"
                value={manualRepositoryUrl}
              />
              <button
                className="repository-url-submit"
                disabled={!canSubmitManualRepository || isManualRepositorySaving}
                type="submit"
              >
                {isManualRepositorySaving ? "Connecting" : "Connect"}
              </button>
            </div>
            {manualRepositoryError ? (
              <p className="repository-connector-error">{manualRepositoryError}</p>
            ) : null}
          </form>
        ) : null}
      </section>
    </div>
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

function AdminDashboard({
  errorMessage,
  isLoading,
  onRefresh,
  overview,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  onRefresh: () => void;
  overview: AdminOverview | null;
}) {
  const metrics = overview?.metrics;
  const metricCards = [
    {
      icon: User,
      label: "Users",
      sublabel: `${formatCompactNumber(metrics?.github_connections ?? 0)} GitHub links`,
      value: formatCompactNumber(metrics?.users ?? 0),
    },
    {
      icon: Folder,
      label: "Projects",
      sublabel: `${formatCompactNumber(metrics?.tracked_files ?? 0)} tracked files`,
      value: formatCompactNumber(metrics?.projects ?? 0),
    },
    {
      icon: Activity,
      label: "Events",
      sublabel: `${formatCompactNumber(metrics?.events_24h ?? 0)} last 24h`,
      value: formatCompactNumber(metrics?.events ?? 0),
    },
    {
      icon: Bot,
      label: "AI Traffic",
      sublabel: `${formatCompactNumber(metrics?.responses ?? 0)} responses`,
      value: formatCompactNumber(metrics?.prompts ?? 0),
    },
    {
      icon: Database,
      label: "Memory",
      sublabel: `${formatCompactNumber(metrics?.sessions ?? 0)} sessions`,
      value: formatCompactNumber(metrics?.memory_artifacts ?? 0),
    },
    {
      icon: KeyRound,
      label: "Collectors",
      sublabel: "Active ingest tokens",
      value: formatCompactNumber(metrics?.active_collector_tokens ?? 0),
    },
  ];

  return (
    <section className="admin-console" aria-label="Admin console">
      <div className="admin-command-bar">
        <div>
          <span className="admin-kicker">Command surface</span>
          <h2>Operational control</h2>
        </div>
        <div className="admin-command-actions">
          <span className="status-pill">
            {overview?.generated_at
              ? `Updated ${formatOptionalTimestamp(overview.generated_at, "now")}`
              : "Standing by"}
          </span>
          <button
            className="toolbar-button"
            disabled={isLoading}
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>{isLoading ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="auth-message" data-error="true">
          {errorMessage}
        </div>
      ) : null}

      <div className="admin-metric-grid">
        {metricCards.map((metric) => {
          const MetricIcon = metric.icon;
          return (
            <div className="admin-metric" key={metric.label}>
              <MetricIcon aria-hidden="true" size={18} strokeWidth={1.5} />
              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.sublabel}</small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="admin-grid">
        <section className="admin-panel is-span-2" aria-label="Recent projects">
          <div className="admin-panel-header">
            <h3>Project Operations</h3>
            <span>{overview?.recent_projects.length ?? 0} visible</span>
          </div>
          <div className="admin-table">
            <div className="admin-table-row is-head">
              <span>Project</span>
              <span>Owner</span>
              <span>Events</span>
              <span>State</span>
            </div>
            {(overview?.recent_projects ?? []).map((project) => (
              <div className="admin-table-row" key={project.id}>
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.latest_event_at ? formatRelativeTimestamp(project.latest_event_at) : "No activity"}</small>
                </span>
                <span>{project.owner.username}</span>
                <span>{formatCompactNumber(project.counts.events)}</span>
                <span>
                  <span className="admin-state-dot" data-on={project.github_connected} />
                  {project.github_connected ? "Repo linked" : "No repo"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-label="Risk register">
          <div className="admin-panel-header">
            <h3>Risk Register</h3>
            <span>{overview?.risks.length ?? 0}</span>
          </div>
          <div className="admin-risk-list">
            {(overview?.risks ?? []).length > 0 ? (
              overview?.risks.map((risk) => (
                <div className="admin-risk" data-severity={risk.severity} key={risk.title}>
                  <AlertTriangle aria-hidden="true" size={16} strokeWidth={1.5} />
                  <div>
                    <strong>{risk.title}</strong>
                    <span>{risk.detail}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-empty-line">No active configuration risks.</div>
            )}
          </div>
        </section>

        <section className="admin-panel" aria-label="System controls">
          <div className="admin-panel-header">
            <h3>System Posture</h3>
            <span>{overview?.system.admin_configured ? "Locked" : "Unconfigured"}</span>
          </div>
          <dl className="admin-kv-list">
            <div>
              <dt>Memory</dt>
              <dd>{overview?.system.memory_generator ?? "unknown"}</dd>
            </div>
            <div>
              <dt>Gemini</dt>
              <dd>{overview?.system.gemini_configured ? "configured" : "off"}</dd>
            </div>
            <div>
              <dt>Cookie</dt>
              <dd>{overview?.system.session_cookie_secure ? "secure" : "dev"}</dd>
            </div>
            <div>
              <dt>Community</dt>
              <dd>{overview?.system.published_flows_enabled ? "on" : "paused"}</dd>
            </div>
          </dl>
        </section>

        <section className="admin-panel" aria-label="Event types">
          <div className="admin-panel-header">
            <h3>Event Types</h3>
            <span>Ranked</span>
          </div>
          <div className="admin-breakdown">
            {(overview?.breakdowns.events_by_type ?? []).map((item) => (
              <div key={item.key}>
                <span>{item.key}</span>
                <strong>{formatCompactNumber(item.count)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-label="Recent events">
          <div className="admin-panel-header">
            <h3>Live Feed</h3>
            <span>{overview?.recent_events.length ?? 0}</span>
          </div>
          <div className="admin-feed">
            {(overview?.recent_events ?? []).map((event) => (
              <div className="admin-feed-item" key={event.id}>
                <span>{event.event_type}</span>
                <strong>{event.tool}</strong>
                <small>
                  #{event.sequence} · {formatOptionalTimestamp(event.created_at, "Unknown")}
                </small>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-label="Recent users">
          <div className="admin-panel-header">
            <h3>Users</h3>
            <span>{overview?.recent_users.length ?? 0}</span>
          </div>
          <div className="admin-user-list">
            {(overview?.recent_users ?? []).map((user) => (
              <div className="admin-user-row" key={user.id}>
                <span className="sidebar-avatar" aria-hidden="true">
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{user.username}</strong>
                  <small>{user.email ?? "No email"} · {user.project_count} projects</small>
                </div>
                <span className="admin-state-dot" data-on={user.github_connected} />
              </div>
            ))}
          </div>
        </section>
      </div>
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
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [projectSortMode, setProjectSortMode] = useState<ProjectSortMode>("recent");
  const projects = useMemo(
    () => projectsFromEvents(events, projectSummaries),
    [events, projectSummaries],
  );
  const previewMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("preview");
  }, []);
  const previewEmptyProjects = previewMode === "empty-projects";
  const previewGithubUnlinkedProject = previewMode === "github-unlinked-project";
  const previewProjectLoading = previewMode === "project-loading";
  const projectCatalog = useMemo(() => {
    if (!previewGithubUnlinkedProject) {
      return projects;
    }

    const mockProject = mockGithubUnlinkedProject();
    return [
      mockProject,
      ...projects.filter((project) => project.id !== mockProject.id),
    ];
  }, [previewGithubUnlinkedProject, projects]);
  const displayProjects = previewEmptyProjects ? [] : projectCatalog;
  const visibleProjects = useMemo(() => {
    const query = projectSearchQuery.trim().toLowerCase();
    const filteredProjects = query
      ? displayProjects.filter((project) => project.name.toLowerCase().includes(query))
      : displayProjects;

    return [...filteredProjects].sort((left, right) => {
      const leftTimestamp =
        projectSortMode === "added" ? left.createdTimestamp : left.latestTimestamp;
      const rightTimestamp =
        projectSortMode === "added" ? right.createdTimestamp : right.latestTimestamp;
      return new Date(rightTimestamp).getTime() - new Date(leftTimestamp).getTime();
    });
  }, [displayProjects, projectSearchQuery, projectSortMode]);
  const projectHeaderOptions = useMemo<ProjectHeaderProjectOption[]>(
    () =>
      projectCatalog.map((project) => ({
        id: project.id,
        latestUpdatedAt: project.latestUpdatedAt,
        name: project.name,
      })),
    [projectCatalog],
  );
  const selectedProject =
    projectCatalog.find((project) => project.id === selectedProjectId) ?? null;
  const repositoryConnectorProject =
    projectCatalog.find((project) => project.id === repositoryConnectorProjectId) ??
    null;
  const activeTitle =
    activeItem === "projects"
      ? "Projects"
      : activeItem === "community"
        ? "Community"
        : activeItem === "admin"
          ? "Admin"
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
        : projectCatalog.find((project) => project.id === requestedProjectId) ?? null;
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

  const generateSessionMemory = async (sessionId: string) => {
    if (!selectedProjectId) {
      throw new Error("Select a project before generating memory.");
    }

    const response = await fetch(
      `${API_URL}/api/projects/${selectedProjectId}/sessions/${sessionId}/complete?force=true&regenerate=true`,
      {
        credentials: "include",
        method: "POST",
      },
    );
    if (response.status === 401) {
      setAuthStatus("unauthenticated");
      setCurrentUser(null);
      throw new Error("Sign in again before generating memory.");
    }
    if (!response.ok) {
      const detail = await response
        .json()
        .then((payload) =>
          typeof payload?.detail === "string" ? payload.detail : null,
        )
        .catch(() => null);
      throw new Error(detail ?? `Memory request failed with HTTP ${response.status}`);
    }

    await loadProjectDetail(selectedProjectId, selectedProject);
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

  const saveRepositoryConnection = async (
    projectId: string,
    githubUrl: string,
  ) => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/repository`, {
      body: JSON.stringify({ github_url: githubUrl }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    if (response.status === 401) {
      setAuthStatus("unauthenticated");
      setCurrentUser(null);
      throw new Error("Sign in again before connecting a repository.");
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

    const updatedProject = (await response.json()) as ProjectSummary;
    setProjectSummaries((currentProjects) => {
      const nextProjects = currentProjects.map((project) =>
        project.id === updatedProject.id ? updatedProject : project,
      );
      return nextProjects.some((project) => project.id === updatedProject.id)
        ? nextProjects
        : [updatedProject, ...currentProjects];
    });

    setProjectGithubFiles(null);
    setProjectGithubFilesError(null);
    setRepositoryFileContent(null);
    setRepositoryFileContentError(null);
    setRepositoryFileContentPath(null);

    if (selectedProjectId === projectId) {
      await loadProjectDetail(projectId, selectedProject);
      await loadProjectGithubFiles(projectId);
    }
  };

  const saveProjectDescription = async (description: string) => {
    if (!selectedProjectId) {
      throw new Error("Select a project before editing the description.");
    }

    const response = await fetch(
      `${API_URL}/api/projects/${selectedProjectId}/description`,
      {
        body: JSON.stringify({ description }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    );

    if (response.status === 401) {
      setAuthStatus("unauthenticated");
      setCurrentUser(null);
      throw new Error("Sign in again before editing the project description.");
    }

    if (!response.ok) {
      const detail = await response
        .json()
        .then((payload) =>
          typeof payload?.detail === "string" ? payload.detail : null,
        )
        .catch(() => null);
      throw new Error(detail ?? `Description update failed with HTTP ${response.status}`);
    }

    await loadProjectDetail(selectedProjectId, selectedProject);
  };

  const saveProjectMetadata = async ({
    slug,
    tags,
    visibility,
  }: {
    slug?: string;
    tags?: string[];
    visibility?: "private" | "public";
  }) => {
    if (!selectedProjectId) {
      throw new Error("Select a project before editing project metadata.");
    }

    const response = await fetch(
      `${API_URL}/api/projects/${selectedProjectId}/metadata`,
      {
        body: JSON.stringify({
          ...(slug !== undefined ? { slug } : {}),
          ...(tags !== undefined ? { tags } : {}),
          ...(visibility !== undefined ? { visibility } : {}),
        }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    );

    if (response.status === 401) {
      setAuthStatus("unauthenticated");
      setCurrentUser(null);
      throw new Error("Sign in again before editing project metadata.");
    }

    if (!response.ok) {
      const detail = await response
        .json()
        .then((payload) =>
          typeof payload?.detail === "string" ? payload.detail : null,
        )
        .catch(() => null);
      throw new Error(detail ?? `Project metadata update failed with HTTP ${response.status}`);
    }

    const updatedProject = (await response.json()) as ProjectSummary;
    setProjectSummaries((currentProjects) =>
      currentProjects.map((project) =>
        project.id === updatedProject.id ? updatedProject : project,
      ),
    );

    if (updatedProject.slug) {
      setSelectedProjectRouteKey(updatedProject.slug);
      writeUrlNavigationState(
        normalizeUrlNavigationState({
          ...currentNavigationState,
          selectedProjectRouteKey: updatedProject.slug,
        }),
        "replace",
      );
    }
    await loadProjectDetail(
      selectedProjectId,
      selectedProject
        ? {
            ...selectedProject,
            slug: updatedProject.slug,
            tags: updatedProject.tags ?? [],
            visibility: updatedProject.visibility,
          }
        : null,
    );
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

  const loadAdminOverview = async (signal?: AbortSignal) => {
    setIsAdminLoading(true);
    setAdminError(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/overview`, {
        credentials: "include",
        signal,
      });
      if (response.status === 401) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setAdminOverview(null);
        return;
      }
      if (response.status === 403) {
        setAdminOverview(null);
        setAdminError("Admin access is not enabled for this GitHub account.");
        return;
      }
      if (!response.ok) {
        throw new Error(`Admin overview request failed with HTTP ${response.status}`);
      }
      setAdminOverview((await response.json()) as AdminOverview);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setAdminError(
        error instanceof Error ? error.message : "Admin overview request failed",
      );
    } finally {
      if (!signal?.aborted) {
        setIsAdminLoading(false);
      }
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
    setIsRepositoryConnectorOpen(true);
  };

  const closeRepositoryConnector = () => {
    setIsRepositoryConnectorOpen(false);
    setRepositoryConnectorProjectId(null);
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
    setAdminOverview(null);
    setAdminError(null);
    setIsRepositoryConnectorOpen(false);
    setRepositoryConnectorProjectId(null);
    setAuthStatus("unauthenticated");
    writeUrlNavigationState(DEFAULT_URL_NAVIGATION_STATE, "replace");
  };

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (
      !COMMUNITY_FEATURE_ENABLED ||
      authStatus !== "authenticated" ||
      activeItem !== "community"
    ) {
      return;
    }
    void loadPublishedFlows();
  }, [activeItem, authStatus]);

  useEffect(() => {
    if (
      !COMMUNITY_FEATURE_ENABLED ||
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
    if (authStatus !== "authenticated" || activeItem !== "admin") {
      return;
    }
    if (!currentUser?.is_admin) {
      navigateWorkspace(
        {
          activeItem: "projects",
          repositoryFileContentPath: null,
          selectedProjectId: null,
          selectedProjectRouteKey: null,
        },
        "replace",
      );
      return;
    }

    const controller = new AbortController();
    void loadAdminOverview(controller.signal);
    return () => controller.abort();
  }, [activeItem, authStatus, currentUser?.is_admin]);

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
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!hasLoadedWorkspaceData || activeItem !== "projects") {
      return;
    }

    if (!selectedProjectId && selectedProjectRouteKey) {
      const resolvedProject = projectCatalog.find((project) =>
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
      projectCatalog.find((project) => project.id === selectedProjectId) ??
      (selectedProjectRouteKey
        ? projectCatalog.find((project) =>
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
  }, [
    activeItem,
    hasLoadedWorkspaceData,
    projectCatalog,
    selectedProjectId,
    selectedProjectRouteKey,
  ]);

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

    if (isMockGithubUnlinkedProject(selectedProjectId) && selectedProject) {
      setProjectDetail(mockGithubUnlinkedProjectDetail(selectedProject));
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
  }, [activeItem, selectedProject, selectedProjectId, selectedProjectRouteKey]);

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
    if (item === "admin" && !currentUser?.is_admin) {
      return;
    }

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
      onManualConnect={
        repositoryConnectorProjectId &&
        !isMockGithubUnlinkedProject(repositoryConnectorProjectId)
          ? (githubUrl) =>
              saveRepositoryConnection(repositoryConnectorProjectId, githubUrl)
          : undefined
      }
      onClose={closeRepositoryConnector}
      targetProjectName={repositoryConnectorProject?.name}
    />
  ) : null;
  const sidebarUserName = currentUser?.username ?? "Profile";
  const sidebarUserInitial =
    sidebarUserName.trim().charAt(0).toUpperCase() || "P";
  const canUseAdmin = currentUser?.is_admin === true;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <BrandLockup />
          </div>
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
          {/* Community navigation is paused for now.
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
          */}
          {canUseAdmin ? (
            <button
              aria-pressed={activeItem === "admin"}
              className="sidebar-item"
              data-active={activeItem === "admin"}
              onClick={() => selectSidebarItem("admin")}
              type="button"
            >
              <Gauge
                aria-hidden="true"
                className="sidebar-icon"
                size={18}
                strokeWidth={1.5}
              />
              Admin
            </button>
          ) : null}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-divider" />

        <div className="sidebar-footer">
          <button
            aria-pressed={activeItem === "profile"}
            className="sidebar-item profile-item sidebar-profile-card"
            data-active={activeItem === "profile"}
            onClick={() => selectSidebarItem("profile")}
            type="button"
          >
            <span className="sidebar-avatar" aria-hidden="true">
              {currentUser?.avatar_url ? (
                <img alt="" src={currentUser.avatar_url} />
              ) : (
                sidebarUserInitial
              )}
            </span>
            <span className="sidebar-profile-copy">
              <span>{sidebarUserName}</span>
              <span>Profile</span>
            </span>
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

          <button
            className="sidebar-item sidebar-item-danger"
            onClick={logout}
            type="button"
          >
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
            {/* Community publishing props are paused for now. */}
            <ProjectDetailPage
              activityNavigation={activityNavigation}
              activeTab={activeDetailTab}
              data={selectedProjectDetailData ?? emptyProjectDetailData(selectedProject)}
              errorMessage={projectDetailError}
              isLoading={isProjectDetailLoading && projectDetail === null}
              isRefreshing={isProjectDetailLoading && projectDetail !== null}
              onActivityNavigationChange={selectActivityNavigation}
              onConnectRepository={() => openRepositoryConnector(selectedProject.id)}
              onGenerateSessionMemory={generateSessionMemory}
              onOpenAllProjects={closeProjectDetail}
              onProjectSelect={switchProjectDetail}
              onRepositoryFileSelect={selectRepositoryFile}
              onSaveProjectMetadata={saveProjectMetadata}
              onSaveDescription={saveProjectDescription}
              onTabChange={selectProjectDetailTab}
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
              </div>
            </header>

            {repositoryConnector}

            <section
              className="projects-section"
              aria-label="Projects"
            >
              {previewProjectLoading ? (
                <ProjectListLoadingState delayMs={0} />
              ) : isEventsLoading && displayProjects.length === 0 && !previewEmptyProjects ? (
                <ProjectListLoadingState />
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
              ) : displayProjects.length === 0 ? (
                <EmptyProjectsState />
              ) : (
                <>
                  <div className="project-controls">
                    <label className="project-search-control">
                      <span className="bh-visually-hidden">Search projects</span>
                      <Search aria-hidden="true" size={16} strokeWidth={1.5} />
                      <input
                        onChange={(event) => setProjectSearchQuery(event.target.value)}
                        placeholder="Search projects"
                        type="search"
                        value={projectSearchQuery}
                      />
                    </label>

                    <div className="project-sort-control" aria-label="Sort projects">
                      <button
                        aria-pressed={projectSortMode === "recent"}
                        data-active={projectSortMode === "recent"}
                        onClick={() => setProjectSortMode("recent")}
                        type="button"
                      >
                        Recent work
                      </button>
                      <button
                        aria-pressed={projectSortMode === "added"}
                        data-active={projectSortMode === "added"}
                        onClick={() => setProjectSortMode("added")}
                        type="button"
                      >
                        Added
                      </button>
                    </div>
                  </div>

                  {visibleProjects.length === 0 ? (
                    <EmptyState
                      description="Try a different project name."
                      eyebrow="No matches"
                      icon={Search}
                      title="No projects found"
                    />
                  ) : (
                    <div
                      aria-busy={isEventsLoading || undefined}
                      className="projects-grid loading-cascade"
                      data-loading={isEventsLoading ? "true" : undefined}
                    >
                      {visibleProjects.map((project) => (
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
                        <span className="github-button is-unlinked">
                          <GitHubIcon />
                          <span>Not linked</span>
                        </span>
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
                          Last activity
                        </dt>
                        <dd>
                          <strong>{project.latestActivityLabel}</strong>
                          <span>{project.latestUpdatedAt}</span>
                        </dd>
                      </div>
                    </dl>

                    <dl className="project-stats" aria-label="Project activity">
                      <div>
                        <dt>Sessions</dt>
                        <dd>{project.sessions}</dd>
                      </div>
                      <div>
                        <dt>Prompts</dt>
                        <dd>{formatCompactNumber(project.prompts)}</dd>
                      </div>
                      <div>
                        <dt>Tracked files</dt>
                        <dd>{formatCompactNumber(project.trackedFiles)}</dd>
                      </div>
                    </dl>

                    <div className="model-group" aria-label="AI models used">
                      <span className="model-group-label">
                        <Bot aria-hidden="true" size={15} strokeWidth={1.5} />
                        AI model
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
                </>
              )}
            </section>
          </>
        ) : COMMUNITY_FEATURE_ENABLED && activeItem === "community" ? (
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
        ) : activeItem === "admin" && canUseAdmin ? (
          <>
            <header className="page-header">
              <div>
                <h1>{activeTitle}</h1>
              </div>
              <div className="page-actions">
                <span className="status-pill">Admin only</span>
              </div>
            </header>

            <AdminDashboard
              errorMessage={adminError}
              isLoading={isAdminLoading}
              onRefresh={() => {
                void loadAdminOverview();
              }}
              overview={adminOverview}
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
