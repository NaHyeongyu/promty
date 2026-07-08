import type {
  ProjectDetailData,
  ProjectMemoryArtifactStage,
  ProjectMemoryReviewState,
  ProjectMemoryScope,
  RepositoryFileContent,
} from "../components/project-detail";
import { BRAND_NAME } from "../config";
import {
  formatCompactNumber,
  formatDate,
  formatLabelValue,
  formatOptionalTimestamp,
  formatRelativeTimestamp,
  formatSinceYesterdayDelta,
} from "../lib/formatters";
import { projectDetailUrl } from "./projectUrls";
import type {
  Project,
  ProjectDetailApiResponse,
  ProjectGithubFileContentApiResponse,
  ProjectGithubFilesApiResponse,
  ProjectGithubFilesState,
  ProjectMemoryArtifactApiResponse,
  ProjectMemoryPendingRangeApiResponse,
  ProjectMemorySnapshotApiResponse,
} from "./types";

export function emptyProjectDetailData(project: Project | null): ProjectDetailData {
  return {
    activities: [],
    community: {
      draftFlows: 0,
      latestFlowAt: null,
      publishedFlows: 0,
      recentFlows: [],
      totalFlows: 0,
    },
    files: [],
    memory: {
      drafts: [],
      latestArtifactAt: null,
      pendingRanges: [],
      projectMemory: null,
      projectMemoryArtifact: null,
      recentArtifacts: [],
      totalArtifacts: 0,
    },
    overview: [],
    promptActivities: [],
    project: {
      description: "",
      id: project?.id ?? "",
      isBookmarked: project?.isBookmarked ?? false,
      name: project?.name ?? "Project",
      repositoryStatus: project?.githubUrl
        ? "Repository connected"
        : "Repository not connected",
      repositoryUrl: project?.githubUrl,
      slug: project?.slug,
      tags: project?.tags ?? [],
      visibility: project?.visibility ?? "private",
    },
    repositoryFiles: [],
    repositoryFilesMessage: project?.githubUrl
      ? "GitHub repository files are loading."
      : "This project does not have a GitHub repository remote.",
  };
}

function projectMemoryPendingRangeFromApi(
  range: ProjectMemoryPendingRangeApiResponse,
) {
  return {
    canCheckpoint: range.can_checkpoint,
    endSequence: range.end_sequence,
    eventCount: range.event_count,
    lastEventAt: range.last_event_at
      ? formatOptionalTimestamp(range.last_event_at, "Unknown")
      : null,
    promptCount: range.prompt_count,
    sessionId: range.session_id,
    startSequence: range.start_sequence,
    tool: range.tool,
  };
}

function projectMemoryArtifactStageFromApi(
  value: string | null | undefined,
): ProjectMemoryArtifactStage | null {
  if (
    value === "generated_memory" ||
    value === "memory_draft" ||
    value === "project_memory" ||
    value === "verified_memory"
  ) {
    return value;
  }
  return null;
}

function projectMemoryReviewStateFromApi(
  value: string | null | undefined,
): ProjectMemoryReviewState | null {
  if (
    value === "draft" ||
    value === "edited" ||
    value === "generated" ||
    value === "ignored" ||
    value === "saved" ||
    value === "verified"
  ) {
    return value;
  }
  return null;
}

function projectMemoryScopeFromApi(
  value: string | null | undefined,
): ProjectMemoryScope | null {
  if (
    value === "draft" ||
    value === "generated" ||
    value === "project" ||
    value === "verified"
  ) {
    return value;
  }
  return null;
}

