import type {
  ActivityNavigationState,
  ActivityViewId,
  ProjectDetailTabId,
} from "../components/project-detail";
import type { CommunityContentType, SidebarItemId } from "./types";

export type UrlNavigationWriteMode = "push" | "replace";

export type UrlNavigationState = {
  activityNavigation: ActivityNavigationState;
  activeDetailTab: ProjectDetailTabId;
  activeItem: SidebarItemId;
  communityContent: CommunityContentType;
  repositoryFileContentPath: string | null;
  selectedProjectId: string | null;
  selectedProjectRouteKey: string | null;
  selectedPublicProfileId: string | null;
  selectedPublicProjectId: string | null;
  selectedCommunityFlowKey: string | null;
};

export const DEFAULT_URL_NAVIGATION_STATE: UrlNavigationState = {
  activityNavigation: {
    selectedPromptId: null,
    selectedSessionId: null,
    selectedSessionPromptId: null,
    view: "prompts",
  },
  activeDetailTab: "overview",
  activeItem: "projects",
  communityContent: "projects",
  repositoryFileContentPath: null,
  selectedProjectId: null,
  selectedProjectRouteKey: null,
  selectedPublicProfileId: null,
  selectedPublicProjectId: null,
  selectedCommunityFlowKey: null,
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
  "community",
  "pinned",
  "projects",
  "support",
  "settings",
  "profile",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ROUTE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,254}$/i;
const UUID_ROUTE_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const ACTIVITY_ROUTE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const MAX_URL_FILE_PATH_LENGTH = 1024;

export function sanitizeProjectId(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  return UUID_PATTERN.test(value) ? value : null;
}

export function sanitizeProjectRouteKey(value: string | null | undefined) {
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
  if (value === "home" || value === "reviews") {
    return "projects";
  }
  if (value === "explore") {
    return "community";
  }
  return value && SIDEBAR_ITEM_IDS.has(value as SidebarItemId)
    ? (value as SidebarItemId)
    : "projects";
}

function parseCommunityContentType(): CommunityContentType {
  return "projects";
}

function parseProjectDetailTabId(value: string | null): ProjectDetailTabId {
  return value && PROJECT_DETAIL_TAB_IDS.has(value as ProjectDetailTabId)
    ? (value as ProjectDetailTabId)
    : "overview";
}

function parseActivityViewId(value: string | null): ActivityViewId {
  return value && ACTIVITY_VIEW_IDS.has(value as ActivityViewId)
    ? (value as ActivityViewId)
    : "sessions";
}

export function normalizeUrlNavigationState(
  state: Partial<UrlNavigationState>,
): UrlNavigationState {
  const requestedActiveItem =
    state.activeItem ?? DEFAULT_URL_NAVIGATION_STATE.activeItem;
  const activeItem = SIDEBAR_ITEM_IDS.has(requestedActiveItem)
    ? requestedActiveItem
    : DEFAULT_URL_NAVIGATION_STATE.activeItem;
  const communityContent = DEFAULT_URL_NAVIGATION_STATE.communityContent;
  const selectedProjectId =
    activeItem === "projects" ? sanitizeProjectId(state.selectedProjectId) : null;
  const selectedProjectRouteKey =
    activeItem === "projects"
      ? sanitizeProjectRouteKey(
          state.selectedProjectRouteKey ?? state.selectedProjectId,
        )
      : null;
  const selectedPublicProfileId =
    activeItem === "community" && communityContent === "projects"
      ? sanitizeProjectId(state.selectedPublicProfileId)
      : null;
  const selectedPublicProjectId =
    activeItem === "community" &&
    communityContent === "projects" &&
    !selectedPublicProfileId
      ? sanitizeProjectId(state.selectedPublicProjectId)
      : null;
  const selectedCommunityFlowKey = null;
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
    communityContent,
    repositoryFileContentPath,
    selectedProjectId,
    selectedProjectRouteKey,
    selectedPublicProfileId,
    selectedPublicProjectId,
    selectedCommunityFlowKey,
  };
}

export function readUrlNavigationState(): UrlNavigationState {
  const params = new URLSearchParams(window.location.search);
  const projectRouteKey = params.get("project");
  const legacyView = params.get("view");
  return normalizeUrlNavigationState({
    activityNavigation: {
      selectedPromptId: params.get("prompt"),
      selectedSessionId: params.get("session"),
      selectedSessionPromptId: params.get("prompt"),
      view: parseActivityViewId(params.get("activity")),
    },
    activeDetailTab: parseProjectDetailTabId(params.get("tab")),
    activeItem: projectRouteKey ? "projects" : parseSidebarItemId(legacyView),
    communityContent:
      legacyView === "explore"
        ? "projects"
        : parseCommunityContentType(),
    repositoryFileContentPath: params.get("file"),
    selectedProjectId: projectRouteKey,
    selectedProjectRouteKey: projectRouteKey,
    selectedPublicProfileId: params.get("profile"),
    selectedPublicProjectId: params.get("public_project"),
    selectedCommunityFlowKey: null,
  });
}

export function buildUrlNavigationSearch(state: UrlNavigationState) {
  const params = new URLSearchParams();
  const previewMode = new URLSearchParams(window.location.search).get("preview");

  if (
    previewMode === "empty-projects" ||
    previewMode === "github-unlinked-project" ||
    previewMode === "project-loading" ||
    previewMode === "community"
  ) {
    params.set("preview", previewMode);
  }

  if (state.activeItem !== "projects") {
    params.set("view", state.activeItem);
    if (state.activeItem === "community") {
      if (state.selectedPublicProfileId) {
        params.set("profile", state.selectedPublicProfileId);
      } else if (state.selectedPublicProjectId) {
        params.set("public_project", state.selectedPublicProjectId);
      }
    }
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

export function writeUrlNavigationState(
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

export function currentWorkspaceReturnUrl() {
  return `${window.location.origin}${window.location.pathname}${buildUrlNavigationSearch(
    readUrlNavigationState(),
  )}`;
}
