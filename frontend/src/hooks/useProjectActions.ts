import { useRef, useState } from "react";
import { UnauthorizedError } from "../api/client";
import {
  checkpointProjectSession,
  createProject,
  fetchProjectSummaries,
  updateProjectBookmark,
  updateProjectDescription,
  updateProjectMetadata,
  updateRepositoryConnection,
  type ProjectMetadataPatch,
} from "../api/projects";
import { isMockGithubUnlinkedProject } from "../workspace/previewData";
import type { Project, ProjectSummary } from "../workspace/types";

type UseProjectActionsOptions = {
  applyProjectSummaryToDetail: (updatedProject: ProjectSummary) => void;
  clearRepositoryFiles: () => void;
  loadProjectDetail: (
    projectId: string,
    fallbackProject: Project | null,
    signal?: AbortSignal,
    shouldApply?: () => boolean,
  ) => Promise<void>;
  loadProjectGithubFiles: (projectId: string, signal?: AbortSignal) => Promise<void>;
  mergeProjectSummary: (updatedProject: ProjectSummary) => void;
  onProjectSlugChange: (slug: string) => void;
  onUnauthorized: () => void;
  selectedProject: Project | null;
  selectedProjectId: string | null;
  setErrorMessage: (message: string | null) => void;
};

export function useProjectActions({
  applyProjectSummaryToDetail,
  clearRepositoryFiles,
  loadProjectDetail,
  loadProjectGithubFiles,
  mergeProjectSummary,
  onProjectSlugChange,
  onUnauthorized,
  selectedProject,
  selectedProjectId,
  setErrorMessage,
}: UseProjectActionsOptions) {
  const [bookmarkUpdatingProjectId, setBookmarkUpdatingProjectId] = useState<string | null>(
    null,
  );
  const selectedProjectIdRef = useRef(selectedProjectId);
  const selectedProjectRef = useRef(selectedProject);
  selectedProjectIdRef.current = selectedProjectId;
  selectedProjectRef.current = selectedProject;

  const rethrowAfterUnauthorized = (error: unknown): never => {
    if (error instanceof UnauthorizedError) {
      onUnauthorized();
    }
    throw error;
  };

  const mergeProjectState = (updatedProject: ProjectSummary) => {
    mergeProjectSummary(updatedProject);
    applyProjectSummaryToDetail(updatedProject);
  };

  const createProjectFromRepository = async (githubUrl: string) => {
    try {
      const project = await createProject({ github_url: githubUrl });
      mergeProjectState(project);
      return project;
    } catch (error) {
      return rethrowAfterUnauthorized(error);
    }
  };

  const toggleProjectBookmark = async (
    project: Project,
    nextIsBookmarked = !project.isBookmarked,
  ) => {
    if (isMockGithubUnlinkedProject(project.id)) {
      return;
    }

    setBookmarkUpdatingProjectId(project.id);
    setErrorMessage(null);
    try {
      mergeProjectState(await updateProjectBookmark(project.id, nextIsBookmarked));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
      }
      setErrorMessage(
        error instanceof Error ? error.message : "Project bookmark update failed.",
      );
    } finally {
      setBookmarkUpdatingProjectId(null);
    }
  };

  const organizeProjectPendingMemory = async (
    projectId: string,
    sessionIds: string[],
  ) => {
    const uniqueSessionIds = Array.from(new Set(sessionIds.filter(Boolean)));
    if (uniqueSessionIds.length === 0) {
      return {
        message: "No captured work is ready for memory.",
        status: "no_memory" as const,
      };
    }

    let completedSessionCount = 0;
    let mutationError: unknown = null;
    let projectMemoryGenerated = false;

    for (const sessionId of uniqueSessionIds) {
      try {
        const payload = await checkpointProjectSession(projectId, sessionId);
        completedSessionCount += 1;
        if (payload.status === "memory_generated") {
          projectMemoryGenerated = true;
        }
      } catch (error) {
        mutationError = error;
        break;
      }
    }

    if (mutationError instanceof UnauthorizedError) {
      return rethrowAfterUnauthorized(mutationError);
    }

    let refreshFailed = false;
    try {
      const shouldApplyDetail = () => selectedProjectIdRef.current === projectId;
      const detailRefresh = shouldApplyDetail()
        ? loadProjectDetail(
            projectId,
            selectedProjectRef.current,
            undefined,
            shouldApplyDetail,
          )
        : Promise.resolve();
      const [, projectSummaries] = await Promise.all([
        detailRefresh,
        fetchProjectSummaries(),
      ]);
      const updatedProject = projectSummaries.find(
        (project) => project.id === projectId,
      );
      if (updatedProject) {
        mergeProjectState(updatedProject);
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return rethrowAfterUnauthorized(error);
      }
      refreshFailed = true;
    }

    if (mutationError) {
      if (!projectMemoryGenerated) {
        throw mutationError;
      }
      return {
        message: `Memory was created for ${completedSessionCount} ${
          completedSessionCount === 1 ? "session" : "sessions"
        }, but a later session could not be processed.`,
        status: "memory_generated" as const,
      };
    }

    if (!projectMemoryGenerated) {
      return {
        message: refreshFailed
          ? "No new memory was generated, and project status could not be refreshed."
          : "No new memory was generated.",
        status: "no_memory" as const,
      };
    }

    return {
      message: refreshFailed
        ? "Memory was created. Project status will refresh with the review queue."
        : "Project Memory document was generated.",
      status: "memory_generated" as const,
    };
  };

  const organizePendingMemory = async (sessionIds: string[]) => {
    if (!selectedProjectId) {
      throw new Error("Select a project before organizing Pending Memory.");
    }
    return organizeProjectPendingMemory(selectedProjectId, sessionIds);
  };

  const saveRepositoryConnection = async (
    projectId: string,
    githubUrl: string,
  ) => {
    try {
      const updatedProject = await updateRepositoryConnection(projectId, githubUrl);
      mergeProjectSummary(updatedProject);
      clearRepositoryFiles();

      if (selectedProjectId === projectId) {
        await loadProjectDetail(projectId, selectedProject);
        await loadProjectGithubFiles(projectId);
      }
    } catch (error) {
      return rethrowAfterUnauthorized(error);
    }
  };

  const saveProjectDescription = async (description: string) => {
    if (!selectedProjectId) {
      throw new Error("Select a project before editing the description.");
    }

    try {
      await updateProjectDescription(selectedProjectId, description);
      await loadProjectDetail(selectedProjectId, selectedProject);
    } catch (error) {
      return rethrowAfterUnauthorized(error);
    }
  };

  const saveProjectMetadata = async (metadata: ProjectMetadataPatch) => {
    if (!selectedProjectId) {
      throw new Error("Select a project before editing project metadata.");
    }

    try {
      const updatedProject = await updateProjectMetadata(selectedProjectId, metadata);
      mergeProjectState(updatedProject);

      if (updatedProject.slug) {
        onProjectSlugChange(updatedProject.slug);
      }
      await loadProjectDetail(
        selectedProjectId,
        selectedProject
          ? {
              ...selectedProject,
              slug: updatedProject.slug,
              tags: updatedProject.tags ?? [],
              visibility: updatedProject.visibility,
            }
          : null,
      );
    } catch (error) {
      return rethrowAfterUnauthorized(error);
    }
  };

  return {
    bookmarkUpdatingProjectId,
    createProjectFromRepository,
    organizePendingMemory,
    organizeProjectPendingMemory,
    saveProjectDescription,
    saveProjectMetadata,
    saveRepositoryConnection,
    toggleProjectBookmark,
  };
}
