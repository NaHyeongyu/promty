import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Clock,
  ExternalLink,
  Folder,
  GitBranch,
  Link,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Terminal,
  User,
  X,
} from "lucide-react";
import {
  siClaudecode,
  siCursor,
  siGithub,
  siGooglegemini,
  type SimpleIcon,
} from "simple-icons";
import { SiOpenai } from "react-icons/si";
import {
  ProjectDetailPage,
  type ActivityNavigationState,
  type ActivityViewId,
  type FileTreeNode,
  type ProjectDetailData,
  type ProjectDetailTabId,
  type PromptActivityItem,
  type RepositoryFileContent,
} from "./components/project-detail";
import {
  PromptHubDetailPage,
  PromptHubListPage,
  PromptPublishDrawer,
} from "./components/prompt-hub";
import "./App.css";

type SidebarItemId = "projects" | "prompt-hub" | "settings" | "profile";

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
  knowledge: Array<{
    file_type: string;
    id: string;
    source_path: string | null;
    title: string;
    updated_at: string | null;
  }>;
  metrics: {
    connected_models: string[];
    latest_activity_at: string | null;
    last_modified_at: string | null;
    repository_connected: boolean;
    total_events: number;
    total_sessions: number;
    tracked_files: number;
  };
  project: {
    default_branch: string;
    description: string | null;
    id: string;
    name: string;
    repository_status: string;
    repository_url: string | null;
    slug?: string;
    updated_at: string | null;
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
  selectedPromptHubSlug: string | null;
};

const API_URL = (
  import.meta.env.VITE_PROMPTHUB_API_URL ?? "http://127.0.0.1:8011"
).replace(/\/$/, "");
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
  selectedPromptHubSlug: null,
};
const ACTIVITY_VIEW_IDS = new Set<ActivityViewId>(["prompts", "sessions"]);
const PROJECT_DETAIL_TAB_IDS = new Set<ProjectDetailTabId>([
  "overview",
  "ai-activity",
  "knowledge",
  "files",
]);
const SIDEBAR_ITEM_IDS = new Set<SidebarItemId>([
  "projects",
  "prompt-hub",
  "settings",
  "profile",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ROUTE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,254}$/i;
const UUID_ROUTE_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const MAX_URL_FILE_PATH_LENGTH = 1024;
const PROMPT_HUB_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,254}$/i;

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

function sanitizePromptHubSlug(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const slug = value.trim().toLowerCase();
  return PROMPT_HUB_SLUG_PATTERN.test(slug) ? slug : null;
}

function promptHubRouteFromPath(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/prompt-hub") {
    return {
      isPromptHubRoute: true,
      slug: null,
    };
  }

  const match = normalizedPath.match(/^\/prompt-hub\/([^/]+)$/);
  if (!match) {
    return {
      isPromptHubRoute: false,
      slug: null,
    };
  }

  return {
    isPromptHubRoute: true,
    slug: sanitizePromptHubSlug(decodeURIComponent(match[1])),
  };
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
  const selectedPromptHubSlug =
    activeItem === "prompt-hub"
      ? sanitizePromptHubSlug(state.selectedPromptHubSlug)
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
    selectedPromptHubSlug,
  };
}

function readUrlNavigationState(): UrlNavigationState {
  const promptHubRoute = promptHubRouteFromPath(window.location.pathname);
  if (promptHubRoute.isPromptHubRoute) {
    return normalizeUrlNavigationState({
      activeItem: "prompt-hub",
      selectedPromptHubSlug: promptHubRoute.slug,
    });
  }

  const params = new URLSearchParams(window.location.search);
  const projectRouteKey = params.get("project");
  return normalizeUrlNavigationState({
    activityNavigation: {
      selectedPromptId: params.get("prompt"),
      selectedSessionId: params.get("session"),
      selectedSessionPromptId: params.get("turn"),
      view: parseActivityViewId(params.get("activity")),
    },
    activeDetailTab: parseProjectDetailTabId(params.get("tab")),
    activeItem: parseSidebarItemId(params.get("view")),
    repositoryFileContentPath: params.get("file"),
    selectedProjectId: projectRouteKey,
    selectedProjectRouteKey: projectRouteKey,
    selectedPromptHubSlug: params.get("prompt"),
  });
}

