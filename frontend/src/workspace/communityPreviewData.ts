import type {
  PublicProfileResponse,
  PublicProjectDetailResponse,
  PublicProjectMemoryArtifactApiResponse,
  PublicProjectOwner,
  PublicProjectPage,
  PublicProjectSummary,
  PublishedFlowDetailResponse,
  PublishedFlowSummary,
} from "./types";

const MINA: PublicProjectOwner = {
  avatar_url: null,
  id: "8d538890-ef6a-4ee0-9cab-72913b6f8964",
  username: "mina.park",
};

const THEO: PublicProjectOwner = {
  avatar_url: null,
  id: "a36c54d5-ced4-43b8-8b67-7c56fbcd8880",
  username: "theo.kim",
};

const PROJECTS: PublicProjectSummary[] = [
  {
    connected_models: ["gpt-5", "claude-sonnet-4"],
    created_at: "2026-06-18T09:00:00Z",
    default_branch: "main",
    description: "A compact workspace for mapping product decisions to reusable AI context.",
    events: 284,
    github_url: "https://github.com/promty-labs/context-atlas",
    id: "18daed8f-14f0-4a3b-a700-fb706faab65c",
    is_owner: false,
    is_saved: false,
    latest_event_at: "2026-07-16T11:42:00Z",
    latest_memory_at: "2026-07-16T11:44:00Z",
    memory_count: 18,
    name: "Context Atlas",
    owner: MINA,
    project_url: "https://example.com/context-atlas",
    prompts: 96,
    sessions: 14,
    slug: "context-atlas",
    tags: ["context", "product", "knowledge"],
    tracked_files: 42,
    updated_at: "2026-07-16T11:44:00Z",
    view_count: 1284,
    visibility: "public",
  },
  {
    connected_models: ["gpt-5"],
    created_at: "2026-07-02T03:20:00Z",
    default_branch: "main",
    description: "Review AI-assisted changes with a clear, human-owned approval trail.",
    events: 172,
    github_url: "https://github.com/promty-labs/agent-review-desk",
    id: "2fc4a1b5-8309-4858-9e44-b01a54d96e5d",
    is_owner: false,
    is_saved: false,
    latest_event_at: "2026-07-15T08:18:00Z",
    latest_memory_at: "2026-07-15T08:21:00Z",
    memory_count: 11,
    name: "Agent Review Desk",
    owner: THEO,
    project_url: null,
    prompts: 64,
    sessions: 9,
    slug: "agent-review-desk",
    tags: ["review", "agents", "security"],
    tracked_files: 31,
    updated_at: "2026-07-15T08:21:00Z",
    view_count: 746,
    visibility: "public",
  },
  {
    connected_models: ["claude-sonnet-4"],
    created_at: "2026-06-27T01:10:00Z",
    default_branch: "main",
    description: "Release readiness signals, rollout notes, and operational memory in one place.",
    events: 139,
    github_url: "https://github.com/promty-labs/release-compass",
    id: "3e5b98db-f8a7-4598-afb2-ece045972aba",
    is_owner: false,
    is_saved: false,
    latest_event_at: "2026-07-14T06:05:00Z",
    latest_memory_at: "2026-07-14T06:08:00Z",
    memory_count: 8,
    name: "Release Compass",
    owner: MINA,
    project_url: "https://example.com/release-compass",
    prompts: 47,
    sessions: 7,
    slug: "release-compass",
    tags: ["release", "operations"],
    tracked_files: 26,
    updated_at: "2026-07-14T06:08:00Z",
    view_count: 512,
    visibility: "public",
  },
  {
    connected_models: ["gpt-5-mini"],
    created_at: "2026-07-08T12:40:00Z",
    default_branch: "main",
    description: "A local-first notebook that turns short working sessions into durable project memory.",
    events: 91,
    github_url: "https://github.com/promty-labs/local-memory-notebook",
    id: "46dcdf43-1da3-4c4f-9516-9f37849058fc",
    is_owner: false,
    is_saved: false,
    latest_event_at: "2026-07-13T04:22:00Z",
    latest_memory_at: "2026-07-13T04:26:00Z",
    memory_count: 6,
    name: "Local Memory Notebook",
    owner: THEO,
    project_url: null,
    prompts: 35,
    sessions: 5,
    slug: "local-memory-notebook",
    tags: ["local-first", "memory"],
    tracked_files: 19,
    updated_at: "2026-07-13T04:26:00Z",
    view_count: 298,
    visibility: "public",
  },
];

