from __future__ import annotations

from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict

from app.schemas.account import CollectorTokenResponse


class StrictResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")


T = TypeVar("T")


class AdminPageResponse(StrictResponse, Generic[T]):
    items: list[T]
    limit: int
    offset: int
    total: int


class AdminOwnerResponse(StrictResponse):
    id: str
    username: str


class AdminUserCountsResponse(StrictResponse):
    events: int
    projects: int
    prompts: int
    sessions: int


class AdminUserGithubResponse(StrictResponse):
    connected: bool
    scopes: list[str]
    updated_at: str | None


class AdminUserResponse(StrictResponse):
    active_collector_tokens: int
    avatar_url: str | None
    collector_tokens: list[CollectorTokenResponse]
    counts: AdminUserCountsResponse
    created_at: str | None
    email: str | None
    github: AdminUserGithubResponse
    github_id: str
    id: str
    is_admin: bool
    last_collector_at: str | None
    latest_activity_at: str | None
    status: Literal["active", "suspended"]
    suspended_at: str | None
    suspension_reason: str | None
    username: str


class AdminProjectResponse(StrictResponse):
    active_jobs: int
    created_at: str | None
    default_branch: str
    description: str | None
    event_count: int
    failed_jobs: int
    github_connected: bool
    github_url: str | None
    id: str
    latest_activity_at: str | None
    latest_memory_at: str | None
    memory_count: int
    name: str
    owner: AdminOwnerResponse
    project_url: str | None
    prompt_count: int
    slug: str
    tags: list[str]
    updated_at: str | None
    visibility: Literal["private", "public"]


class AdminProjectMutationResponse(StrictResponse):
    created_at: str | None
    default_branch: str
    description: str | None
    github_url: str | None
    id: str
    name: str
    owner: AdminOwnerResponse
    project_url: str | None
    slug: str
    tags: list[str]
    updated_at: str | None
    visibility: Literal["private", "public"]


class AdminProjectReferenceResponse(StrictResponse):
    id: str
    name: str
    slug: str


class AdminJobResponse(StrictResponse):
    attempt_count: int
    cancellable: bool
    completed_at: str | None
    created_at: str | None
    error: str | None
    error_code: str | None
    generator: str
    id: str
    lease_expires_at: str | None
    owner: AdminOwnerResponse
    project: AdminProjectReferenceResponse
    reason: str
    result_status: str | None
    retryable: bool
    session_id: str | None
    stale: bool
    status: Literal["pending", "running", "succeeded", "failed", "superseded"]
    updated_at: str | None


class AdminEventResponse(StrictResponse):
    created_at: str | None
    event_type: str
    id: str
    owner: AdminOwnerResponse
    payload: dict[str, Any]
    project: AdminProjectReferenceResponse
    schema_version: int
    sequence: int
    session_id: str
    tool: str


class AdminEventPageResponse(AdminPageResponse[AdminEventResponse]):
    search_truncated: bool


class AdminAuditActorResponse(StrictResponse):
    github_id: str
    id: str | None
    username: str


class AdminAuditLogResponse(StrictResponse):
    action: str
    actor: AdminAuditActorResponse
    created_at: str | None
    id: str
    request_method: str
    request_path: str
    resource_id: str | None
    resource_type: str | None
    status_code: int


class AdminDatabaseTableSizeResponse(StrictResponse):
    name: str
    size_bytes: int


class AdminDatabaseResponse(StrictResponse):
    connections: dict[str, int]
    dialect: str
    migration: str | None
    pool: str
    size_bytes: int | None
    table_sizes: list[AdminDatabaseTableSizeResponse]


class AdminDeploymentResponse(StrictResponse):
    environment: str
    region: str | None
    release_sha: str | None


class AdminProviderResponse(StrictResponse):
    configured: bool
    model: str


class AdminProvidersResponse(StrictResponse):
    gemini: AdminProviderResponse
    openai: AdminProviderResponse
    real_billing_available: bool


class AdminRuntimeResponse(StrictResponse):
    api_url: str
    app_url: str
    platform: str
    python: str
    started_at: str | None
    uptime_seconds: int


class AdminWorkerResponse(StrictResponse):
    pending_batches: int
    running_batches: int
    status: str


class AdminSystemResponse(StrictResponse):
    database: AdminDatabaseResponse
    deployment: AdminDeploymentResponse
    providers: AdminProvidersResponse
    runtime: AdminRuntimeResponse
    worker: AdminWorkerResponse


class AdminSuspendUserResponse(StrictResponse):
    status: Literal["suspended"]
    suspended_at: str | None
    suspension_reason: str
    user_id: str


class AdminRestoreUserResponse(StrictResponse):
    status: Literal["active"]
    user_id: str


class AdminDeleteCountsResponse(StrictResponse):
    collector_tokens: int
    projects: int


class AdminDeleteUserResponse(StrictResponse):
    counts: AdminDeleteCountsResponse
    user_id: str
    username: str


class AdminDeleteProjectCountsResponse(StrictResponse):
    artifacts: int
    events: int
    sessions: int


class AdminDeleteProjectResponse(StrictResponse):
    counts: AdminDeleteProjectCountsResponse
    name: str
    project_id: str
    slug: str


