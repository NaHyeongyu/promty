import { describe, expect, it } from "vitest";
import type { EventRecord } from "../workspace/types";
import { firstMatchingEvent } from "./useFirstEventPolling";

function event(id: string, projectId: string): EventRecord {
  return {
    event_type: "PromptSubmitted",
    id,
    payload: {},
    project_id: projectId,
    sequence: 1,
    session_id: `session-${id}`,
    timestamp: "2026-07-12T00:00:00Z",
    tool: "codex-cli",
  };
}

describe("collector event matching", () => {
  it("ignores traffic from projects that existed before setup", () => {
    const events = [event("existing-latest", "existing"), event("new", "new")];

    expect(
      firstMatchingEvent(events, (candidate) => candidate.project_id !== "existing"),
    )?.toMatchObject({ id: "new", project_id: "new" });
  });

  it("matches only the project targeted by a repair flow", () => {
    const events = [event("other", "other"), event("target", "target")];

    expect(
      firstMatchingEvent(events, (candidate) => candidate.project_id === "target"),
    )?.toMatchObject({ id: "target", project_id: "target" });
  });
});
