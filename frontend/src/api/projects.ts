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
  | "generation_delayed"
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

const PROJECT_MEMORY_GENERATION_TIMEOUT_MS = 10 * 60 * 1_000;
const PROJECT_MEMORY_POLL_INTERVAL_MS = 2_000;

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

function delayedProjectMemoryResponse(
  response?: ProjectMemoryGenerationResponse,
): ProjectMemoryGenerationResponse {
  return {
    ...(response ?? { batch_id: "" }),
    message: "This update is taking longer than expected. Check its status to continue.",
    retryable: true,
    status: "generation_delayed",
  };
}

function waitForProjectMemoryPoll(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(signal.reason);
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export function fetchProjectSummaries(signal?: AbortSignal): Promise<ProjectSummary[]> {
  return requestJson<ProjectSummary[]>("/api/projects", { signal }, {
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
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    PROJECT_MEMORY_GENERATION_TIMEOUT_MS,
  );
  let response: ProjectMemoryGenerationResponse | undefined;

  try {
    response = await requestJson<ProjectMemoryGenerationResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/memory/generate`,
      {
        body: JSON.stringify({
          idempotency_key: projectMemoryIdempotencyKey(projectId),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      },
      {
        errorMessage: "Project memory generation failed",
        unauthorizedMessage: "Sign in again before creating project memory.",
      },
    );
    while (response.status === "generation_in_progress") {
      await waitForProjectMemoryPoll(
        PROJECT_MEMORY_POLL_INTERVAL_MS,
        controller.signal,
      );
      response = await requestJson<ProjectMemoryGenerationResponse>(
        `/api/projects/${encodeURIComponent(projectId)}/memory/batches/${encodeURIComponent(
          response.batch_id,
        )}`,
        { signal: controller.signal },
        {
          errorMessage: "Project memory status request failed",
          unauthorizedMessage: "Sign in again before checking project memory.",
        },
      );
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return delayedProjectMemoryResponse(response);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response) {
    return delayedProjectMemoryResponse();
  }
  if (
    ["memory_generated", "no_memory", "no_pending"].includes(response.status) ||
    (response.status === "generation_failed" && response.retryable === false)
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
