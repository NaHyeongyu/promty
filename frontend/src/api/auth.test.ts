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
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(currentUser), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchCurrentUser, getCachedCurrentUser, preloadCurrentUser } =
      await import("./auth");

    preloadCurrentUser();

    await expect(fetchCurrentUser()).resolves.toEqual(currentUser);
    await expect(fetchCurrentUser()).resolves.toEqual(currentUser);
    expect(getCachedCurrentUser()).toEqual(currentUser);
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

  it("requests the user again after the in-memory session cache is cleared", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(currentUser), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { clearCurrentUserCache, fetchCurrentUser, getCachedCurrentUser } =
      await import("./auth");

    await fetchCurrentUser();
    clearCurrentUserCache();

    expect(getCachedCurrentUser()).toBeNull();
    await fetchCurrentUser();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps account preference changes in the session cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(currentUser), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchCurrentUser, getCachedCurrentUser, updateCachedCurrentUser } =
      await import("./auth");

    await fetchCurrentUser();
    updateCachedCurrentUser({ preferred_locale: "ja" });

    expect(getCachedCurrentUser()?.preferred_locale).toBe("ja");
    await expect(fetchCurrentUser()).resolves.toMatchObject({ preferred_locale: "ja" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
