import { useRef, useState } from "react";
import { UnauthorizedError } from "../api/client";
import {
  approveProjectMemory as requestProjectMemoryApproval,
  createProject,
  deleteProject,
  fetchProjectSummaries,
  generateProjectMemory as requestProjectMemoryGeneration,
  updateProjectBookmark,
  updateProjectDescription,
  updateProjectMetadata,
  updateRepositoryConnection,
  type ProjectMemoryGenerationResponse,
  type ProjectMetadataPatch,
} from "../api/projects";
import { isMockGithubUnlinkedProject } from "../workspace/previewData";
import type { Project, ProjectSummary } from "../workspace/types";

const PROJECT_MEMORY_REFRESH_TIMEOUT_MS = 15_000;

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
  onProjectDeleted: () => void;
  onUnauthorized: () => void;
  removeProject: (projectId: string) => void;
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
  onProjectDeleted,
  onUnauthorized,
  removeProject,
  selectedProject,
  selectedProjectId,
  setErrorMessage,
}: UseProjectActionsOptions) {
  const [bookmarkUpdatingProjectId, setBookmarkUpdatingProjectId] = useState<string | null>(
    null,
  );
  const [activeProjectMemoryGenerationIds, setActiveProjectMemoryGenerationIds] =
    useState<Set<string>>(() => new Set());
  const [delayedProjectMemoryGenerationIds, setDelayedProjectMemoryGenerationIds] =
    useState<Set<string>>(() => new Set());
  const projectMemoryGenerationRequestsRef = useRef(
    new Map<string, Promise<ProjectMemoryGenerationResponse>>(),
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

  const deleteSelectedProject = async () => {
    if (!selectedProjectId) {
      throw new Error("Select a project before deleting it.");
    }

    try {
      await deleteProject(selectedProjectId);
      removeProject(selectedProjectId);
      onProjectDeleted();
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

  const runProjectMemoryGeneration = async (projectId: string) => {
    let payload: ProjectMemoryGenerationResponse;
    try {
      payload = await requestProjectMemoryGeneration(projectId);
    } catch (error) {
      return rethrowAfterUnauthorized(error);
    }

    if (
      payload.status === "generation_delayed" ||
      payload.status === "generation_in_progress" ||
      payload.status === "generation_failed"
    ) {
      return payload;
    }

    let refreshFailed = false;
    const refreshController = new AbortController();
    const refreshTimeoutId = window.setTimeout(
      () => refreshController.abort(),
      PROJECT_MEMORY_REFRESH_TIMEOUT_MS,
    );
    try {
      const shouldApplyDetail = () => selectedProjectIdRef.current === projectId;
      const detailRefresh = shouldApplyDetail()
        ? loadProjectDetail(
            projectId,
            selectedProjectRef.current,
            refreshController.signal,
            shouldApplyDetail,
          )
        : Promise.resolve();
      const [, projectSummaries] = await Promise.all([
        detailRefresh,
        fetchProjectSummaries(refreshController.signal),
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
    } finally {
      window.clearTimeout(refreshTimeoutId);
    }

    return {
      ...payload,
      message:
        refreshFailed && payload.status === "memory_generated"
          ? "Project memory was created. Project status will refresh with the review queue."
          : refreshFailed
            ? `${payload.message} Project status could not be refreshed.`
            : payload.message,
    };
  };

  const generateProjectMemory = (
    projectId: string,
  ): Promise<ProjectMemoryGenerationResponse> => {
    const existingRequest = projectMemoryGenerationRequestsRef.current.get(projectId);
    if (existingRequest) {
      return existingRequest;
    }

    setActiveProjectMemoryGenerationIds((current) => {
      const next = new Set(current);
      next.add(projectId);
      return next;
    });

    const request = runProjectMemoryGeneration(projectId).then((result) => {
      setDelayedProjectMemoryGenerationIds((current) => {
        const next = new Set(current);
        if (result.status === "generation_delayed") {
          next.add(projectId);
        } else {
          next.delete(projectId);
        }
        return next;
      });
      return result;
    });
    let trackedRequest: Promise<ProjectMemoryGenerationResponse>;
    trackedRequest = request.finally(() => {
      if (
        projectMemoryGenerationRequestsRef.current.get(projectId) !== trackedRequest
      ) {
        return;
      }
      projectMemoryGenerationRequestsRef.current.delete(projectId);
      setActiveProjectMemoryGenerationIds((current) => {
        const next = new Set(current);
        next.delete(projectId);
        return next;
      });
    });
    projectMemoryGenerationRequestsRef.current.set(projectId, trackedRequest);
    return trackedRequest;
  };

  const approveProjectMemoryForAgents = async (projectId: string) => {
    try {
      await requestProjectMemoryApproval(projectId);
      if (selectedProjectIdRef.current === projectId) {
        await loadProjectDetail(projectId, selectedProjectRef.current);
      }
    } catch (error) {
      return rethrowAfterUnauthorized(error);
    }
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
              projectUrl: updatedProject.project_url ?? undefined,
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
    activeProjectMemoryGenerationIds,
    approveProjectMemoryForAgents,
    bookmarkUpdatingProjectId,
    createProjectFromRepository,
    deleteSelectedProject,
    delayedProjectMemoryGenerationIds,
    generateProjectMemory,
    saveProjectDescription,
    saveProjectMetadata,
    saveRepositoryConnection,
    toggleProjectBookmark,
  };
}
