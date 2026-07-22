import { beforeEach, describe, expect, it, vi } from "vitest";


describe("account API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("sends explicit permanent-deletion acknowledgement and username", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        counts: { collector_tokens: 1, projects: 2, published_flows: 3 },
        status: "deleted",
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { deleteCurrentAccount } = await import("./account");

    await expect(deleteCurrentAccount("member-name")).resolves.toMatchObject({
      status: "deleted",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/api/account",
      expect.objectContaining({
        body: JSON.stringify({
          acknowledge_permanent_deletion: true,
          confirmation: "member-name",
        }),
        credentials: "include",
        method: "DELETE",
      }),
    );
  });

  it("accepts required policies without changing external AI consent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        current_policy_version: "2026-07-21",
        eligibility_confirmed: true,
        external_ai_allowed: false,
        external_ai_consented_at: null,
        external_ai_providers: ["openai"],
        policy_accepted: true,
        policy_accepted_at: "2026-07-21T00:00:00Z",
      }), { headers: { "Content-Type": "application/json" }, status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { acceptAccountPolicies } = await import("./account");

    await acceptAccountPolicies();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/api/account/policy-acceptance",
      expect.objectContaining({
        body: JSON.stringify({
          accept_privacy_notice: true,
          accept_terms: true,
          confirm_age_and_business_use: true,
        }),
        method: "PUT",
      }),
    );
  });

  it("updates optional external AI consent independently", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        current_policy_version: "2026-07-21",
        eligibility_confirmed: true,
        external_ai_allowed: true,
        external_ai_consented_at: "2026-07-21T00:00:00Z",
        external_ai_providers: ["openai"],
        policy_accepted: true,
        policy_accepted_at: "2026-07-21T00:00:00Z",
      }), { headers: { "Content-Type": "application/json" }, status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { updateAccountExternalAiConsent } = await import("./account");

    await updateAccountExternalAiConsent(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/api/account/external-ai-consent",
      expect.objectContaining({
        body: JSON.stringify({ allow_external_ai: true }),
        method: "PUT",
      }),
    );
  });
});
