import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildUrlNavigationSearch,
  normalizeUrlNavigationState,
  readUrlNavigationState,
} from "./navigation";
import { PUBLISHED_FLOWS_ENABLED } from "../config";

describe("workspace navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { search: "" } });
  });

  it("uses Projects and prompt navigation as the default", () => {
    const state = normalizeUrlNavigationState({});

    expect(state.activeItem).toBe("projects");
    expect(state.activityNavigation.view).toBe("prompts");
    expect(buildUrlNavigationSearch(state)).toBe("");
  });

  it("maps the removed Home route to Projects", () => {
    window.location.search = "?view=home";
    const state = readUrlNavigationState();

    expect(state.activeItem).toBe("projects");
    expect(buildUrlNavigationSearch(state)).toBe("");
  });

  it("maps the removed Reviews route to Projects", () => {
    window.location.search = "?view=reviews";
    const state = readUrlNavigationState();

    expect(state.activeItem).toBe("projects");
    expect(buildUrlNavigationSearch(state)).toBe("");
  });

  it("drops project resources outside the projects view", () => {
    const state = normalizeUrlNavigationState({
      activeDetailTab: "files",
      activeItem: "settings",
      repositoryFileContentPath: "src/main.ts",
      selectedProjectId: "56828395-f94c-56f7-9ff9-a2feb027ae19",
    });

    expect(state.selectedProjectId).toBeNull();
    expect(state.repositoryFileContentPath).toBeNull();
    expect(buildUrlNavigationSearch(state)).toBe("?view=settings");
  });

  it("rejects traversal paths from repository navigation", () => {
    const state = normalizeUrlNavigationState({
      activeDetailTab: "files",
      activeItem: "projects",
      repositoryFileContentPath: "src/../secrets.env",
      selectedProjectId: "56828395-f94c-56f7-9ff9-a2feb027ae19",
    });

    expect(state.repositoryFileContentPath).toBeNull();
  });

  it("uses stable slugs in project URLs", () => {
    const state = normalizeUrlNavigationState({
      activeDetailTab: "overview",
      activeItem: "projects",
      selectedProjectRouteKey: "prompt-hub",
    });

    expect(buildUrlNavigationSearch(state)).toBe("?project=prompt-hub&tab=overview");
  });

  it("keeps a selected public project in Explore URLs", () => {
    const projectId = "56828395-f94c-56f7-9ff9-a2feb027ae19";
    const state = normalizeUrlNavigationState({
      activeItem: "explore",
      selectedPublicProjectId: projectId,
    });

    expect(state.selectedProjectId).toBeNull();
    expect(state.selectedPublicProjectId).toBe(projectId);
    expect(buildUrlNavigationSearch(state)).toBe(
      `?view=explore&public_project=${projectId}`,
    );
  });

  it("follows the Community release flag for prompt-flow URLs", () => {
    const state = normalizeUrlNavigationState({
      activeItem: "community",
      selectedCommunityFlowKey: "secure-review-flow",
    });

    expect(state.activeItem).toBe(PUBLISHED_FLOWS_ENABLED ? "community" : "projects");
    expect(state.selectedCommunityFlowKey).toBe(
      PUBLISHED_FLOWS_ENABLED ? "secure-review-flow" : null,
    );
    expect(buildUrlNavigationSearch(state)).toBe(
      PUBLISHED_FLOWS_ENABLED
        ? "?view=community&flow=secure-review-flow"
        : "",
    );
  });
});
