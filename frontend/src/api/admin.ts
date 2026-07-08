import type { AdminOverview } from "../workspace/types";
import { requestJson } from "./client";

export function fetchAdminOverview(signal?: AbortSignal): Promise<AdminOverview> {
  return requestJson<AdminOverview>(
    "/api/admin/overview",
    { signal },
    {
      errorMessage: "Admin overview request failed",
      forbiddenMessage: "Admin access is not enabled for this GitHub account.",
    },
  );
}