function projectMemoryArtifactFromApi(
  artifact: ProjectMemoryArtifactApiResponse,
) {
  return {
    artifactStage: projectMemoryArtifactStageFromApi(artifact.artifact_stage),
    changedFileCount: artifact.changed_file_count,
    changedFiles: artifact.changed_files ?? [],
    commitSha: artifact.commit_sha ?? null,
    createdAt: artifact.created_at
      ? formatOptionalTimestamp(artifact.created_at, "Unknown")
      : null,
    draftConfidence: artifact.draft_confidence ?? null,
    draftGenerator: artifact.draft_generator ?? null,
    draftType: artifact.draft_type ?? null,
    endSequence: artifact.end_sequence ?? null,
    fallbackReason: artifact.fallback_reason ?? null,
    generator: artifact.generator,
    id: artifact.id,
    memoryScope: projectMemoryScopeFromApi(artifact.memory_scope),
    model: artifact.model,
    needsUserVerification: artifact.needs_user_verification ?? null,
    outcome: artifact.outcome,
    promptCount: artifact.prompt_count ?? null,
    reason: artifact.reason ?? null,
    reviewState: projectMemoryReviewStateFromApi(artifact.review_state),
    requestedGenerator: artifact.requested_generator ?? null,
    sections: artifact.sections ?? [],
    sessionId: artifact.session_id,
    sliceIndex: artifact.slice_index ?? null,
    startSequence: artifact.start_sequence ?? null,
    summary: artifact.summary,
    summaryLevel: artifact.summary_level ?? null,
    suggestedUserAction: artifact.suggested_user_action ?? null,
    tags: artifact.tags,
    technologies: artifact.technologies ?? [],
    title: artifact.title,
    triggerReason: artifact.trigger_reason ?? null,
    updatedAt: artifact.updated_at
      ? formatOptionalTimestamp(artifact.updated_at, "Unknown")
      : null,
    whyItMatters: artifact.why_it_matters ?? artifact.reason ?? null,
    windowReason: artifact.window_reason ?? null,
    versions: (artifact.versions ?? []).map((version) => ({
      changedFileCount: version.changed_file_count,
      changedFiles: version.changed_files ?? [],
      commitSha: version.commit_sha ?? null,
      createdAt: version.created_at
        ? formatOptionalTimestamp(version.created_at, "Unknown")
        : null,
      draftConfidence: null,
      draftGenerator: null,
      draftType: null,
      endSequence: version.end_sequence ?? null,
      fallbackReason: null,
      generator: version.generator,
      id: version.id,
      memoryScope: projectMemoryScopeFromApi(version.memory_scope),
      model: version.model,
      needsUserVerification: null,
      outcome: version.outcome,
      promptCount: version.prompt_count ?? null,
      reason: version.reason ?? null,
      requestedGenerator: null,
      sections: version.sections ?? [],
      sessionId: version.session_id,
      sliceIndex: version.slice_index ?? null,
      startSequence: version.start_sequence ?? null,
      summary: version.summary,
      suggestedUserAction: null,
      tags: version.tags,
      technologies: version.technologies ?? [],
      title: version.title,
      version: version.version,
      windowReason: version.window_reason ?? null,
    })),
  };
}

function projectMemorySnapshotFromApi(
  response: ProjectMemorySnapshotApiResponse,
) {
  const snapshot = response?.snapshot;
  if (!snapshot) {
    return {
      projectMemory: null,
      projectMemoryArtifact: response?.artifact
        ? projectMemoryArtifactFromApi(response.artifact)
        : null,
    };
  }
  const sections = snapshot.sections ?? {};
  return {
    projectMemory: {
      bodyMarkdown: snapshot.body_markdown ?? "",
      confidence: snapshot.confidence ?? null,
      sections: {
        coreWorkflow: sections.core_workflow ?? [],
        currentDirection: sections.current_direction ?? "",
        importantDecisions: (sections.important_decisions ?? []).map((item) => ({
          decision: item.decision,
          reason: item.reason,
          sourceMemoryIds: item.source_memory_ids ?? [],
        })),
        instructionsForFutureAiAgents:
          sections.instructions_for_future_ai_agents ?? [],
        openQuestions: sections.open_questions ?? [],
        productGoal: sections.product_goal ?? "",
        rejectedDirections: (sections.rejected_directions ?? []).map((item) => ({
          direction: item.direction,
          reason: item.reason,
          sourceMemoryIds: item.source_memory_ids ?? [],
        })),
        technicalAssumptions: sections.technical_assumptions ?? [],
      },
      sourceMemoryIds: snapshot.source_memory_ids ?? [],
      warnings: snapshot.warnings ?? [],
    },
    projectMemoryArtifact: response?.artifact
      ? projectMemoryArtifactFromApi(response.artifact)
      : null,
  };
}

