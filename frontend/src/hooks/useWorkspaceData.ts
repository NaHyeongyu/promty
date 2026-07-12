import { useMemo, useState } from "react";
import { UnauthorizedError } from "../api/client";
import { fetchWorkspaceEvents } from "../api/events";
import { projectsFromEvents } from "../workspace/projectList";
import type { EventRecord, ProjectSummary } from "../workspace/types";

type UseWorkspaceDataOptions = {
  onAuthenticated: () => void;
  onLoadError: () => void;
  onUnauthorized: () => void;
};

export function useWorkspaceData({
  onAuthenticated,
  onLoadError,
  onUnauthorized,
}: UseWorkspaceDataOptions) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [hasLoadedWorkspaceData, setHasLoadedWorkspaceData] = useState(false);
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const projects = useMemo(
    () => projectsFromEvents(events, projectSummaries),
    [events, projectSummaries],
  );

  const clearWorkspaceData = () => {
    setEvents([]);
    setProjectSummaries([]);
    setHasLoadedWorkspaceData(false);
  };

  const mergeProjectSummary = (updatedProject: ProjectSummary) => {
    setProjectSummaries((currentProjects) => {
      const nextProjects = currentProjects.map((project) =>
        project.id === updatedProject.id ? updatedProject : project,
      );
      return nextProjects.some((project) => project.id === updatedProject.id)
        ? nextProjects
        : [updatedProject, ...currentProjects];
    });
  };

  const replaceProjectSummaries = (updatedProjects: ProjectSummary[]) => {
    setProjectSummaries(updatedProjects);
  };

  const loadEvents = async () => {
    setIsEventsLoading(true);
    setHasLoadedWorkspaceData(false);
    setErrorMessage(null);
    try {
      const payload = await fetchWorkspaceEvents();
      setEvents(payload.events);
      setProjectSummaries(payload.projects);
      setHasLoadedWorkspaceData(true);
      onAuthenticated();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        clearWorkspaceData();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Events request failed");
      setHasLoadedWorkspaceData(true);
      onLoadError();
    } finally {
      setIsEventsLoading(false);
    }
  };

  return {
    clearWorkspaceData,
    errorMessage,
    hasLoadedWorkspaceData,
    isEventsLoading,
    loadEvents,
    mergeProjectSummary,
    projects,
    replaceProjectSummaries,
    setErrorMessage,
  };
}