class AdminCancelJobResponse(StrictResponse):
    batch_id: str
    external_call_may_complete: bool
    retryable: bool
    status: Literal["cancelled"]


class AdminRetryJobResponse(StrictResponse):
    batch_id: str
    status: Literal["pending"]


class AdminRevokeAllTokensResponse(StrictResponse):
    revoked: int
    user_id: str


class AdminDisconnectGithubResponse(StrictResponse):
    disconnected: bool
    user_id: str


class AdminActionItemResponse(StrictResponse):
    area: str
    count: int | None
    detail: str
    severity: str
    title: str


class AdminSessionGapProjectResponse(StrictResponse):
    id: str
    name: str


class AdminSessionGapResponse(StrictResponse):
    latest_event_at: str | None
    missing_responses: int
    project: AdminSessionGapProjectResponse
    prompts: int
    responses: int
    session_id: str
    tool: str | None
    user: AdminOwnerResponse


class AdminAiActivityResponse(StrictResponse):
    prompts_24h: int
    response_gap: int
    response_gap_24h: int
    responses_24h: int
    session_gaps: list[AdminSessionGapResponse]


class AdminBreakdownItemResponse(StrictResponse):
    count: int
    key: str


class AdminBreakdownsResponse(StrictResponse):
    events_by_tool: list[AdminBreakdownItemResponse]
    events_by_type: list[AdminBreakdownItemResponse]
    jobs_by_status: list[AdminBreakdownItemResponse]
    projects_by_visibility: list[AdminBreakdownItemResponse]


class AdminOverviewMetricsResponse(StrictResponse):
    active_collector_tokens: int
    events: int
    events_24h: int
    events_7d: int
    failed_jobs: int
    github_connections: int
    memory_artifacts: int
    memory_artifacts_24h: int
    pending_jobs: int
    pending_memory_drafts: int
    projects: int
    projects_without_activity: int
    projects_without_repo: int
    prompts: int
    prompts_24h: int
    responses: int
    responses_24h: int
    running_jobs: int
    sessions: int
    stale_jobs: int
    tracked_files: int
    users: int


class AdminRecentArtifactResponse(StrictResponse):
    changed_file_count: int
    created_at: str | None
    id: str
    project: AdminSessionGapProjectResponse
    summary: str | None
    title: str
    updated_at: str | None


class AdminMemoryMonitorResponse(StrictResponse):
    failed_jobs: int
    pending_drafts: int
    pending_projects: int
    recent_artifacts: list[AdminRecentArtifactResponse]
    stale_jobs: int
    summaries_24h: int
    total_summaries: int


class AdminProjectMonitorResponse(StrictResponse):
    without_activity: int
    without_repo: int


class AdminRecentEventResponse(StrictResponse):
    created_at: str | None
    event_type: str
    id: str
    project_id: str
    sequence: int
    session_id: str
    tool: str


class AdminRecentProjectCountsResponse(StrictResponse):
    events: int
    files: int
    memory: int
    prompts: int
    sessions: int


class AdminRecentProjectResponse(StrictResponse):
    counts: AdminRecentProjectCountsResponse
    default_branch: str
    failed_jobs: int
    github_connected: bool
    id: str
    latest_event_at: str | None
    latest_memory_at: str | None
    name: str
    owner: AdminOwnerResponse
    slug: str
    tags: list[str]
    updated_at: str | None


class AdminRecentUserResponse(StrictResponse):
    created_at: str | None
    email: str | None
    event_count: int
    github_connected: bool
    id: str
    latest_activity_at: str | None
    prompt_count: int
    project_count: int
    session_count: int
    username: str


class AdminRiskResponse(StrictResponse):
    detail: str
    severity: str
    title: str


class AdminRateLimitResponse(StrictResponse):
    requests: int
    window_seconds: int


class AdminMemoryGeneratorsResponse(StrictResponse):
    draft: str
    project: str


class AdminOverviewSystemResponse(StrictResponse):
    admin_audit_retention_days: int
    admin_configured: bool
    admin_rate_limit: AdminRateLimitResponse
    app_url: str
    auth_rate_limit: AdminRateLimitResponse
    cors_origins: list[str]
    gemini_configured: bool
    memory_generators: AdminMemoryGeneratorsResponse
    openai_configured: bool
    published_flows_enabled: bool
    session_cookie_secure: bool
    session_cookie_samesite: str


class AdminOverviewResponse(StrictResponse):
    action_items: list[AdminActionItemResponse]
    ai_activity: AdminAiActivityResponse
    breakdowns: AdminBreakdownsResponse
    generated_at: str | None
    memory_monitor: AdminMemoryMonitorResponse
    metrics: AdminOverviewMetricsResponse
    project_monitor: AdminProjectMonitorResponse
    recent_admin_audit_logs: list[AdminAuditLogResponse]
    recent_events: list[AdminRecentEventResponse]
    recent_projects: list[AdminRecentProjectResponse]
    recent_users: list[AdminRecentUserResponse]
    risks: list[AdminRiskResponse]
    system: AdminOverviewSystemResponse
