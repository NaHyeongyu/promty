import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildUrlNavigationSearch,
  normalizeUrlNavigationState,
  readUrlNavigationState,
} from "./navigation";

describe("workspace navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { search: "" } });
  });

  it("uses Projects and session navigation as the default", () => {
    const state = normalizeUrlNavigationState({});

    expect(state.activeItem).toBe("projects");
    expect(state.activityNavigation.view).toBe("sessions");
    expect(buildUrlNavigationSearch(state)).toBe("");
  });

  it("maps the removed Home route to Projects", () => {
    window.location.search = "?view=home";
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
});