function memoryFor(
  project: PublicProjectSummary,
): PublicProjectMemoryArtifactApiResponse {
  return {
    artifact_stage: "verified_memory",
    changed_file_count: 4,
    created_at: project.latest_memory_at,
    first_event_at: project.latest_event_at,
    generator: "promty-memory",
    id: `preview-memory-${project.id}`,
    last_event_at: project.latest_event_at,
    model: project.connected_models[0] ?? null,
    memory_scope: "verified",
    outcome: "The team now has a concise record of the decision and its implementation constraints.",
    prompt_count: project.prompts,
    reason: "Keeps the public implementation context concise and reviewable.",
    review_state: "verified",
    sections: [],
    summary: `Captured the latest architecture decisions and follow-up work for ${project.name}.`,
    tags: project.tags.slice(0, 2),
    technologies: [],
    title: "Latest project memory",
    type: "project_memory",
    updated_at: project.latest_memory_at,
    why_it_matters: "Helps visitors understand the approved implementation decisions.",
  };
}

function historyFor(project: PublicProjectSummary) {
  const end = Date.parse(project.latest_event_at ?? project.updated_at);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(end - (13 - index) * 86_400_000);
    const weight = (index % 4) + 1;
    return {
      date: date.toISOString().slice(0, 10),
      files_changed: Math.max(0, Math.round((project.tracked_files / 30) * weight)),
      memories: index % 5 === 0 ? 1 : 0,
      prompts: Math.max(0, Math.round((project.prompts / 35) * weight)),
      sessions: index % 3 === 0 ? 1 : 0,
    };
  });
}

function viewHistoryFor(project: PublicProjectSummary) {
  const end = Date.parse(project.latest_event_at ?? project.updated_at);
  return Array.from({ length: 14 }, (_, index) => ({
    date: new Date(end - (13 - index) * 86_400_000).toISOString().slice(0, 10),
    views: Math.max(2, Math.round(((project.view_count ?? 0) / 140) * ((index % 5) + 1))),
  }));
}

const DETAILS = new Map<string, PublicProjectDetailResponse>(
  PROJECTS.map((project) => [
    project.id,
    {
      activities: [],
      files: [],
      is_owner: false,
      is_saved: project.is_saved,
      memory: {
        latest_artifact_at: project.latest_memory_at,
        recent_artifacts: [memoryFor(project)],
        total_artifacts: project.memory_count,
      },
      metrics: {
        activity_history: historyFor(project),
        connected_models: project.connected_models,
        connected_tools: ["codex-cli"],
        files_changed_since_yesterday: 2,
        latest_activity_at: project.latest_event_at,
        last_modified_at: project.updated_at,
        memory_artifacts_since_yesterday: 1,
        prompts_since_yesterday: 3,
        repository_connected: Boolean(project.github_url),
        sessions_since_yesterday: 1,
        total_events: project.events,
        total_prompts: project.prompts,
        total_sessions: project.sessions,
        tracked_files: project.tracked_files,
      },
      owner: project.owner,
      project: {
        created_at: project.created_at,
        default_branch: project.default_branch,
        description: project.description,
        id: project.id,
        is_bookmarked: false,
        name: project.name,
        project_url: project.project_url,
        repository_status: project.github_url ? "connected" : "not_connected",
        repository_url: project.github_url,
        slug: project.slug,
        tags: project.tags,
        updated_at: project.updated_at,
        visibility: "public",
      },
      prompt_activities: [],
      unique_viewers: Math.round((project.view_count ?? 0) * 0.71),
      view_count: project.view_count ?? 0,
      view_history: viewHistoryFor(project),
      views_7d: Math.round((project.view_count ?? 0) * 0.18),
    },
  ]),
);

