import { beforeEach, describe, expect, it, vi } from "vitest";


describe("marketing admin API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("sends a confirmed DELETE request for marketing content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ campaign_name: "Launch", id: "content-id", status: "deleted" }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { deleteMarketingContent } = await import("./marketing");

    await expect(deleteMarketingContent("content-id", "Launch")).resolves.toMatchObject({
      id: "content-id",
      status: "deleted",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/api/admin/marketing-content/content-id",
      expect.objectContaining({
        body: JSON.stringify({ confirmation: "Launch" }),
        credentials: "include",
        method: "DELETE",
      }),
    );
  });
});
