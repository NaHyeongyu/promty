import { describe, expect, it } from "vitest";
import {
  pendingReviewProjectCount,
  pendingReviewProjects,
  reviewQueueProjectBatch,
  reviewQueueSessionsFromRanges,
  totalPendingRangeCount,
} from "./reviewQueue";
import type {
  Project,
  ProjectMemoryPendingRangeApiResponse,
} from "./types";

function pendingRange(
  overrides: Partial<ProjectMemoryPendingRangeApiResponse> = {},
): ProjectMemoryPendingRangeApiResponse {
  return {
    can_checkpoint: true,
    changed_file_count: 2,
    draft_id: "draft-1",
    end_sequence: 20,
    event_count: 4,
    file_change_event_count: 1,
    first_event_at: "2026-07-10T09:00:00Z",
    last_event_at: "2026-07-10T09:30:00Z",
    prompt_count: 1,
    response_count: 1,
    session_id: "session-1",
    start_sequence: 10,
    tool: "codex",
    ...overrides,
  };
}

function project(id: string, pendingMemoryCount: number): Project {
  return {
    createdTimestamp: "2026-07-10T08:00:00Z",
    events: 0,
    filesChanged: 0,
    id,
    isBookmarked: false,
    latestActivityLabel: "today",
    latestTimestamp: "2026-07-10T09:30:00Z",
    latestUpdatedAt: "Jul 10, 2026",
    memoryCount: 0,
    memoryGroupingMode: "session",
    models: [],
    name: id,
    pendingMemoryCount,
    prompts: 0,
    sessions: 0,
    tags: [],
    trackedFiles: 0,
    visibility: "private",
  };
}

describe("review queue", () => {
  it("groups pending ranges by source session", () => {
    const sessions = reviewQueueSessionsFromRanges([
      pendingRange(),
      pendingRange({
        changed_file_count: 3,
        draft_id: "draft-2",
        end_sequence: 40,
        event_count: 6,
        first_event_at: "2026-07-10T09:31:00Z",
        last_event_at: "2026-07-10T10:00:00Z",
        prompt_count: 2,
        start_sequence: 21,
      }),
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      changedFileCount: 5,
      draftCount: 2,
      endSequence: 40,
      eventCount: 10,
      firstEventAt: "2026-07-10T09:00:00Z",
      lastEventAt: "2026-07-10T10:00:00Z",
      promptCount: 3,
      sessionId: "session-1",
      startSequence: 10,
    });
  });

  it("orders sessions by their latest captured work", () => {
    const sessions = reviewQueueSessionsFromRanges([
      pendingRange(),
      pendingRange({
        draft_id: "draft-2",
        last_event_at: "2026-07-11T10:00:00Z",
        session_id: "session-2",
      }),
    ]);

    expect(sessions.map((session) => session.sessionId)).toEqual([
      "session-2",
      "session-1",
    ]);
  });

  it("counts pending projects separately from captured ranges", () => {
    const projects = [project("alpha", 0), project("beta", 2), project("gamma", 5)];

    expect(pendingReviewProjects(projects).map((item) => item.id)).toEqual([
      "beta",
      "gamma",
    ]);
    expect(pendingReviewProjectCount(projects)).toBe(2);
    expect(totalPendingRangeCount(projects)).toBe(7);
  });

  it("builds one project batch from every captured memory chunk", () => {
    const sessions = reviewQueueSessionsFromRanges([
      pendingRange(),
      pendingRange({
        changed_file_count: 3,
        draft_id: "draft-2",
        prompt_count: 2,
        session_id: "session-2",
      }),
      pendingRange({
        can_checkpoint: false,
        changed_file_count: 8,
        draft_id: "draft-3",
        prompt_count: 4,
        session_id: "session-3",
      }),
    ]);

    expect(reviewQueueProjectBatch(sessions)).toEqual({
      changedFileCount: 13,
      promptCount: 7,
      rangeCount: 3,
      sessionIds: ["session-1", "session-2", "session-3"],
    });
  });

  it("makes a project batch available from its first captured chunk", () => {
    const sessions = reviewQueueSessionsFromRanges([
      pendingRange({ can_checkpoint: false }),
    ]);

    expect(reviewQueueProjectBatch(sessions).sessionIds).toEqual(["session-1"]);
  });
});
