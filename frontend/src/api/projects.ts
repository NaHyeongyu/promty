import type {
  ProjectDetailApiResponse,
  ProjectFilesApiResponse,
  ProjectGithubFileContentApiResponse,
  ProjectGithubFilesApiResponse,
  ProjectMemoryArtifactApiResponse,
  ProjectMemoryPendingRangeApiResponse,
  MemoryReviewQueueSnapshotApiResponse,
  ProjectPromptActivitiesApiResponse,
  ProjectSummary,
} from "../workspace/types";
import { requestJson, requestJsonBody, requestVoid } from "./client";

export type ProjectDetailResourcesResponse = ProjectDetailApiResponse & {
  memory: NonNullable<ProjectDetailApiResponse["memory"]> & {
    drafts: [];
    pending_ranges: ProjectMemoryPendingRangeApiResponse[];
  };
};

export type ProjectMemoryGenerationStatus =
  | "generation_in_progress"
  | "memory_generated"
  | "no_memory"
  | "no_pending"
  | "generation_failed";

export type ProjectMemoryGenerationResponse = {
  batch_id: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  message: string;
  retryable?: boolean;
  status: ProjectMemoryGenerationStatus;
};

export type ProjectCreatePayload = {
  default_branch?: string | null;
  description?: string | null;
  github_url: string;
  name?: string | null;
};

function projectMemoryIdempotencyStorageKey(projectId: string) {
  return `promty:project-memory-batch:${projectId}`;
}

function projectMemoryIdempotencyKey(projectId: string) {
  const storageKey = projectMemoryIdempotencyStorageKey(projectId);
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }
  const idempotencyKey = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, idempotencyKey);
  return idempotencyKey;
}

function clearProjectMemoryIdempotencyKey(projectId: string) {
  window.sessionStorage.removeItem(projectMemoryIdempotencyStorageKey(projectId));
}

export function fetchProjectSummaries(): Promise<ProjectSummary[]> {
  return requestJson<ProjectSummary[]>("/api/projects", {}, {
    errorMessage: "Projects request failed",
    unauthorizedMessage: "Sign in again before loading projects.",
  });
}

export function createProject(
  payload: ProjectCreatePayload,
): Promise<ProjectSummary> {
  return requestJsonBody<ProjectSummary>(
    "/api/projects",
    "POST",
    {
      default_branch: payload.default_branch ?? undefined,
      description: payload.description ?? undefined,
      github_url: payload.github_url,
      name: payload.name ?? undefined,
    },
    {
      errorMessage: "Project creation failed",
      unauthorizedMessage: "Sign in again before creating a project.",
    },
  );
}

export function updateProjectBookmark(
  projectId: string,
  isBookmarked: boolean,
): Promise<ProjectSummary> {
  return requestJsonBody<ProjectSummary>(
    `/api/projects/${encodeURIComponent(projectId)}/bookmark`,
    "PATCH",
    { is_bookmarked: isBookmarked },
    {
      errorMessage: "Project bookmark update failed",
      unauthorizedMessage: "Sign in again before saving projects.",
    },
  );
}

export async function fetchProjectDetailResources(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectDetailResourcesResponse> {
  const encodedProjectId = encodeURIComponent(projectId);
  const detail = await requestJson<ProjectDetailApiResponse>(
    `/api/projects/${encodedProjectId}/detail`,
    { signal },
    {
      errorMessage: "Project detail request failed",
    },
  );
  const pendingRanges = await fetchProjectMemoryPendingRanges(projectId, signal);

  return {
    ...detail,
    memory: {
      latest_artifact_at: detail.memory?.latest_artifact_at ?? null,
      recent_artifacts: detail.memory?.recent_artifacts ?? [],
      total_artifacts: detail.memory?.total_artifacts ?? 0,
      drafts: [],
      pending_ranges: pendingRanges,
    },
  };
}

export function fetchProjectMemoryPendingRanges(
  projectId: string,
  signal?: AbortSignal,
  limit = 100,
): Promise<ProjectMemoryPendingRangeApiResponse[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return requestJson<ProjectMemoryPendingRangeApiResponse[]>(
    `/api/projects/${encodeURIComponent(projectId)}/memory/pending?${params}`,
    { signal },
    {
      errorMessage: "Memory review queue request failed",
    },
  );
}

export function refreshMemoryReviewQueue(
  signal?: AbortSignal,
): Promise<MemoryReviewQueueSnapshotApiResponse> {
  return requestJson<MemoryReviewQueueSnapshotApiResponse>(
    "/api/projects/memory/review-queue/refresh?limit=100",
    { method: "POST", signal },
    {
      errorMessage: "Review queue refresh failed",
      unauthorizedMessage: "Sign in again before refreshing the review queue.",
    },
  );
}

export async function generateProjectMemory(
  projectId: string,
): Promise<ProjectMemoryGenerationResponse> {
  let response = await requestJsonBody<ProjectMemoryGenerationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/memory/generate`,
    "POST",
    { idempotency_key: projectMemoryIdempotencyKey(projectId) },
    {
      errorMessage: "Project memory generation failed",
      unauthorizedMessage: "Sign in again before creating project memory.",
    },
  );
  for (let attempt = 0; response.status === "generation_in_progress" && attempt < 300; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
    response = await requestJson<ProjectMemoryGenerationResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/memory/batches/${encodeURIComponent(
        response.batch_id,
      )}`,
      undefined,
      {
        errorMessage: "Project memory status request failed",
        unauthorizedMessage: "Sign in again before checking project memory.",
      },
    );
  }
  if (
    response.status !== "generation_in_progress" &&
    (response.status !== "generation_failed" || response.retryable === false)
  ) {
    clearProjectMemoryIdempotencyKey(projectId);
  }
  return response;
}