function buildUrlNavigationSearch(state: UrlNavigationState) {
  const params = new URLSearchParams();

  if (state.activeItem === "prompt-hub") {
    params.set("view", state.activeItem);
    if (state.selectedPromptHubSlug) {
      params.set("prompt", state.selectedPromptHubSlug);
    }
  } else if (state.activeItem !== "projects") {
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
          "turn",
          uuidToRouteKey(state.activityNavigation.selectedSessionPromptId) ??
            state.activityNavigation.selectedSessionPromptId,
        );
      }
    }
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}

function buildUrlNavigationPath(state: UrlNavigationState) {
  if (state.activeItem !== "prompt-hub") {
    return "/";
  }

  if (!state.selectedPromptHubSlug) {
    return "/prompt-hub";
  }

  return `/prompt-hub/${encodeURIComponent(state.selectedPromptHubSlug)}`;
}

function buildUrlNavigationLocation(state: UrlNavigationState) {
  const path = buildUrlNavigationPath(state);
  const search = state.activeItem === "prompt-hub" ? "" : buildUrlNavigationSearch(state);
  return `${path}${search}`;
}

function writeUrlNavigationState(
  state: UrlNavigationState,
  mode: UrlNavigationWriteMode,
) {
  const normalizedState = normalizeUrlNavigationState(state);
  const nextUrl = buildUrlNavigationLocation(normalizedState);
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
  return `${window.location.origin}${buildUrlNavigationLocation(readUrlNavigationState())}`;
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

function formatOptionalTimestamp(value: string | null | undefined, fallback = "No activity") {
  return value ? formatTimestamp(value) : fallback;
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

function modelNameFromEvent(event: EventRecord) {
  const model = getStringPayloadValue(event.payload, "model");
  if (model) {
    return model;
  }

  if (event.tool === "codex-cli") {
    return "Codex";
  }
  if (event.tool === "claude-code") {
    return "Claude Code";
  }
  if (event.tool === "gemini-cli") {
    return "Gemini CLI";
  }
  return event.tool;
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
    current.models.add(modelNameFromEvent(event));
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
    files: [],
    knowledge: [],
    overview: [],
    promptActivities: [],
    project: {
      description:
        "AI development workspace for prompts, code changes, context, and project memory.",
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

function projectDetailDataFromApi(
  payload: ProjectDetailApiResponse,
  fallbackProject: Project | null,
): ProjectDetailData {
  const models = payload.metrics.connected_models;

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
    files: payload.files,
    knowledge: payload.knowledge.map((item) => ({
      fileType: item.file_type,
      title: item.title,
      updatedAt: formatOptionalTimestamp(item.updated_at, "Unknown"),
    })),
    overview: [
      {
        title: "Repository",
        value: payload.metrics.repository_connected ? "Connected" : "Not connected",
        description: `Default branch ${payload.project.default_branch}`,
      },
      {
        title: "Connected AI Models",
        value: models.length > 0 ? `${models.length} models` : "No models",
        description: models.length > 0 ? models.join(", ") : "No model metadata yet",
      },
      {
        title: "Last Activity",
        value: formatOptionalTimestamp(payload.metrics.latest_activity_at),
        description: "Latest AI interaction",
      },
      {
        title: "Total AI Sessions",
        value: formatCompactNumber(payload.metrics.total_sessions),
        description: "Across this workspace",
      },
      {
        title: "Total Events",
        value: formatCompactNumber(payload.metrics.total_events),
        description: "Prompts, responses, file changes",
      },
      {
        title: "Last Modified",
        value: formatOptionalTimestamp(payload.metrics.last_modified_at, "Unknown"),
        description: `${formatCompactNumber(payload.metrics.tracked_files)} tracked files`,
      },
      {
        title: "Quick Actions",
        value: "Workspace shortcuts",
        actions: ["Review activity", "Open knowledge", "Inspect files"],
      },
    ],
    project: {
      description:
        payload.project.description ??
        "AI development workspace for prompts, code changes, context, and project memory.",
      name: payload.project.name || fallbackProject?.name || "Project",
      repositoryStatus: payload.project.repository_status,
      repositoryUrl: payload.project.repository_url ?? fallbackProject?.githubUrl,
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
          <Terminal aria-hidden="true" size={16} strokeWidth={1.5} />
          PromptHub CLI
        </div>

        <div className="cli-login-copy">
          <h1 id="cli-login-title">Connect your GitHub account</h1>
          <p>
            PromptHub uses GitHub sign-in to issue a local collector token for
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
          <span>Only a PromptHub collector token is returned to your terminal.</span>
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
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          PromptHub
        </div>

        <div className="cli-login-copy">
          <h1 id="web-login-title">Sign in with GitHub</h1>
          <p>Open your PromptHub workspace and recent AI development activity.</p>
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
      aria-label="Loading PromptHub workspace"
      aria-live="polite"
      className="app-shell"
      role="status"
    >
      <aside className="sidebar" aria-hidden="true">
        <div className="sidebar-header">
          <strong>BuildHub</strong>
        </div>

        <div className="sidebar-divider" />

        <nav className="sidebar-nav" aria-label="Loading navigation">
          <div className="sidebar-item sidebar-item-skeleton">
            <span className="skeleton-icon" />
            <span className="skeleton-line skeleton-line-nav" />
          </div>
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-divider" />

        <div className="sidebar-footer">
          <div className="sidebar-item sidebar-item-skeleton">
            <span className="skeleton-icon" />
            <span className="skeleton-line skeleton-line-nav" />
          </div>
          <div className="sidebar-item sidebar-item-skeleton">
            <span className="skeleton-icon" />
            <span className="skeleton-line skeleton-line-nav" />
          </div>
        </div>
      </aside>

      <main className="page">
        <header className="page-header">
          <div className="page-title-loading">
            <span className="skeleton-line skeleton-line-heading" />
          </div>
          <div className="page-actions">
            <span className="skeleton-pill skeleton-pill-action" />
            <span className="skeleton-pill skeleton-pill-count" />
          </div>
        </header>

        <section className="projects-section" aria-labelledby="loading-projects-title">
          <div className="section-header">
            <div className="section-copy-loading">
              <h2 id="loading-projects-title">
                <span className="skeleton-line skeleton-line-section" />
              </h2>
              <p>
                <span className="skeleton-line skeleton-line-description" />
              </p>
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

function ModelIcon({ model }: { model: string }) {
  const modelKey = model.toLowerCase();

  if (modelKey.includes("claude")) {
    return <SimpleBrandIcon icon={siClaudecode} name="claude-code" />;
  }

  if (modelKey.includes("cursor")) {
    return <SimpleBrandIcon icon={siCursor} name="cursor" />;
  }

  if (modelKey.includes("gemini")) {
    return <SimpleBrandIcon icon={siGooglegemini} name="gemini" />;
  }

  return (
    <SiOpenai
      aria-hidden="true"
      className="brand-icon"
      data-brand="codex"
    />
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
              ? "Create a BuildHub project from a GitHub repository."
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

        {isLoadingRepositories ? (
          <div className="inline-loading-status">
            <RefreshCw
              aria-hidden="true"
              className="loading-spinner"
              size={16}
              strokeWidth={1.5}
            />
            <span>Loading GitHub repositories</span>
          </div>
        ) : repositories.length > 0 ? (
          <div className="repository-option-list">
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
  const [repositoryFileContent, setRepositoryFileContent] =
    useState<RepositoryFileContent | null>(null);
  const [repositoryFileContentError, setRepositoryFileContentError] =
    useState<string | null>(null);
  const [repositoryFileContentPath, setRepositoryFileContentPath] =
    useState<string | null>(initialNavigationState.repositoryFileContentPath);
  const [selectedPromptHubSlug, setSelectedPromptHubSlug] = useState<string | null>(
    initialNavigationState.selectedPromptHubSlug,
  );
  const [publishPromptActivity, setPublishPromptActivity] =
    useState<PromptActivityItem | null>(null);
  const [publishPromptProjectId, setPublishPromptProjectId] =
    useState<string | null>(null);
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
      : activeItem === "prompt-hub"
        ? "Prompt Hub"
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
    selectedPromptHubSlug,
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
    setSelectedPromptHubSlug(nextState.selectedPromptHubSlug);

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
    setSelectedPromptHubSlug(null);
    setPublishPromptActivity(null);
    setPublishPromptProjectId(null);
    setAuthStatus("unauthenticated");
    writeUrlNavigationState(DEFAULT_URL_NAVIGATION_STATE, "replace");
  };

  useEffect(() => {
    void loadSession();
  }, []);

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
      setSelectedPromptHubSlug(nextState.selectedPromptHubSlug);
      setIsRepositoryConnectorOpen(false);
      setRepositoryConnectorProjectId(null);
      setRepositoryConnectorError(null);
      setRepositoryUrlInput("");
      setRepositorySearchQuery("");
      setPublishPromptActivity(null);
      setPublishPromptProjectId(null);
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
    setPublishPromptActivity(null);
    setPublishPromptProjectId(null);
    navigateWorkspace({
      activeDetailTab: "overview",
      activeItem: "projects",
      repositoryFileContentPath: null,
      selectedProjectId: projectId,
    });
  };
  const closeProjectDetail = () => {
    closeRepositoryConnector();
    setPublishPromptActivity(null);
    setPublishPromptProjectId(null);
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
    setPublishPromptActivity(null);
    setPublishPromptProjectId(null);
    navigateWorkspace({
      activeDetailTab: "overview",
      activeItem: item,
      repositoryFileContentPath: null,
      selectedProjectId: null,
      selectedPromptHubSlug: null,
    });
  };
  const openPromptHubPrompt = (slug: string) => {
    closeRepositoryConnector();
    setPublishPromptActivity(null);
    setPublishPromptProjectId(null);
    navigateWorkspace({
      activeDetailTab: "overview",
      activeItem: "prompt-hub",
      repositoryFileContentPath: null,
      selectedProjectId: null,
      selectedPromptHubSlug: slug,
    });
  };
  const closePromptHubPrompt = () => {
    navigateWorkspace({
      activeDetailTab: "overview",
      activeItem: "prompt-hub",
      repositoryFileContentPath: null,
      selectedProjectId: null,
      selectedPromptHubSlug: null,
    });
  };
  const closePromptPublishDrawer = () => {
    setPublishPromptActivity(null);
    setPublishPromptProjectId(null);
  };
  const openPromptPublishDrawer = (activity: PromptActivityItem) => {
    if (!selectedProjectId) {
      return;
    }

    closeRepositoryConnector();
    setPublishPromptActivity(activity);
    setPublishPromptProjectId(selectedProjectId);
  };
  const selectProjectDetailTab = (tab: ProjectDetailTabId) => {
    navigateWorkspace({
      activeDetailTab: tab,
      activeItem: "projects",
      repositoryFileContentPath:
        tab === "files" ? repositoryFileContentPath : null,
      selectedPromptHubSlug: null,
    });
  };
  const selectRepositoryFile = (path: string) => {
    navigateWorkspace({
      activeDetailTab: "files",
      activeItem: "projects",
      repositoryFileContentPath: path,
      selectedPromptHubSlug: null,
    });
  };
  const selectActivityNavigation = (nextActivityNavigation: ActivityNavigationState) => {
    navigateWorkspace({
      activeDetailTab: "ai-activity",
      activeItem: "projects",
      activityNavigation: nextActivityNavigation,
      repositoryFileContentPath: null,
      selectedPromptHubSlug: null,
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
          <strong>BuildHub</strong>
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
            aria-pressed={activeItem === "prompt-hub"}
            className="sidebar-item"
            data-active={activeItem === "prompt-hub"}
            onClick={() => selectSidebarItem("prompt-hub")}
            type="button"
          >
            <BookOpen
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            Prompt Hub
          </button>
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-divider" />

        <div className="sidebar-footer">
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
              onActivityNavigationChange={selectActivityNavigation}
              onConnectRepository={() => openRepositoryConnector(selectedProject.id)}
              onPublishPromptActivity={openPromptPublishDrawer}
              onRepositoryFileSelect={selectRepositoryFile}
              onTabChange={selectProjectDetailTab}
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
                  description="PromptHub is ready for the first collector upload from this workspace."
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
                <div className="projects-grid">
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
                        Models
                      </span>
                      <div className="model-list">
                        {project.models.map((model) => (
                          <span className="model-badge" key={model}>
                            <ModelIcon model={model} />
                            {model}
                          </span>
                        ))}
                      </div>
                    </div>

                  </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : activeItem === "prompt-hub" ? (
          selectedPromptHubSlug ? (
            <PromptHubDetailPage
              onBack={closePromptHubPrompt}
              slug={selectedPromptHubSlug}
            />
          ) : (
            <PromptHubListPage onOpenPrompt={openPromptHubPrompt} />
          )
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

      {publishPromptActivity && publishPromptProjectId ? (
        <PromptPublishDrawer
          activity={publishPromptActivity}
          onClose={closePromptPublishDrawer}
          onPublished={(prompt) => {
            closePromptPublishDrawer();
            openPromptHubPrompt(prompt.slug);
          }}
          projectId={publishPromptProjectId}
        />
      ) : null}
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
