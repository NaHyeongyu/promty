import {
  DEFAULT_URL_NAVIGATION_STATE,
  buildUrlNavigationSearch,
  normalizeUrlNavigationState,
} from "./navigation";
import type { ProjectDetailTabId } from "../components/project-detail";
import type { Project } from "./types";

export function projectDetailUrl(projectKey: string) {
  const params = new URLSearchParams({
    project: projectKey,
    tab: "overview",
  });
  return `${window.location.origin}/?${params.toString()}`;
}

export function buildProjectShareUrl(
  project: Project,
  selectedProjectRouteKey: string | null,
  tab: ProjectDetailTabId = "overview",
) {
  return `${window.location.origin}${window.location.pathname}${buildUrlNavigationSearch(
    normalizeUrlNavigationState({
      ...DEFAULT_URL_NAVIGATION_STATE,
      activeDetailTab: tab,
      activeItem: "projects",
      selectedProjectId: project.id,
      selectedProjectRouteKey: selectedProjectRouteKey ?? project.id,
    }),
  )}`;
}