const FLOWS: PublishedFlowDetailResponse[] = [
  {
    assets: [],
    author: MINA,
    context_summary: "A small product team needed a repeatable way to review AI-generated UI changes.",
    created_at: "2026-07-12T02:30:00Z",
    end_sequence: 42,
    file_count: 3,
    files: [
      {
        additions: 86,
        change_type: "modified",
        deletions: 24,
        diff: null,
        file_path: "frontend/src/components/ReviewPanel.tsx",
        id: "51aba941-e910-4f96-a786-d2ca07d99793",
        is_included: true,
        language: "tsx",
        source_event_id: null,
      },
    ],
    id: "64f20905-1da0-4430-b64c-a1f479f1666d",
    is_owner: false,
    items: [
      {
        files_changed: 2,
        id: "77f6a0ea-f74d-4bee-afc3-a366dc49cc14",
        is_included: true,
        item_order: 0,
        model_name: "gpt-5",
        prompt_text: "Simplify the review surface and keep only the decision-critical actions.",
        response_received_at: "2026-07-12T02:34:00Z",
        response_text: "Reduced the control hierarchy, grouped approval actions, and preserved keyboard states.",
        sequence: 38,
        source_event_id: null,
        submitted_at: "2026-07-12T02:31:00Z",
        tool_name: "codex-cli",
      },
      {
        files_changed: 1,
        id: "801f59d5-27bb-4b85-9bf4-f5f715fc8869",
        is_included: true,
        item_order: 1,
        model_name: "gpt-5",
        prompt_text: "Add a focused regression test for the approval path.",
        response_received_at: "2026-07-12T02:42:00Z",
        response_text: "Added an authenticated browser test covering review, approval, and persisted state.",
        sequence: 42,
        source_event_id: null,
        submitted_at: "2026-07-12T02:39:00Z",
        tool_name: "codex-cli",
      },
    ],
    metrics: {},
    model_name: "gpt-5",
    notes: "### Result\n\nThe final surface keeps review context visible while reducing the number of competing actions.",
    prompt_count: 2,
    published_at: "2026-07-12T03:00:00Z",
    slug: "focused-ui-review-loop",
    source_end_event_id: null,
    source_project_id: "18daed8f-14f0-4a3b-a700-fb706faab65c",
    source_session_id: null,
    source_start_event_id: null,
    start_sequence: 38,
    status: "published",
    summary: "A concise workflow for reviewing and validating AI-generated UI changes.",
    tags: ["review", "frontend"],
    title: "Focused UI review loop",
    tool_name: "codex-cli",
    updated_at: "2026-07-12T03:00:00Z",
    visibility: "public",
  },
  {
    assets: [],
    author: THEO,
    context_summary: "A release owner wanted a fast, consistent readiness pass before deployment.",
    created_at: "2026-07-10T07:10:00Z",
    end_sequence: 19,
    file_count: 2,
    files: [],
    id: "954b45ea-c634-4d45-b4e8-ce6bb38cc28f",
    is_owner: false,
    items: [
      {
        files_changed: 2,
        id: "c0918e8f-bf5a-4c42-a97f-b711760d7e40",
        is_included: true,
        item_order: 0,
        model_name: "claude-sonnet-4",
        prompt_text: "Check the release for unresolved migrations, unsafe flags, and missing rollback notes.",
        response_received_at: "2026-07-10T07:16:00Z",
        response_text: "The readiness check found one stale flag and generated a compact rollback checklist.",
        sequence: 19,
        source_event_id: null,
        submitted_at: "2026-07-10T07:11:00Z",
        tool_name: "claude-code",
      },
    ],
    metrics: {},
    model_name: "claude-sonnet-4",
    notes: "Use this pass after CI succeeds and before production approval.",
    prompt_count: 1,
    published_at: "2026-07-10T07:30:00Z",
    slug: "release-readiness-pass",
    source_end_event_id: null,
    source_project_id: "2fc4a1b5-8309-4858-9e44-b01a54d96e5d",
    source_session_id: null,
    source_start_event_id: null,
    start_sequence: 19,
    status: "published",
    summary: "A lightweight release check covering migrations, flags, and rollback readiness.",
    tags: ["release", "safety"],
    title: "Release readiness pass",
    tool_name: "claude-code",
    updated_at: "2026-07-10T07:30:00Z",
    visibility: "public",
  },
];

