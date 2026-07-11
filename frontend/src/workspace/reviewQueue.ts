import type {
  Project,
  ProjectMemoryPendingRangeApiResponse,
} from "./types";

export type ReviewQueueSession = {
  canCreateMemory: boolean;
  changedFileCount: number;
  draftCount: number;
  endSequence: number;
  eventCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  promptCount: number;
  responseCount: number;
  sessionId: string;
  startSequence: number;
  tool: string;
};

function normalizedCount(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function timestampValue(value: string | null | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? fallback : timestamp;
}

function earliestTimestamp(
  current: string | null,
  candidate: string | null,
) {
  if (!current) {
    return candidate;
  }
  if (!candidate) {
    return current;
  }
  return timestampValue(candidate, Number.POSITIVE_INFINITY) <
    timestampValue(current, Number.POSITIVE_INFINITY)
    ? candidate
    : current;
}

function latestTimestamp(current: string | null, candidate: string | null) {
  if (!current) {
    return candidate;
  }
  if (!candidate) {
    return current;
  }
  return timestampValue(candidate, Number.NEGATIVE_INFINITY) >
    timestampValue(current, Number.NEGATIVE_INFINITY)
    ? candidate
    : current;
}

export function reviewQueueSessionsFromRanges(
  ranges: ProjectMemoryPendingRangeApiResponse[],
) {
  const sessions = new Map<string, ReviewQueueSession>();

  for (const range of ranges) {
    const current = sessions.get(range.session_id);
    if (!current) {
      sessions.set(range.session_id, {
        canCreateMemory: range.can_checkpoint,
        changedFileCount: normalizedCount(range.changed_file_count),
        draftCount: 1,
        endSequence: range.end_sequence,
        eventCount: normalizedCount(range.event_count),
        firstEventAt: range.first_event_at,
        lastEventAt: range.last_event_at,
        promptCount: normalizedCount(range.prompt_count),
        responseCount: normalizedCount(range.response_count),
        sessionId: range.session_id,
        startSequence: range.start_sequence,
        tool: range.tool,
      });
      continue;
    }

    sessions.set(range.session_id, {
      ...current,
      canCreateMemory: current.canCreateMemory || range.can_checkpoint,
      changedFileCount:
        current.changedFileCount + normalizedCount(range.changed_file_count),
      draftCount: current.draftCount + 1,
      endSequence: Math.max(current.endSequence, range.end_sequence),
      eventCount: current.eventCount + normalizedCount(range.event_count),
      firstEventAt: earliestTimestamp(current.firstEventAt, range.first_event_at),
      lastEventAt: latestTimestamp(current.lastEventAt, range.last_event_at),
      promptCount: current.promptCount + normalizedCount(range.prompt_count),
      responseCount: current.responseCount + normalizedCount(range.response_count),
      startSequence: Math.min(current.startSequence, range.start_sequence),
      tool: current.tool === "unknown" ? range.tool : current.tool,
    });
  }

  return Array.from(sessions.values()).sort((left, right) => {
    const timestampDifference =
      timestampValue(right.lastEventAt, 0) - timestampValue(left.lastEventAt, 0);
    return timestampDifference || right.endSequence - left.endSequence;
  });
}

export function pendingReviewProjects(projects: Project[]) {
  return projects.filter((project) => project.pendingMemoryCount > 0);
}

export function totalPendingReviewCount(projects: Project[]) {
  return pendingReviewProjects(projects).reduce(
    (total, project) => total + project.pendingMemoryCount,
    0,
  );
}
