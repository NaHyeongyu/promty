import {
  DEFAULT_URL_NAVIGATION_STATE,
  buildUrlNavigationSearch,
  normalizeUrlNavigationState,
} from "./navigation";
import type { ProjectDetailTabId } from "../components/project-detail";
import type { Project } from "./types";

function currentLocation() {
  if (typeof window === "undefined") {
    return { origin: "http://localhost:3000", pathname: "/" };
  }
  return window.location;
}

export function projectDetailUrl(projectKey: string) {
  const location = currentLocation();
  const params = new URLSearchParams({
    project: projectKey,
    tab: "overview",
  });
  return `${location.origin}/?${params.toString()}`;
}

export function externalProjectHref(projectUrl: string) {
  const value = projectUrl.trim();
  if (!value) {
    return undefined;
  }
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function publicProjectUrl(projectId: string) {
  const location = currentLocation();
  return `${location.origin}${location.pathname}${buildUrlNavigationSearch(
    normalizeUrlNavigationState({
      ...DEFAULT_URL_NAVIGATION_STATE,
      activeItem: "community",
      communityContent: "projects",
      selectedPublicProjectId: projectId,
    }),
  )}`;
}

export function buildProjectShareUrl(
  project: Project,
  selectedProjectRouteKey: string | null,
  tab: ProjectDetailTabId = "overview",
) {
  if (project.visibility === "public") {
    return publicProjectUrl(project.id);
  }

  const location = currentLocation();
  return `${location.origin}${location.pathname}${buildUrlNavigationSearch(
    normalizeUrlNavigationState({
      ...DEFAULT_URL_NAVIGATION_STATE,
      activeDetailTab: tab,
      activeItem: "projects",
      selectedProjectId: project.id,
      selectedProjectRouteKey: selectedProjectRouteKey ?? project.id,
    }),
  )}`;
}
