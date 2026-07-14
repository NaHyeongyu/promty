import {
  formatRelativeTimestamp,
  formatTimestamp,
} from "../lib/formatters";
import type { EventRecord, Project, ProjectSummary } from "./types";

function getStringPayloadValue(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function basename(pathValue: string | null) {
  if (!pathValue) {
    return null;
  }
  const normalized = pathValue.replace(/\/+$/, "");
  const name = normalized.split("/").filter(Boolean).pop();
  return name ?? null;
}

function projectNameFromEvent(event: EventRecord) {
  return (
    basename(getStringPayloadValue(event.payload, "git_root")) ??
    basename(getStringPayloadValue(event.payload, "cwd")) ??
    `Project ${event.project_id.slice(0, 8)}`
  );
}

const TOOL_MODEL_NAMES = new Set([
  "claude code",
  "claude-code",
  "codex",
  "codex-cli",
  "cursor",
  "gemini cli",
  "gemini-cli",
]);

function normalizeModelName(value: string | null) {
  if (!value) {
    return null;
  }
  return TOOL_MODEL_NAMES.has(value.toLowerCase()) ? null : value;
}

function modelNameFromEvent(event: EventRecord) {
  const model = getStringPayloadValue(event.payload, "model");
  return normalizeModelName(model);
}

export function normalizeGithubUrl(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`;
  }

  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return trimmed.startsWith("https://github.com/") ? trimmed : null;
}

function githubUrlFromEvent(event: EventRecord) {
  return normalizeGithubUrl(
    getStringPayloadValue(event.payload, "github_url") ??
      getStringPayloadValue(event.payload, "git_remote"),
  );
}

export function projectsFromEvents(
  events: EventRecord[],
  summaries: ProjectSummary[],
): Project[] {
  const grouped = new Map<
    string,
    {
      createdTimestamp: string;
      defaultBranch?: string;
      events: number;
      filesChanged: number;
      githubUrl: string | null;
      isBookmarked: boolean;
      latestTimestamp: string;
      latestMemoryAt?: string;
      memoryCount: number;
      models: Set<string>;
      name: string;
      summaryEventCount?: number;
      summaryPromptCount?: number;
      summarySessionCount?: number;
      summaryTrackedFiles?: number;
      prompts: number;
      pendingMemoryCount: number;
      projectUrl?: string;
      sessions: Set<string>;
      slug?: string;
      tags: string[];
      visibility: "private" | "public";
    }
  >();

  for (const summary of summaries) {
    grouped.set(summary.id, {
      createdTimestamp: summary.created_at,
      defaultBranch: summary.default_branch,
      events: 0,
      filesChanged: 0,
      githubUrl: normalizeGithubUrl(summary.github_url ?? summary.git_remote),
      isBookmarked: summary.is_bookmarked === true,
      latestTimestamp: summary.latest_event_at ?? summary.updated_at,
      latestMemoryAt: summary.latest_memory_at ?? undefined,
      memoryCount: summary.memory_count ?? 0,
      models: new Set<string>(summary.connected_models ?? []),
      name: summary.name,
      summaryEventCount: summary.events,
      summaryPromptCount: summary.prompts,
      summarySessionCount: summary.sessions,
      summaryTrackedFiles: summary.tracked_files,
      prompts: 0,
      pendingMemoryCount: summary.pending_memory_count ?? 0,
      projectUrl: summary.project_url ?? undefined,
      sessions: new Set<string>(),
      slug: summary.slug,
      tags: summary.tags ?? [],
      visibility: summary.visibility === "public" ? "public" : "private",
    });
  }

  for (const event of events) {
    const existing = grouped.get(event.project_id);
    const current =
      existing ??
      {
        createdTimestamp: event.timestamp,
        events: 0,
        filesChanged: 0,
        githubUrl: githubUrlFromEvent(event),
        isBookmarked: false,
        latestTimestamp: event.timestamp,
        memoryCount: 0,
        models: new Set<string>(),
        name: projectNameFromEvent(event),
        prompts: 0,
        pendingMemoryCount: 0,
        sessions: new Set<string>(),
        tags: [],
        visibility: "private",
      };

    current.events += 1;
    current.sessions.add(event.session_id);
    const modelName = modelNameFromEvent(event);
    if (modelName) {
      current.models.add(modelName);
    }
    current.githubUrl = current.githubUrl ?? githubUrlFromEvent(event);
    if (event.event_type === "FilesChanged") {
      const files = event.payload.files;
      current.filesChanged += Array.isArray(files) ? files.length : 1;
    }
    if (event.event_type === "PromptSubmitted") {
      current.prompts += 1;
    }
    if (new Date(event.timestamp) > new Date(current.latestTimestamp)) {
      current.latestTimestamp = event.timestamp;
      current.name = projectNameFromEvent(event);
    }

    grouped.set(event.project_id, current);
  }

  return Array.from(grouped, ([id, value]) => ({
    id,
    defaultBranch: value.defaultBranch,
    name: value.name,
    createdTimestamp: value.createdTimestamp,
    slug: value.slug ?? id,
    latestTimestamp: value.latestTimestamp,
    latestUpdatedAt: formatTimestamp(value.latestTimestamp),
    latestActivityLabel:
      formatRelativeTimestamp(value.latestTimestamp) ?? formatTimestamp(value.latestTimestamp),
    sessions: value.summarySessionCount ?? value.sessions.size,
    events: value.summaryEventCount ?? value.events,
    filesChanged: value.filesChanged,
    prompts: value.summaryPromptCount ?? value.prompts,
    trackedFiles: value.summaryTrackedFiles ?? value.filesChanged,
    models: Array.from(value.models).sort(),
    githubUrl: value.githubUrl ?? undefined,
    isBookmarked: value.isBookmarked,
    latestMemoryAt: value.latestMemoryAt,
    memoryCount: value.memoryCount,
    pendingMemoryCount: value.pendingMemoryCount,
    projectUrl: value.projectUrl,
    tags: value.tags,
    visibility: value.visibility,
  })).sort(
    (left, right) =>
      new Date(right.latestTimestamp).getTime() -
      new Date(left.latestTimestamp).getTime(),
  );
}