export function fetchProjectMemoryArtifacts(
  projectId: string,
  limit: number,
  signal?: AbortSignal,
): Promise<ProjectMemoryArtifactApiResponse[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return requestJson<ProjectMemoryArtifactApiResponse[]>(
    `/api/projects/${encodeURIComponent(projectId)}/artifacts?${params}`,
    { signal },
    {
      errorMessage: "Memory history request failed",
    },
  );
}

export function fetchProjectGithubFiles(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectGithubFilesApiResponse> {
  return requestJson<ProjectGithubFilesApiResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/github/files`,
    { signal },
    {
      errorMessage: "GitHub files request failed",
    },
  );
}

export function fetchProjectFiles(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectFilesApiResponse> {
  return requestJson<ProjectFilesApiResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/files`,
    { signal },
    {
      errorMessage: "Tracked files request failed",
    },
  );
}

export function fetchProjectPromptActivities({
  cursor,
  limit,
  projectId,
  query,
  sessionId,
  signal,
}: {
  cursor?: string | null;
  limit: number;
  projectId: string;
  query?: string;
  sessionId?: string | null;
  signal?: AbortSignal;
}): Promise<ProjectPromptActivitiesApiResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
  });
  if (cursor) {
    params.set("cursor", cursor);
  }
  if (query?.trim()) {
    params.set("q", query.trim());
  }
  if (sessionId) {
    params.set("session_id", sessionId);
  }

  return requestJson<ProjectPromptActivitiesApiResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/prompt-activities?${params}`,
    { signal },
    {
      errorMessage: "Prompt activity request failed",
    },
  );
}

export function fetchRepositoryFileContent(
  projectId: string,
  path: string,
  signal?: AbortSignal,
): Promise<ProjectGithubFileContentApiResponse> {
  return requestJson<ProjectGithubFileContentApiResponse>(
    `/api/projects/${encodeURIComponent(
      projectId,
    )}/github/files/content?${new URLSearchParams({ path })}`,
    { signal },
    {
      errorMessage: "GitHub file request failed",
    },
  );
}

export function updateRepositoryConnection(
  projectId: string,
  githubUrl: string,
): Promise<ProjectSummary> {
  return requestJsonBody<ProjectSummary>(
    `/api/projects/${encodeURIComponent(projectId)}/repository`,
    "PATCH",
    { github_url: githubUrl },
    {
      errorMessage: "Repository connection failed",
      unauthorizedMessage: "Sign in again before connecting a repository.",
    },
  );
}

export function updateProjectDescription(
  projectId: string,
  description: string,
): Promise<void> {
  return requestVoid(
    `/api/projects/${encodeURIComponent(projectId)}/description`,
    {
      body: JSON.stringify({ description }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
    {
      errorMessage: "Description update failed",
      unauthorizedMessage: "Sign in again before editing the project description.",
    },
  );
}

export type ProjectMetadataPatch = {
  slug?: string;
  tags?: string[];
  visibility?: "private" | "public";
};

export function updateProjectMetadata(
  projectId: string,
  metadata: ProjectMetadataPatch,
): Promise<ProjectSummary> {
  return requestJsonBody<ProjectSummary>(
    `/api/projects/${encodeURIComponent(projectId)}/metadata`,
    "PATCH",
    {
      ...(metadata.slug !== undefined ? { slug: metadata.slug } : {}),
      ...(metadata.tags !== undefined ? { tags: metadata.tags } : {}),
      ...(metadata.visibility !== undefined ? { visibility: metadata.visibility } : {}),
    },
    {
      errorMessage: "Project metadata update failed",
      unauthorizedMessage: "Sign in again before editing project metadata.",
    },
  );
}
