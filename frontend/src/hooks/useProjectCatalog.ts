import { useMemo, useState } from "react";
import type { ProjectHeaderProjectOption } from "../components/project-detail";
import { mockGithubUnlinkedProject } from "../workspace/previewData";
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

    const mockProject = mockGithubUnlinkedProject();
    return [
      mockProject,
      ...projects.filter((project) => project.id !== mockProject.id),
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
  const sortAndFilterProjects = (sourceProjects: Project[]) => {
    const query = projectSearchQuery.trim().toLowerCase();
    const filteredProjects = query
      ? sourceProjects.filter((project) => project.name.toLowerCase().includes(query))
      : sourceProjects;

    return [...filteredProjects].sort((left, right) => {
      const leftTimestamp =
        projectSortMode === "added" ? left.createdTimestamp : left.latestTimestamp;
      const rightTimestamp =
        projectSortMode === "added" ? right.createdTimestamp : right.latestTimestamp;
      return new Date(rightTimestamp).getTime() - new Date(leftTimestamp).getTime();
    });
  };
  const visibleProjects = useMemo(() => {
    return sortAndFilterProjects(displayProjects);
  }, [displayProjects, projectSearchQuery, projectSortMode]);
  const visibleBookmarkedProjects = useMemo(() => {
    return sortAndFilterProjects(bookmarkedProjects);
  }, [bookmarkedProjects, projectSearchQuery, projectSortMode]);
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
    visibleBookmarkedProjects,
    visibleProjects,
  };
}
