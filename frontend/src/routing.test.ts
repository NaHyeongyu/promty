import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appRouteFromLocation,
  appRouteFromPathname,
  isLegacyWorkspaceSearch,
  navigateToAppUrl,
} from "./routing";

describe("appRouteFromPathname", () => {
  it("matches supported application routes", () => {
    expect(appRouteFromPathname("/")).toBe("landing");
    expect(appRouteFromPathname("/about/")).toBe("about");
    expect(appRouteFromPathname("/product/")).toBe("product");
    expect(appRouteFromPathname("/privacy")).toBe("legal-privacy");
    expect(appRouteFromPathname("/terms/")).toBe("legal-terms");
    expect(appRouteFromPathname("/acceptable-use")).toBe("legal-acceptable-use");
    expect(appRouteFromPathname("/security")).toBe("legal-security");
    expect(appRouteFromPathname("/app")).toBe("workspace");
    expect(appRouteFromPathname("/admin/")).toBe("admin");
    expect(appRouteFromPathname("/docs/collector")).toBe("collector-docs");
    expect(appRouteFromPathname("/docs/collector/ai/")).toBe("collector-docs-ai");
    expect(appRouteFromPathname("/cli/login")).toBe("cli-login");
  });

  it("rejects unknown and nested paths", () => {
    expect(appRouteFromPathname("/missing")).toBe("not-found");
    expect(appRouteFromPathname("/admin/missing")).toBe("not-found");
  });

  it("keeps legacy root workspace links working", () => {
    expect(isLegacyWorkspaceSearch("?view=community&public_project=project-id")).toBe(true);
    expect(isLegacyWorkspaceSearch("?project=project-id&tab=memory")).toBe(true);
    expect(isLegacyWorkspaceSearch("?preview=project-loading")).toBe(true);
    expect(isLegacyWorkspaceSearch("?auth_error=github_authorization_cancelled")).toBe(true);
    expect(isLegacyWorkspaceSearch("?utm_source=launch")).toBe(false);
    expect(isLegacyWorkspaceSearch("")).toBe(false);

    expect(appRouteFromLocation("/", "?view=community")).toBe("workspace");
    expect(appRouteFromLocation("/", "?project=project-id&tab=memory")).toBe(
      "workspace",
    );
    expect(appRouteFromLocation("/", "?preview=project-loading")).toBe(
      "workspace",
    );
    expect(
      appRouteFromLocation("/", "?auth_error=github_authorization_cancelled"),
    ).toBe("workspace");
  });

  it("keeps ordinary root visits and campaigns on the landing page", () => {
    expect(appRouteFromLocation("/", "")).toBe("landing");
    expect(appRouteFromLocation("/", "?utm_source=launch")).toBe("landing");
    expect(appRouteFromLocation("/about", "?project=project-id")).toBe("about");
  });
});

describe("navigateToAppUrl", () => {
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
      location: { origin: "https://promty.org" },
    });
  });

  it("uses history navigation for supported same-origin pages", () => {
    expect(navigateToAppUrl("/admin?section=system")).toBe(true);
    expect(window.history.pushState).toHaveBeenCalledWith(
      { promtyAppNavigation: true },
      "",
      "/admin?section=system",
    );
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("does not intercept API, raw document, or external URLs", () => {
    expect(navigateToAppUrl("/api/auth/github/web/start")).toBe(false);
    expect(navigateToAppUrl("/docs/promty-agent-setup.md")).toBe(false);
    expect(navigateToAppUrl("https://github.com/example/project")).toBe(false);
    expect(window.history.pushState).not.toHaveBeenCalled();
  });
});
