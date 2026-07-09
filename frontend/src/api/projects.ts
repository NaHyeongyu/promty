import type {
  ProjectDetailApiResponse,
  ProjectGithubFileContentApiResponse,
  ProjectGithubFilesApiResponse,
  ProjectMemoryPendingRangeApiResponse,
  ProjectMemorySnapshotApiResponse,
  ProjectPromptActivitiesApiResponse,
  ProjectSummary,
} from "../workspace/types";
import { requestJson, requestJsonBody, requestVoid } from "./client";

export type ProjectDetailResourcesResponse = ProjectDetailApiResponse & {
  memory: NonNullable<ProjectDetailApiResponse["memory"]> & {
    drafts: [];
    pending_ranges: ProjectMemoryPendingRangeApiResponse[];
    project_memory: ProjectMemorySnapshotApiResponse;
  };
};

export type ProjectCheckpointResponse = {
  message?: string;
  project_memory?: ProjectMemorySnapshotApiResponse | null;
  status?: string;
};

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
  const pendingRanges = await requestJson<ProjectMemoryPendingRangeApiResponse[]>(
    `/api/projects/${encodedProjectId}/memory/pending`,
    { signal },
    {
      errorMessage: "Memory pending ranges request failed",
    },
  );
  const projectMemory = await requestJson<ProjectMemorySnapshotApiResponse>(
    `/api/projects/${encodedProjectId}/memory/project`,
    { signal },
    {
      errorMessage: "Project memory request failed",
    },
  );

  return {
    ...detail,
    memory: {
      latest_artifact_at: detail.memory?.latest_artifact_at ?? null,
      recent_artifacts: detail.memory?.recent_artifacts ?? [],
      total_artifacts: detail.memory?.total_artifacts ?? 0,
      drafts: [],
      pending_ranges: pendingRanges,
      project_memory: projectMemory,
    },
  };
}

export function checkpointProjectSession(
  projectId: string,
  sessionId: string,
): Promise<ProjectCheckpointResponse> {
  return requestJson<ProjectCheckpointResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(
      sessionId,
    )}/checkpoint`,
    { method: "POST" },
    {
      errorMessage: "Pending Work organization failed",
      unauthorizedMessage: "Sign in again before organizing Pending Memory.",
    },
  );
}

export function compileProjectMemory(projectId: string): Promise<void> {
  return requestVoid(
    `/api/projects/${encodeURIComponent(
      projectId,
    )}/memory/project/compile?regenerate=true`,
    { method: "POST" },
    {
      errorMessage: "Project Memory compile failed",
      unauthorizedMessage: "Sign in again before compiling Project Memory.",
    },
  );
}

export function updateProjectMemory(
  projectId: string,
  bodyMarkdown: string,
): Promise<void> {
  return requestVoid(
    `/api/projects/${encodeURIComponent(projectId)}/memory/project`,
    {
      body: JSON.stringify({ body_markdown: bodyMarkdown }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
    {
      errorMessage: "Project Memory save failed",
      unauthorizedMessage: "Sign in again before saving Project Memory.",
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