export function isCommunityPreview() {
  return typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "community";
}

export function previewPublicProjects(options: {
  limit: number;
  offset: number;
  query?: string;
  savedOnly?: boolean;
  sort: "newest" | "popular" | "recent";
}): PublicProjectPage {
  const query = options.query?.trim().toLowerCase() ?? "";
  const filtered = PROJECTS.filter((project) =>
    (!options.savedOnly || project.is_saved) &&
    (!query || [project.name, project.description, project.owner.username, ...project.tags]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query))),
  );
  const sorted = [...filtered].sort((left, right) => {
    if (options.sort === "popular") {
      return (right.weekly_popularity_score ?? right.view_count ?? 0)
        - (left.weekly_popularity_score ?? left.view_count ?? 0);
    }
    return Date.parse(
      options.sort === "newest" ? right.created_at : right.latest_event_at ?? right.updated_at,
    ) - Date.parse(
      options.sort === "newest" ? left.created_at : left.latest_event_at ?? left.updated_at,
    );
  });
  return {
    items: sorted.slice(options.offset, options.offset + options.limit),
    limit: options.limit,
    offset: options.offset,
    total: sorted.length,
  };
}

export function previewPublicProjectDetail(projectId: string) {
  return DETAILS.get(projectId) ?? null;
}

const RECORDED_PREVIEW_VIEWS = new Set<string>();

export function previewRecordPublicProjectView(projectId: string) {
  const project = PROJECTS.find((item) => item.id === projectId);
  const detail = DETAILS.get(projectId);
  if (!project || !detail) return null;
  const recorded = !RECORDED_PREVIEW_VIEWS.has(projectId);
  if (recorded) {
    RECORDED_PREVIEW_VIEWS.add(projectId);
    project.view_count = (project.view_count ?? 0) + 1;
    detail.view_count = (detail.view_count ?? 0) + 1;
    detail.views_7d = (detail.views_7d ?? 0) + 1;
    const latest = detail.view_history?.at(-1);
    if (latest) latest.views += 1;
  }
  return {
    project_id: projectId,
    recorded,
    unique_viewers: detail.unique_viewers ?? 0,
    view_count: detail.view_count ?? 0,
    view_history: detail.view_history ?? [],
    views_7d: detail.views_7d ?? 0,
  };
}

export function previewPublicProfile(
  userId: string,
  options: { limit: number; offset: number },
): PublicProfileResponse | null {
  const profile = [MINA, THEO].find((owner) => owner.id === userId);
  if (!profile) return null;
  const projects = PROJECTS.filter((project) => project.owner.id === userId);
  return {
    items: projects.slice(options.offset, options.offset + options.limit),
    limit: options.limit,
    offset: options.offset,
    profile,
    total: projects.length,
  };
}

export function previewPublishedFlows(
  query = "",
  projectId?: string,
): PublishedFlowSummary[] {
  const normalized = query.trim().toLowerCase();
  return FLOWS.filter((flow) =>
    (!projectId || flow.source_project_id === projectId) &&
    (!normalized || [flow.title, flow.summary, flow.author.username, ...flow.tags]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalized))),
  );
}

export function previewUpdatePublicProjectSave(projectId: string, isSaved: boolean) {
  const project = PROJECTS.find((item) => item.id === projectId);
  if (!project) return null;
  project.is_saved = isSaved;
  const detail = DETAILS.get(projectId);
  if (detail) detail.is_saved = isSaved;
  return { is_saved: isSaved, project_id: projectId };
}

export function previewPublishedFlowDetail(flowKey: string) {
  return FLOWS.find((flow) => flow.slug === flowKey) ?? null;
}

export function previewPublishedFlowDetailsForProject(projectId: string) {
  return FLOWS.filter((flow) => flow.source_project_id === projectId);
}
