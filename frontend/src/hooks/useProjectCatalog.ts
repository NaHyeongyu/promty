import { useMemo, useState } from "react";
import type { ProjectHeaderProjectOption } from "../components/project-detail";
import { figmaMockProjects } from "../workspace/figmaPreviewData";
import type { Project, ProjectSortMode } from "../workspace/types";

type UseProjectCatalogOptions = {
  previewEmptyProjects: boolean;
  previewGithubUnlinkedProject: boolean;
  projects: Project[];
  repositoryConnectorProjectId: string | null;
  selectedProjectId: string | null;
};

export function useProjectCatalog({
  previewEmptyProjects,
  previewGithubUnlinkedProject,
  projects,
  repositoryConnectorProjectId,
  selectedProjectId,
}: UseProjectCatalogOptions) {
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [projectSortMode, setProjectSortMode] = useState<ProjectSortMode>("recent");
  const projectCatalog = useMemo(() => {
    if (!previewGithubUnlinkedProject) {
      return projects;
    }

    const mockProjects = figmaMockProjects();
    const mockProjectIds = new Set(mockProjects.map((project) => project.id));
    return [
      ...mockProjects,
      ...projects.filter((project) => !mockProjectIds.has(project.id)),
    ];
  }, [previewGithubUnlinkedProject, projects]);
  const displayProjects = previewEmptyProjects ? [] : projectCatalog;
  const bookmarkedProjects = useMemo(
    () =>
      projectCatalog
        .filter((project) => project.isBookmarked)
        .sort(
          (left, right) =>
            new Date(right.latestTimestamp).getTime() -
            new Date(left.latestTimestamp).getTime(),
        ),
    [projectCatalog],
  );
  const sidebarBookmarkedProjects = bookmarkedProjects.slice(0, 6);
  const visibleProjects = useMemo(() => {
    const query = projectSearchQuery.trim().toLowerCase();
    const filteredProjects = query
      ? displayProjects.filter((project) => project.name.toLowerCase().includes(query))
      : displayProjects;

    return [...filteredProjects].sort((left, right) => {
      const leftTimestamp =
        projectSortMode === "added" ? left.createdTimestamp : left.latestTimestamp;
      const rightTimestamp =
        projectSortMode === "added" ? right.createdTimestamp : right.latestTimestamp;
      return new Date(rightTimestamp).getTime() - new Date(leftTimestamp).getTime();
    });
  }, [displayProjects, projectSearchQuery, projectSortMode]);
  const projectHeaderOptions = useMemo<ProjectHeaderProjectOption[]>(
    () =>
      projectCatalog.map((project) => ({
        id: project.id,
        latestUpdatedAt: project.latestUpdatedAt,
        name: project.name,
      })),
    [projectCatalog],
  );
  const selectedProject =
    projectCatalog.find((project) => project.id === selectedProjectId) ?? null;
  const repositoryConnectorProject =
    projectCatalog.find((project) => project.id === repositoryConnectorProjectId) ??
    null;

  return {
    bookmarkedProjects,
    displayProjects,
    projectCatalog,
    projectHeaderOptions,
    projectSearchQuery,
    projectSortMode,
    repositoryConnectorProject,
    selectedProject,
    setProjectSearchQuery,
    setProjectSortMode,
    sidebarBookmarkedProjects,
    visibleProjects,
  };
}
