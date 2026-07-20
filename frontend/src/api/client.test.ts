import { beforeEach, describe, expect, it, vi } from "vitest";


describe("API session refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("shares one refresh request across concurrent unauthorized requests", async () => {
    const attempts = new Map<string, number>();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const count = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, count);
      if (url.endsWith("/api/auth/refresh")) {
        return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      }
      if (count === 1) {
        return Promise.resolve(new Response(null, { status: 401 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestJson } = await import("./client");

    await expect(Promise.all([
      requestJson<{ ok: boolean }>("/api/projects"),
      requestJson<{ ok: boolean }>("/api/account/overview"),
    ])).resolves.toEqual([{ ok: true }, { ok: true }]);

    expect(fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/auth/refresh"))).toHaveLength(1);
  });

  it("replaces encryption failures with a localized user-safe message", async () => {
    vi.stubGlobal("document", { documentElement: { lang: "ko" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "encrypted_data_unavailable",
      detail: "Some activity data is temporarily unavailable. Please try again shortly.",
    }), {
      headers: { "Content-Type": "application/json" },
      status: 503,
    })));
    const { requestJson } = await import("./client");

    await expect(requestJson("/api/events")).rejects.toThrow(
      "일부 활동 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });

  it("also hides the legacy encryption detail returned by older backends", async () => {
    vi.stubGlobal("document", { documentElement: { lang: "en" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: "Application encryption key cannot decrypt stored data",
    }), {
      headers: { "Content-Type": "application/json" },
      status: 503,
    })));
    const { requestJson } = await import("./client");

    await expect(requestJson("/api/events")).rejects.toThrow(
      "Some activity data is temporarily unavailable. Please try again shortly.",
    );
  });
});
