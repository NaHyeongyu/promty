import { describe, expect, it } from "vitest";
import { getCollectorHealth } from "./collectorHealth";
import type { AccountOverview } from "../workspace/types";

const NOW = Date.parse("2026-07-18T00:00:00.000Z");

function overview(
  lastUsedAt: string | null,
  collectorVersion = "0.1.5",
): AccountOverview {
  return {
    collector_tokens: [
      {
        collector_version: collectorVersion,
        created_at: "2026-07-01T00:00:00.000Z",
        id: "token-1",
        last_used_at: lastUsedAt,
        name: "Local laptop",
        revoked_at: null,
        status: "active",
      },
    ],
    github_connection: {
      connected: false,
      created_at: null,
      revoked_at: null,
      scopes: [],
      status: "not_connected",
      token_type: null,
      updated_at: null,
    },
    latest_collector_version: "0.1.5",
    user: {
      avatar_url: null,
      email: null,
      github_repository_access: false,
      id: "user-1",
      is_admin: false,
      preferred_locale: "ko",
      username: "member",
    },
  };
}

describe("getCollectorHealth", () => {
  it("treats a recent heartbeat as connected", () => {
    expect(
      getCollectorHealth(overview("2026-07-17T23:55:00.000Z"), NOW).state,
    ).toBe("connected");
  });

  it("warns when heartbeat delivery is delayed", () => {
    expect(
      getCollectorHealth(overview("2026-07-17T23:45:00.000Z"), NOW).state,
    ).toBe("delayed");
  });

  it("marks a collector disconnected after thirty minutes", () => {
    expect(
      getCollectorHealth(overview("2026-07-17T23:20:00.000Z"), NOW).state,
    ).toBe("disconnected");
  });

  it("prioritizes disconnection over an available update", () => {
    const health = getCollectorHealth(
      overview("2026-07-17T23:20:00.000Z", "0.1.4"),
      NOW,
    );

    expect(health.state).toBe("disconnected");
    expect(health.updateAvailable).toBe(true);
  });

  it("uses the most recently active device for the sidebar update state", () => {
    const account = overview("2026-07-17T23:55:00.000Z");
    account.collector_tokens.push({
      ...account.collector_tokens[0],
      collector_version: "0.1.4",
      id: "older-device",
      last_used_at: "2026-07-16T00:00:00.000Z",
    });

    expect(getCollectorHealth(account, NOW).updateAvailable).toBe(false);
  });
});
