import type {
  AccountCollectorToken,
  AdminAuditLog,
  AdminEventPage,
  AdminJob,
  AdminOverview,
  AdminPage,
  AdminProject,
  AdminSystem,
  AdminUser,
} from "../workspace/types";
import { requestJson, requestJsonBody } from "./client";

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

const adminMessages = {
  errorMessage: "Admin control center request failed",
  forbiddenMessage: "Admin access is not enabled for this GitHub account.",
};

export function fetchAdminUsers(signal?: AbortSignal): Promise<AdminPage<AdminUser>> {
  return requestJson<AdminPage<AdminUser>>(
    "/api/admin/users?limit=200",
    { signal },
    adminMessages,
  );
}

export function fetchAdminProjects(
  signal?: AbortSignal,
): Promise<AdminPage<AdminProject>> {
  return requestJson<AdminPage<AdminProject>>(
    "/api/admin/projects?limit=200",
    { signal },
    adminMessages,
  );
}

export function fetchAdminJobs(signal?: AbortSignal): Promise<AdminPage<AdminJob>> {
  return requestJson<AdminPage<AdminJob>>(
    "/api/admin/jobs?limit=200",
    { signal },
    adminMessages,
  );
}

export function fetchAdminEvents(
  query = "",
  signal?: AbortSignal,
): Promise<AdminEventPage> {
  const params = new URLSearchParams({ limit: "500" });
  if (query.trim()) params.set("query", query.trim());
  return requestJson<AdminEventPage>(
    `/api/admin/events?${params.toString()}`,
    { signal },
    adminMessages,
  );
}

export function fetchAdminSystem(signal?: AbortSignal): Promise<AdminSystem> {
  return requestJson<AdminSystem>("/api/admin/system", { signal }, adminMessages);
}

export function fetchAdminAuditLogs(
  signal?: AbortSignal,
): Promise<AdminPage<AdminAuditLog>> {
  return requestJson<AdminPage<AdminAuditLog>>(
    "/api/admin/audit-logs?limit=200",
    { signal },
    adminMessages,
  );
}

export function revokeAdminCollectorToken(
  userId: string,
  tokenId: string,
  confirmation: string,
): Promise<AccountCollectorToken> {
  return requestJsonBody<AccountCollectorToken>(
    `/api/admin/users/${userId}/collector-tokens/${tokenId}/revoke`,
    "POST",
    { confirmation },
    adminMessages,
  );
}

export function revokeAllAdminCollectorTokens(
  userId: string,
  confirmation: string,
): Promise<{ revoked: number; user_id: string }> {
  return requestJsonBody<{ revoked: number; user_id: string }>(
    `/api/admin/users/${userId}/collector-tokens/revoke-all`,
    "POST",
    { confirmation },
    adminMessages,
  );
}

export function disconnectAdminGithub(
  userId: string,
  confirmation: string,
): Promise<{ disconnected: boolean; user_id: string }> {
  return requestJsonBody<{ disconnected: boolean; user_id: string }>(
    `/api/admin/users/${userId}/github-connection/disconnect`,
    "POST",
    { confirmation },
    adminMessages,
  );
}

export function suspendAdminUser(
  userId: string,
  confirmation: string,
  reason: string,
): Promise<{ status: string; user_id: string }> {
  return requestJsonBody(
    `/api/admin/users/${userId}/suspend`,
    "POST",
    { confirmation, reason },
    adminMessages,
  );
}

export function restoreAdminUser(
  userId: string,
  confirmation: string,
): Promise<{ status: string; user_id: string }> {
  return requestJsonBody(
    `/api/admin/users/${userId}/restore`,
    "POST",
    { confirmation },
    adminMessages,
  );
}

export function deleteAdminUser(
  userId: string,
  confirmation: string,
): Promise<{ user_id: string; username: string }> {
  return requestJsonBody(
    `/api/admin/users/${userId}`,
    "DELETE",
    { confirmation },
    adminMessages,
  );
}

export function createAdminCollectorToken(
  userId: string,
  confirmation: string,
  name: string,
): Promise<{ collector_token: AccountCollectorToken; token: string }> {
  return requestJsonBody(
    `/api/admin/users/${userId}/collector-tokens`,
    "POST",
    { confirmation, name },
    adminMessages,
  );
}

export type AdminProjectMutation = {
  confirmation: string;
  default_branch?: string | null;
  description?: string | null;
  github_url?: string | null;
  name?: string | null;
  owner_id?: string;
  project_url?: string | null;
  slug?: string | null;
  tags?: string[] | null;
  visibility?: "private" | "public" | null;
};

export type AdminProjectMutationResponse = {
  created_at: string | null;
  default_branch: string;
  description: string | null;
  github_url: string | null;
  id: string;
  name: string;
  owner: { id: string; username: string };
  project_url: string | null;
  slug: string;
  tags: string[];
  updated_at: string | null;
  visibility: "private" | "public";
};

export function createAdminProject(
  payload: AdminProjectMutation & { name: string; owner_id: string },
): Promise<AdminProjectMutationResponse> {
  return requestJsonBody("/api/admin/projects", "POST", payload, adminMessages);
}

export function updateAdminProject(
  projectId: string,
  payload: AdminProjectMutation,
): Promise<AdminProjectMutationResponse> {
  return requestJsonBody(
    `/api/admin/projects/${projectId}`,
    "PATCH",
    payload,
    adminMessages,
  );
}

export function deleteAdminProject(
  projectId: string,
  confirmation: string,
): Promise<{ project_id: string; slug: string }> {
  return requestJsonBody(
    `/api/admin/projects/${projectId}`,
    "DELETE",
    { confirmation },
    adminMessages,
  );
}

export function cancelAdminJob(
  jobId: string,
  confirmation: string,
): Promise<{ batch_id: string; retryable: boolean; status: string }> {
  return requestJsonBody(
    `/api/admin/jobs/${jobId}/cancel`,
    "POST",
    { confirmation },
    adminMessages,
  );
}

export function retryAdminJob(
  jobId: string,
  confirmation: string,
): Promise<{ batch_id: string; status: string }> {
  return requestJsonBody(
    `/api/admin/jobs/${jobId}/retry`,
    "POST",
    { confirmation },
    adminMessages,
  );
}

export function exportAdminEvents(
  confirmation: string,
  query: string,
): Promise<Record<string, unknown>> {
  return requestJsonBody(
    "/api/admin/exports/events",
    "POST",
    { confirmation, query: query.trim() || null },
    adminMessages,
  );
}

export function exportAdminProject(
  projectId: string,
  confirmation: string,
): Promise<Record<string, unknown>> {
  return requestJsonBody(
    `/api/admin/exports/projects/${projectId}`,
    "POST",
    { confirmation, include_payloads: true },
    adminMessages,
  );
}
