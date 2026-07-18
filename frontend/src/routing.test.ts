import { describe, expect, it } from "vitest";
import { appRouteFromPathname, isLegacyWorkspaceSearch } from "./routing";

describe("appRouteFromPathname", () => {
  it("matches supported application routes", () => {
    expect(appRouteFromPathname("/")).toBe("workspace");
    expect(appRouteFromPathname("/about/")).toBe("landing");
    expect(appRouteFromPathname("/product/")).toBe("product");
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
    expect(isLegacyWorkspaceSearch("?utm_source=launch")).toBe(false);
    expect(isLegacyWorkspaceSearch("")).toBe(false);
  });
});
