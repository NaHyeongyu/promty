import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isCommunityPreview,
  previewPublicProjectDetail,
  previewPublicProfile,
  previewPublicProjects,
  previewPublishedFlowDetail,
  previewPublishedFlows,
} from "./communityPreviewData";

describe("community preview data", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { search: "?preview=community" } });
  });

  it("provides searchable public projects without private records", () => {
    expect(isCommunityPreview()).toBe(true);

    const page = previewPublicProjects({
      limit: 24,
      offset: 0,
      query: "release",
      sort: "recent",
    });

    expect(page.total).toBe(1);
    expect(page.items[0]?.name).toBe("Release Compass");
    expect(page.items.every((project) => project.visibility === "public")).toBe(true);
  });

  it("connects a preview profile to its project details", () => {
    const page = previewPublicProjects({
      limit: 24,
      offset: 0,
      sort: "recent",
    });
    const project = page.items[0]!;
    const profile = previewPublicProfile(project.owner.id, { limit: 24, offset: 0 });
    const detail = previewPublicProjectDetail(project.id);

    expect(profile?.items.some((item) => item.id === project.id)).toBe(true);
    expect(detail?.owner.id).toBe(project.owner.id);
    expect(detail?.project.visibility).toBe("public");
  });

  it("provides prompt-flow list and detail previews", () => {
    const flows = previewPublishedFlows("review");

    expect(flows).toHaveLength(1);
    expect(previewPublishedFlowDetail(flows[0]!.slug)?.items.length).toBeGreaterThan(0);
    expect(flows[0]?.is_owner).toBe(false);
  });
});
