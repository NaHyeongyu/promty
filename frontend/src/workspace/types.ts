import type {
  FileTreeNode,
  PublishedFlowAsset,
  PublishedFlowDetail,
} from "../components/project-detail";

export type SidebarItemId = "projects" | "community" | "admin" | "settings" | "profile";

export type Project = {
  id: string;
  name: string;
  createdTimestamp: string;
  slug?: string;
  tags: string[];
  visibility: "private" | "public";
  latestTimestamp: string;
  latestUpdatedAt: string;
  latestActivityLabel: string;
  sessions: number;
  events: number;
  filesChanged: number;
  prompts: number;
  trackedFiles: number;
  models: string[];
  githubUrl?: string;
  isBookmarked: boolean;
};

export type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
  is_admin?: boolean;
};

export type EventRecord = {
  id: string;
  project_id: string;
  session_id: string;
  sequence: number;
  tool: string;
  event_type: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

export type ProjectSummary = {
  id: string;
  slug?: string;
  name: string;
  git_remote: string | null;
  github_url: string | null;
  is_bookmarked?: boolean;
  default_branch: string;
  created_at: string;
  connected_models: string[];
  tags: string[];
  sessions: number;
  events: number;
  prompts: number;
  tracked_files: number;
  latest_event_at: string | null;
  updated_at: string;
  visibility: "private" | "public";
};

export type ProjectSortMode = "recent" | "added";

export type ProjectDetailApiResponse = {
  activities: Array<{
    events: number;
    files_changed: number;
    id: string;
    last_activity_at: string | null;
    model: string;
    prompts: number;
    responses: number;
    started_at: string | null;
  }>;
  community?: {
    draft_flows: number;
    latest_flow_at: string | null;
    published_flows: number;
    recent_flows: Array<{
      file_count: number;
      id: string;
      prompt_count: number;
      published_at: string | null;
      slug: string;
      status: string;
      summary: string | null;
      title: string;
      updated_at: string | null;
      visibility: string;
    }>;
    total_flows: number;
  };
  memory?: {
    latest_artifact_at: string | null;
    recent_artifacts: Array<{
      artifact_stage?: string | null;
      changed_file_count: number;
      changed_files?: Array<{
        additions?: number | null;
        deletions?: number | null;
        path: string;
        status?: string | null;
      }>;
      commit_sha?: string | null;
      created_at: string | null;
      draft_confidence?: number | null;
      draft_generator?: string | null;
      draft_type?: string | null;
      end_sequence?: number | null;
      fallback_reason?: string | null;
      first_event_at?: string | null;
      generator: string | null;
      id: string;
      last_event_at?: string | null;
      memory_scope?: string | null;
      model: string | null;
      needs_user_verification?: boolean | null;
      outcome: string | null;
      prompt_count?: number | null;
      reason?: string | null;
      review_state?: string | null;
      requested_generator?: string | null;
      sections?: Array<{
        summary: string;
        title: string;
      }>;
      session_id: string | null;
      slice_index?: number | null;
      start_sequence?: number | null;
      summary: string | null;
      summary_level?: number | null;
      suggested_user_action?: string | null;
      tags: string[];
      technologies?: string[];
      title: string;
      trigger_reason?: string | null;
      updated_at: string | null;
      why_it_matters?: string | null;
      window_reason?: string | null;
      versions?: Array<{
        changed_file_count: number;
        changed_files?: Array<{
          additions?: number | null;
          deletions?: number | null;
          path: string;
          status?: string | null;
        }>;
        commit_sha?: string | null;
        created_at: string | null;
        end_sequence?: number | null;
        generator: string | null;
        id: string;
        memory_scope?: string | null;
        model: string | null;
        outcome: string | null;
        prompt_count?: number | null;
        reason?: string | null;
        sections?: Array<{
          summary: string;
          title: string;
        }>;
        session_id: string | null;
        slice_index?: number | null;
        start_sequence?: number | null;
        summary: string | null;
        tags: string[];
        technologies?: string[];
        title: string;
        version: number;
        window_reason?: string | null;
      }>;
    }>;
    total_artifacts: number;
  };
  prompt_activities?: Array<{
    file_changes?: Array<{
      additions: number | null;
      binary?: boolean;
      deletions: number | null;
      old_path?: string | null;
      patch?: string | null;
      patch_omitted_reason?: string | null;
      patch_truncated?: boolean;
      path: string;
      status: string;
    }>;
    files_changed?: number;
    id: string;
    model: string;
    prompt: string;
    prompt_original_length?: number | null;
    prompt_storage_limit?: number | null;
    prompt_truncated?: boolean;
    response?: string | null;
    response_original_length?: number | null;
    response_received_at?: string | null;
    response_source?: string | null;
    response_storage_limit?: number | null;
    response_truncated?: boolean;
    sequence: number;
    session_id: string;
    submitted_at: string | null;
  }>;
  files?: FileTreeNode[];
  metrics: {
    connected_models: string[];
    connected_tools?: string[];
    files_changed_since_yesterday?: number;
    latest_activity_at: string | null;
    last_modified_at: string | null;
    prompts_since_yesterday?: number;
    repository_connected: boolean;
    sessions_since_yesterday?: number;
    total_events: number;
    total_prompts?: number;
    total_sessions: number;
    tracked_files: number;
  };
  project: {
    created_at?: string | null;
    default_branch: string;
    description: string | null;
    id: string;
    is_bookmarked?: boolean;
    name: string;
    repository_status: string;
    repository_url: string | null;
    slug?: string;
    tags?: string[];
    updated_at: string | null;
    visibility?: string | null;
  };
};

export type ProjectPromptActivityApiItem = NonNullable<
  ProjectDetailApiResponse["prompt_activities"]
>[number];

export type ProjectPromptActivitiesApiResponse = {
  cursor: string | null;
  has_more: boolean;
  items: ProjectPromptActivityApiItem[];
  limit: number;
  next_cursor: string | null;
  query: string | null;
  scanned?: number;
  session_id: string | null;
  total: number | null;
};

export type ProjectFilesApiResponse = {
  files: FileTreeNode[];
  limit: number;
  total: number;
  truncated: boolean;
};

export type ProjectMemoryArtifactApiResponse =
  NonNullable<ProjectDetailApiResponse["memory"]>["recent_artifacts"][number];

export type ProjectMemoryPendingRangeApiResponse = {
  can_checkpoint: boolean;
  end_sequence: number;
  event_count: number;
  first_event_at: string | null;
  last_event_at: string | null;
  prompt_count: number;
  session_id: string;
  start_sequence: number;
  tool: string;
};

export type ProjectGithubFilesApiResponse = {
  available: boolean;
  default_branch?: string;
  files: FileTreeNode[];
  message: string | null;
  repository: string | null;
  status: string;
  truncated?: boolean;
};

export type ProjectGithubFileContentApiResponse = {
  available: boolean;
  branch?: string;
  content: string | null;
  html_url?: string | null;
  message: string | null;
  name?: string;
  path?: string;
  repository?: string;
  size?: number | null;
  status: string;
};

export type PublishedFlowSummary = PublishedFlowDetail & {
  author: {
    avatar_url: string | null;
    id: string | null;
    username: string;
  };
  created_at: string | null;
  file_count: number;
  is_owner: boolean;
  metrics: Record<string, unknown>;
  model_name: string | null;
  prompt_count: number;
  published_at: string | null;
  slug: string;
  status: string;
  summary: string | null;
  tags: string[];
  title: string;
  tool_name: string | null;
  updated_at: string | null;
  visibility: string;
};

export type PublishedFlowDetailResponse = PublishedFlowSummary & {
  assets: PublishedFlowAsset[];
  context_summary: string | null;
  end_sequence: number | null;
  files: Array<{
    additions: number;
    change_type: string | null;
    deletions: number;
    diff: string | null;
    file_path: string;
    id: string;
    is_included: boolean;
    language: string | null;
    source_event_id: string | null;
  }>;
  items: Array<{
    files_changed: number;
    id: string;
    is_included: boolean;
    item_order: number;
    model_name: string | null;
    prompt_text: string;
    response_received_at: string | null;
    response_text: string | null;
    sequence: number;
    source_event_id: string | null;
    submitted_at: string | null;
    tool_name: string | null;
  }>;
  notes: string | null;
  source_end_event_id: string | null;
  source_project_id: string | null;
  source_session_id: string | null;
  source_start_event_id: string | null;
  start_sequence: number | null;
};

export type AdminOverview = {
  breakdowns: {
    events_by_tool: Array<{ count: number; key: string }>;
    events_by_type: Array<{ count: number; key: string }>;
    jobs_by_status: Array<{ count: number; key: string }>;
    projects_by_visibility: Array<{ count: number; key: string }>;
  };
  generated_at: string | null;
  metrics: {
    active_collector_tokens: number;
    events: number;
    events_24h: number;
    events_7d: number;
    github_connections: number;
    memory_artifacts: number;
    projects: number;
    prompts: number;
    responses: number;
    sessions: number;
    tracked_files: number;
    users: number;
  };
  recent_events: Array<{
    created_at: string | null;
    event_type: string;
    id: string;
    project_id: string;
    sequence: number;
    session_id: string;
    tool: string;
  }>;
  recent_projects: Array<{
    counts: {
      events: number;
      files: number;
      prompts: number;
      sessions: number;
    };
    default_branch: string;
    github_connected: boolean;
    id: string;
    latest_event_at: string | null;
    name: string;
    owner: {
      id: string;
      username: string;
    };
    slug: string;
    tags: string[];
    updated_at: string | null;
  }>;
  recent_users: Array<{
    created_at: string | null;
    email: string | null;
    github_connected: boolean;
    id: string;
    project_count: number;
    username: string;
  }>;
  risks: Array<{
    detail: string;
    severity: string;
    title: string;
  }>;
  system: {
    admin_configured: boolean;
    app_url: string;
    cors_origins: string[];
    gemini_configured: boolean;
    memory_generators: {
      draft?: string;
      project?: string;
    };
    openai_configured?: boolean;
    published_flows_enabled: boolean;
    session_cookie_secure: boolean;
    session_cookie_samesite: string;
  };
};

export type ProjectGithubFilesState = {
  files: FileTreeNode[];
  message?: string;
  repository?: string;
  status?: string;
  truncated?: boolean;
};

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";
