import { describe, expect, it } from "vitest";
import { appRouteFromPathname } from "./routing";

describe("appRouteFromPathname", () => {
  it("matches supported application routes", () => {
    expect(appRouteFromPathname("/")).toBe("workspace");
    expect(appRouteFromPathname("/admin/")).toBe("admin");
    expect(appRouteFromPathname("/docs/collector")).toBe("collector-docs");
    expect(appRouteFromPathname("/docs/collector/ai/")).toBe("collector-docs-ai");
    expect(appRouteFromPathname("/cli/login")).toBe("cli-login");
  });

  it("rejects unknown and nested paths", () => {
    expect(appRouteFromPathname("/missing")).toBe("not-found");
    expect(appRouteFromPathname("/admin/missing")).toBe("not-found");
  });
});
