import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildUrlNavigationSearch,
  navigateToWorkspaceUrl,
  normalizeUrlNavigationState,
  readUrlNavigationState,
} from "./navigation";

describe("workspace navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("PopStateEvent", class {
      state: unknown;
      type: string;

      constructor(type: string, init?: { state?: unknown }) {
        this.type = type;
        this.state = init?.state;
      }
    });
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      location: {
        hash: "",
        origin: "https://promty.org",
        pathname: "/",
        search: "",
      },
    });
  });

  it("uses Projects and prompt navigation as the default", () => {
    const state = normalizeUrlNavigationState({});

    expect(state.activeItem).toBe("projects");
    expect(state.communityContent).toBe("projects");
    expect(state.selectedPublicProfileId).toBeNull();
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

  it("keeps the support page in a shareable workspace URL", () => {
    window.location.search = "?view=support";
    const state = readUrlNavigationState();

    expect(state.activeItem).toBe("support");
    expect(buildUrlNavigationSearch(state)).toBe("?view=support");
  });

  it("keeps the pinned projects page in a shareable workspace URL", () => {
    window.location.search = "?view=pinned";
    const state = readUrlNavigationState();

    expect(state.activeItem).toBe("pinned");
    expect(buildUrlNavigationSearch(state)).toBe("?view=pinned");
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

  it("keeps a selected public project in Community project URLs", () => {
    const projectId = "56828395-f94c-56f7-9ff9-a2feb027ae19";
    const state = normalizeUrlNavigationState({
      activeItem: "community",
      communityContent: "projects",
      selectedPublicProjectId: projectId,
    });

    expect(state.selectedProjectId).toBeNull();
    expect(state.selectedPublicProjectId).toBe(projectId);
    expect(buildUrlNavigationSearch(state)).toBe(
      `?view=community&public_project=${projectId}`,
    );
  });

  it("redirects legacy Explore links to Community projects", () => {
    const projectId = "56828395-f94c-56f7-9ff9-a2feb027ae19";
    window.location.search = `?view=explore&public_project=${projectId}`;

    const state = readUrlNavigationState();

    expect(state.activeItem).toBe("community");
    expect(state.communityContent).toBe("projects");
    expect(state.selectedPublicProjectId).toBe(projectId);
    expect(buildUrlNavigationSearch(state)).toBe(
      `?view=community&public_project=${projectId}`,
    );
  });

  it("keeps public profiles separate from project detail URLs", () => {
    const profileId = "451be15f-41ad-4bf0-9fdf-978ceff26f45";
    const projectId = "56828395-f94c-56f7-9ff9-a2feb027ae19";
    const state = normalizeUrlNavigationState({
      activeItem: "community",
      communityContent: "projects",
      selectedPublicProfileId: profileId,
      selectedPublicProjectId: projectId,
    });

    expect(state.selectedPublicProfileId).toBe(profileId);
    expect(state.selectedPublicProjectId).toBeNull();
    expect(buildUrlNavigationSearch(state)).toBe(
      `?view=community&profile=${profileId}`,
    );
  });

  it("redirects removed prompt-flow URLs to Community projects", () => {
    window.location.search =
      "?view=community&content=flows&flow=secure-review-flow";
    const state = readUrlNavigationState();

    expect(state.activeItem).toBe("community");
    expect(state.communityContent).toBe("projects");
    expect(state.selectedCommunityFlowKey).toBeNull();
    expect(buildUrlNavigationSearch(state)).toBe("?view=community");
  });

  it("preserves Community preview mode while navigating", () => {
    window.location.search = "?view=community&preview=community";
    const state = readUrlNavigationState();

    expect(state.activeItem).toBe("community");
    expect(buildUrlNavigationSearch(state)).toBe("?preview=community&view=community");
  });

  it("navigates workspace links without reloading the document", () => {
    const projectId = "56828395-f94c-56f7-9ff9-a2feb027ae19";

    expect(
      navigateToWorkspaceUrl(
        `https://promty.org/app?view=community&public_project=${projectId}`,
      ),
    ).toBe(true);
    expect(window.history.pushState).toHaveBeenCalledWith(
      expect.objectContaining({ promtyNavigation: expect.any(Object) }),
      "",
      `/?view=community&public_project=${projectId}`,
    );
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("leaves external links to normal browser navigation", () => {
    expect(navigateToWorkspaceUrl("https://github.com/example/project")).toBe(false);
    expect(window.history.pushState).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });
});
