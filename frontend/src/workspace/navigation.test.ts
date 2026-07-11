import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildUrlNavigationSearch,
  normalizeUrlNavigationState,
} from "./navigation";

describe("workspace navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { search: "" } });
  });

  it("uses Home and session navigation as the calm default", () => {
    const state = normalizeUrlNavigationState({});

    expect(state.activeItem).toBe("home");
    expect(state.activityNavigation.view).toBe("sessions");
    expect(buildUrlNavigationSearch(state)).toBe("");
  });

  it("keeps the Projects index distinct from Home", () => {
    const state = normalizeUrlNavigationState({ activeItem: "projects" });

    expect(buildUrlNavigationSearch(state)).toBe("?view=projects");
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
