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

function filterAndSortProjects(
  projects: Project[],
  query: string,
  sortMode: ProjectSortMode,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProjects = normalizedQuery
    ? projects.filter((project) =>
        project.name.toLowerCase().includes(normalizedQuery),
      )
    : projects;

  return [...filteredProjects].sort((left, right) => {
    const leftTimestamp =
      sortMode === "added" ? left.createdTimestamp : left.latestTimestamp;
    const rightTimestamp =
      sortMode === "added" ? right.createdTimestamp : right.latestTimestamp;
    return new Date(rightTimestamp).getTime() - new Date(leftTimestamp).getTime();
  });
}

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
  const visibleProjects = useMemo(
    () =>
      filterAndSortProjects(displayProjects, projectSearchQuery, projectSortMode),
    [displayProjects, projectSearchQuery, projectSortMode],
  );
  const visibleBookmarkedProjects = useMemo(
    () =>
      filterAndSortProjects(
        bookmarkedProjects,
        projectSearchQuery,
        projectSortMode,
      ),
    [bookmarkedProjects, projectSearchQuery, projectSortMode],
  );
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
