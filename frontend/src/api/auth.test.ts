import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = {
  avatar_url: null,
  email: "owner@example.com",
  github_repository_access: false,
  id: "owner-id",
  is_admin: false,
  preferred_locale: "en",
  username: "owner",
};

describe("current user preload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("reuses the request started before the workspace chunk loads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(currentUser), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchCurrentUser, preloadCurrentUser } = await import("./auth");

    preloadCurrentUser();

    await expect(fetchCurrentUser()).resolves.toEqual(currentUser);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses a preloaded unauthorized response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not authenticated" }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchCurrentUser, preloadCurrentUser } = await import("./auth");

    preloadCurrentUser();

    await expect(fetchCurrentUser()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