export function projectDetailDataFromApi(
  payload: ProjectDetailApiResponse,
  fallbackProject: Project | null,
): ProjectDetailData {
  const models = payload.metrics.connected_models;
  const community = payload.community;
  const memory = payload.memory;
  const memoryDrafts =
    ((memory as (typeof memory & { drafts?: ProjectMemoryArtifactApiResponse[] }) | undefined)
      ?.drafts ?? []);
  const pendingRanges =
    ((memory as
      | (typeof memory & { pending_ranges?: ProjectMemoryPendingRangeApiResponse[] })
      | undefined)?.pending_ranges ?? []);
  const projectMemoryResponse =
    (memory as
      | (typeof memory & { project_memory?: ProjectMemorySnapshotApiResponse })
      | undefined)?.project_memory ?? null;
  const projectMemory = projectMemorySnapshotFromApi(projectMemoryResponse);
  const totalPrompts =
    payload.metrics.total_prompts ?? payload.prompt_activities?.length ?? 0;
  const projectDescription = payload.project.description?.trim() ?? "";
  const repositoryUrl = payload.project.repository_url ?? fallbackProject?.githubUrl;
  const projectUrl = projectDetailUrl(
    payload.project.slug ?? payload.project.id ?? fallbackProject?.id ?? "",
  );

  return {
    activities: payload.activities.map((activity) => ({
      events: activity.events,
      filesChanged: activity.files_changed,
      id: activity.id,
      lastActivity: formatOptionalTimestamp(activity.last_activity_at),
      model: activity.model,
      prompts: activity.prompts,
      responses: activity.responses,
      startedAt: formatOptionalTimestamp(activity.started_at, "Unknown"),
    })),
    promptActivities: (payload.prompt_activities ?? []).map((activity) => ({
      fileChanges: (activity.file_changes ?? []).map((change) => ({
        additions: change.additions,
        binary: change.binary,
        deletions: change.deletions,
        oldPath: change.old_path,
        patch: change.patch,
        patchOmittedReason: change.patch_omitted_reason,
        patchTruncated: change.patch_truncated,
        path: change.path,
        status: change.status,
      })),
      filesChanged: activity.files_changed ?? activity.file_changes?.length ?? 0,
      id: activity.id,
      model: activity.model,
      prompt: activity.prompt,
      promptOriginalLength: activity.prompt_original_length,
      promptStorageLimit: activity.prompt_storage_limit,
      promptTruncated: activity.prompt_truncated,
      response: activity.response,
      responseOriginalLength: activity.response_original_length,
      responseReceivedAt: activity.response_received_at
        ? formatOptionalTimestamp(activity.response_received_at, "Unknown")
        : null,
      responseSource: activity.response_source,
      responseStorageLimit: activity.response_storage_limit,
      responseTruncated: activity.response_truncated,
      sequence: activity.sequence,
      sessionId: activity.session_id,
      submittedAt: formatOptionalTimestamp(activity.submitted_at, "Unknown"),
    })),
    community: {
      draftFlows: community?.draft_flows ?? 0,
      latestFlowAt: community?.latest_flow_at
        ? formatOptionalTimestamp(community.latest_flow_at, "Unknown")
        : null,
      publishedFlows: community?.published_flows ?? 0,
      recentFlows: (community?.recent_flows ?? []).map((flow) => ({
        fileCount: flow.file_count,
        id: flow.id,
        promptCount: flow.prompt_count,
        publishedAt: flow.published_at
          ? formatOptionalTimestamp(flow.published_at, "Unknown")
          : null,
        slug: flow.slug,
        status: flow.status,
        summary: flow.summary,
        title: flow.title,
        updatedAt: flow.updated_at
          ? formatOptionalTimestamp(flow.updated_at, "Unknown")
          : null,
        visibility: flow.visibility,
      })),
      totalFlows: community?.total_flows ?? 0,
    },
    files: payload.files,
    memory: {
      drafts: memoryDrafts.map(projectMemoryArtifactFromApi),
      latestArtifactAt: memory?.latest_artifact_at
        ? formatOptionalTimestamp(memory.latest_artifact_at, "Unknown")
        : null,
      pendingRanges: pendingRanges.map(projectMemoryPendingRangeFromApi),
      projectMemory: projectMemory.projectMemory,
      projectMemoryArtifact: projectMemory.projectMemoryArtifact,
      recentArtifacts: (memory?.recent_artifacts ?? []).map(projectMemoryArtifactFromApi),
      totalArtifacts: memory?.total_artifacts ?? 0,
    },
    overview: [
      {
        title: "Repository URL",
        value: repositoryUrl ?? "Not connected",
        description: repositoryUrl
          ? `Default branch ${payload.project.default_branch}`
          : "Connect a GitHub repository to browse source files.",
        href: repositoryUrl ?? undefined,
      },
      {
        title: "Project URL",
        value: projectUrl,
        description: `${BRAND_NAME} project detail page`,
        href: projectUrl,
      },
      {
        title: "Description",
        value: projectDescription || "Not provided",
      },
      {
        title: "Visibility",
        value: formatLabelValue(payload.project.visibility, "Private"),
      },
      {
        title: "AI Models",
        value: models.length > 0 ? models.join(", ") : "Not captured",
      },
      {
        title: "Activities",
        value: formatCompactNumber(payload.metrics.total_events),
      },
      {
        title: "Sessions",
        value: formatCompactNumber(payload.metrics.total_sessions),
      },
      {
        title: "Sessions Added",
        value: formatSinceYesterdayDelta(payload.metrics.sessions_since_yesterday),
      },
      {
        title: "Prompts",
        value: formatCompactNumber(totalPrompts),
      },
      {
        title: "Prompts Added",
        value: formatSinceYesterdayDelta(payload.metrics.prompts_since_yesterday),
      },
      {
        title: "Files Changed Added",
        value: formatSinceYesterdayDelta(payload.metrics.files_changed_since_yesterday),
      },
      {
        title: "Created",
        value: formatDate(payload.project.created_at),
        description: formatRelativeTimestamp(payload.project.created_at) ?? "Not available",
      },
      {
        title: "Last Activity",
        value: formatDate(payload.metrics.latest_activity_at, "No activity"),
        description:
          formatRelativeTimestamp(payload.metrics.latest_activity_at) ?? "No activity",
      },
      {
        title: "Last Published Prompt",
        value: formatDate(community?.latest_flow_at, "No published prompts"),
        description:
          formatRelativeTimestamp(community?.latest_flow_at) ?? "No published prompts",
      },
      {
        title: "Repository Connected",
        value: repositoryUrl ? "Connected" : "Not connected",
        description: repositoryUrl ? "Connection date not tracked" : "No repository",
      },
    ],
    project: {
      description: projectDescription,
      id: payload.project.id,
      isBookmarked: payload.project.is_bookmarked === true,
      name: payload.project.name || fallbackProject?.name || "Project",
      repositoryStatus: payload.project.repository_status,
      repositoryUrl,
      slug: payload.project.slug ?? fallbackProject?.slug,
      tags: payload.project.tags ?? fallbackProject?.tags ?? [],
      visibility:
        payload.project.visibility === "public" || payload.project.visibility === "private"
          ? payload.project.visibility
          : fallbackProject?.visibility ?? "private",
    },
    repositoryFiles: [],
    repositoryFilesMessage: payload.project.repository_url
      ? "GitHub repository files are loading."
      : "This project does not have a GitHub repository remote.",
  };
}

export function projectGithubFilesFromApi(
  payload: ProjectGithubFilesApiResponse,
): ProjectGithubFilesState {
  return {
    files: payload.files,
    message: payload.message ?? undefined,
    repository: payload.repository ?? undefined,
    status: payload.status,
    truncated: payload.truncated,
  };
}

export function repositoryFileContentFromApi(
  payload: ProjectGithubFileContentApiResponse,
): RepositoryFileContent {
  return {
    branch: payload.branch,
    content: payload.content,
    htmlUrl: payload.html_url,
    message: payload.message,
    name: payload.name,
    path: payload.path,
    repository: payload.repository,
    size: payload.size,
    status: payload.status,
  };
}
