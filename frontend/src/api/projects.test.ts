import { beforeEach, describe, expect, it, vi } from "vitest";


describe("project metadata API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("sends a project name update in the metadata patch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "project-id", name: "Renamed project" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { updateProjectMetadata } = await import("./projects");

    await updateProjectMetadata("project-id", { name: "Renamed project" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/api/projects/project-id/metadata",
      expect.objectContaining({
        body: JSON.stringify({ name: "Renamed project" }),
        credentials: "include",
        method: "PATCH",
      }),
    );
  });
});
