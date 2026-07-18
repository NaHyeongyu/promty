import { useMemo, useState } from "react";
import { UnauthorizedError } from "../api/client";
import { fetchProjectSummaries } from "../api/projects";
import { projectsFromEvents } from "../workspace/projectList";
import type { ProjectSummary } from "../workspace/types";

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
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [hasLoadedWorkspaceData, setHasLoadedWorkspaceData] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const projects = useMemo(
    () => projectsFromEvents([], projectSummaries),
    [projectSummaries],
  );

  const clearWorkspaceData = () => {
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

  const removeProject = (projectId: string) => {
    setProjectSummaries((currentProjects) =>
      currentProjects.filter((project) => project.id !== projectId),
    );
  };

  const replaceProjectSummaries = (updatedProjects: ProjectSummary[]) => {
    setProjectSummaries(updatedProjects);
  };

  const loadWorkspace = async () => {
    setIsWorkspaceLoading(true);
    setHasLoadedWorkspaceData(false);
    setErrorMessage(null);
    try {
      const projects = await fetchProjectSummaries();
      setProjectSummaries(projects);
      setHasLoadedWorkspaceData(true);
      onAuthenticated();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        clearWorkspaceData();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Projects request failed");
      setHasLoadedWorkspaceData(true);
      onLoadError();
    } finally {
      setIsWorkspaceLoading(false);
    }
  };

  return {
    clearWorkspaceData,
    errorMessage,
    hasLoadedWorkspaceData,
    isWorkspaceLoading,
    loadWorkspace,
    mergeProjectSummary,
    projects,
    removeProject,
    replaceProjectSummaries,
    setErrorMessage,
  };
}
