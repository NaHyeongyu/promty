import type { EventRecord, ProjectSummary } from "../workspace/types";
import { requestJson } from "./client";

export type WorkspaceEventsResponse = {
  events: EventRecord[];
  projects: ProjectSummary[];
};

export async function fetchWorkspaceEvents(): Promise<WorkspaceEventsResponse> {
  const events = await requestJson<EventRecord[]>("/api/events?limit=500", {}, {
    errorMessage: "Events request failed",
  });
  const projects = await requestJson<ProjectSummary[]>("/api/projects", {}, {
    errorMessage: "Projects request failed",
  });

  return { events, projects };
}
