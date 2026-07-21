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

  it("keeps required policy confirmations separate from optional AI consent", async () => {
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
    const { updateAccountPolicyConsents } = await import("./account");

    await updateAccountPolicyConsents(false);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/api/account/policy-consents",
      expect.objectContaining({
        body: JSON.stringify({
          accept_privacy_notice: true,
          accept_terms: true,
          allow_external_ai: false,
          confirm_age_and_business_use: true,
        }),
        method: "PUT",
      }),
    );
  });
});
