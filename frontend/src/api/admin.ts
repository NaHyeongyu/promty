import type {
  AccountCollectorToken,
  AdminAuditLog,
  AdminEventPage,
  AdminJob,
  AdminOverview,
  AdminPage,
  AdminProject,
  AdminSystem,
  AdminSupportInquiry,
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

export function updateAdminAlertState(
  alertKey: string,
  conditionHash: string,
  state: "read" | "resolved" | "snoozed",
  snoozeHours = 24,
): Promise<{
  condition_hash: string;
  key: string;
  snoozed_until: string | null;
  state: "read" | "resolved" | "snoozed";
}> {
  return requestJsonBody(
    `/api/admin/alerts/${encodeURIComponent(alertKey)}/state`,
    "PUT",
    { condition_hash: conditionHash, snooze_hours: snoozeHours, state },
    adminMessages,
  );
}

const adminMessages = {
  errorMessage: "Admin control center request failed",
  forbiddenMessage: "Admin access is not enabled for this GitHub account.",
};

export type AdminListOptions = {
  limit?: number;
  offset?: number;
  query?: string;
};

function adminListParams(options: AdminListOptions = {}) {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 25),
    offset: String(options.offset ?? 0),
  });
  if (options.query?.trim()) params.set("query", options.query.trim());
  return params;
}

export function fetchAdminUsers(
  options: AdminListOptions = {},
  signal?: AbortSignal,
): Promise<AdminPage<AdminUser>> {
  return requestJson<AdminPage<AdminUser>>(
    `/api/admin/users?${adminListParams(options).toString()}`,
    { signal },
    adminMessages,
  );
}

export function fetchAdminProjects(
  options: AdminListOptions & {
    sort?: "popularity" | "recent" | "saves" | "views" | "views_7d";
    visibility?: "all" | "private" | "public";
  } = {},
  signal?: AbortSignal,
): Promise<AdminPage<AdminProject>> {
  const params = adminListParams(options);
  if (options.sort) params.set("sort", options.sort);
  if (options.visibility && options.visibility !== "all") params.set("visibility", options.visibility);
  return requestJson<AdminPage<AdminProject>>(
    `/api/admin/projects?${params.toString()}`,
    { signal },
    adminMessages,
  );
}

export function fetchAdminSupportInquiries(
  options: AdminListOptions & { status?: string } = {},
  signal?: AbortSignal,
): Promise<AdminPage<AdminSupportInquiry>> {
  const params = adminListParams(options);
  if (options.status && options.status !== "all") params.set("status", options.status);
  return requestJson<AdminPage<AdminSupportInquiry>>(
    `/api/admin/support-inquiries?${params.toString()}`,
    { signal },
    adminMessages,
  );
}

export function updateAdminSupportInquiry(
  inquiryId: string,
  status: AdminSupportInquiry["status"],
): Promise<AdminSupportInquiry> {
  return requestJsonBody(
    `/api/admin/support-inquiries/${inquiryId}`,
    "PATCH",
    { status },
    adminMessages,
  );
}

export function fetchAdminJobs(
  options: AdminListOptions & { status?: string } = {},
  signal?: AbortSignal,
): Promise<AdminPage<AdminJob>> {
  const params = adminListParams(options);
  if (options.status && options.status !== "all") params.set("status", options.status);
  return requestJson<AdminPage<AdminJob>>(
    `/api/admin/jobs?${params.toString()}`,
    { signal },
    adminMessages,
  );
}

export function fetchAdminEvents(
  options: AdminListOptions = {},
  signal?: AbortSignal,
): Promise<AdminEventPage> {
  const params = adminListParams(options);
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
  options: AdminListOptions & {
    action?: string;
    outcome?: "error" | "success";
    resourceType?: string;
  } = {},
  signal?: AbortSignal,
): Promise<AdminPage<AdminAuditLog>> {
  const params = adminListParams(options);
  if (options.action?.trim()) params.set("action", options.action.trim());
  if (options.outcome) params.set("outcome", options.outcome);
  if (options.resourceType?.trim()) params.set("resource_type", options.resourceType.trim());
  return requestJson<AdminPage<AdminAuditLog>>(
    `/api/admin/audit-logs?${params.toString()}`,
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

export function acknowledgeAdminRisk(
  riskKey: string,
  confirmation: string,
): Promise<{ acknowledged: boolean; key: string }> {
  return requestJsonBody(
    `/api/admin/risks/${encodeURIComponent(riskKey)}/acknowledge`,
    "POST",
    { confirmation },
    adminMessages,
  );
}

export function clearAdminRiskAcknowledgement(
  riskKey: string,
  confirmation: string,
): Promise<{ acknowledged: boolean; key: string }> {
  return requestJsonBody(
    `/api/admin/risks/${encodeURIComponent(riskKey)}/clear-acknowledgement`,
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
