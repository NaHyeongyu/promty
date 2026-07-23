import { describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../api/client";
import { settleActivityDeletionRefresh } from "./useProjectActions";

describe("activity deletion refresh", () => {
  it("preserves a successful deletion when the follow-up refresh fails", async () => {
    const refreshError = new Error("temporary refresh failure");
    const onUnauthorized = vi.fn();
    const warn = vi.fn();

    await expect(
      settleActivityDeletionRefresh(
        () => Promise.reject(refreshError),
        onUnauthorized,
        warn,
      ),
    ).resolves.toBeUndefined();

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Activity was deleted, but the project status could not be refreshed.",
      refreshError,
    );
  });

  it("still propagates an unauthorized refresh", async () => {
    const unauthorized = new UnauthorizedError();
    const onUnauthorized = vi.fn();

    await expect(
      settleActivityDeletionRefresh(
        () => Promise.reject(unauthorized),
        onUnauthorized,
        vi.fn(),
      ),
    ).rejects.toBe(unauthorized);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
