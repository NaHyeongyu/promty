import { isCollectorUpdateAvailable } from "./collectorVersion";
import type { AccountOverview } from "../workspace/types";

export const COLLECTOR_CONNECTED_WINDOW_MS = 10 * 60 * 1000;
export const COLLECTOR_DISCONNECTED_WINDOW_MS = 30 * 60 * 1000;

export type CollectorHealthState =
  | "checking"
  | "connected"
  | "delayed"
  | "disconnected"
  | "not-configured"
  | "update-required"
  | "waiting";

export type CollectorHealth = {
  activeTokenCount: number;
  ageMs: number | null;
  latestUsedAt: string | null;
  state: CollectorHealthState;
  updateAvailable: boolean;
};

export function getCollectorHealth(
  overview: AccountOverview | null,
  now = Date.now(),
): CollectorHealth {
  if (!overview) {
    return {
      activeTokenCount: 0,
      ageMs: null,
      latestUsedAt: null,
      state: "checking",
      updateAvailable: false,
    };
  }

  const activeTokens = overview.collector_tokens.filter(
    (token) => token.status === "active",
  );
  const latestToken = activeTokens
    .filter((token) => token.last_used_at)
    .sort(
      (first, second) =>
        Date.parse(second.last_used_at ?? "") - Date.parse(first.last_used_at ?? ""),
    )[0];
  const latestUsedAt = latestToken?.last_used_at ?? null;
  const parsedLatestUse = latestUsedAt ? Date.parse(latestUsedAt) : Number.NaN;
  const ageMs = Number.isNaN(parsedLatestUse)
    ? null
    : Math.max(0, now - parsedLatestUse);
  const updateAvailable = activeTokens.some(
    (token) =>
      token.last_used_at &&
      isCollectorUpdateAvailable(
        token.collector_version,
        overview.latest_collector_version,
      ),
  );

  let state: CollectorHealthState;
  if (activeTokens.length === 0) {
    state = "not-configured";
  } else if (latestUsedAt === null || ageMs === null) {
    state = "waiting";
  } else if (ageMs > COLLECTOR_DISCONNECTED_WINDOW_MS) {
    state = "disconnected";
  } else if (updateAvailable) {
    state = "update-required";
  } else if (ageMs > COLLECTOR_CONNECTED_WINDOW_MS) {
    state = "delayed";
  } else {
    state = "connected";
  }

  return {
    activeTokenCount: activeTokens.length,
    ageMs,
    latestUsedAt,
    state,
    updateAvailable,
  };
}
