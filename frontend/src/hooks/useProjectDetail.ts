import { useRef, useState } from "react";
import { UnauthorizedError } from "../api/client";
import {
  fetchProjectDetailResources,
  fetchProjectMemoryArtifacts,
} from "../api/projects";
import type { ProjectDetailData, ProjectMemoryArtifact } from "../components/project-detail";
import {
  projectDetailDataFromApi,
  projectMemoryArtifactFromApi,
} from "../workspace/projectDetailMappers";
import type { Project, ProjectSummary } from "../workspace/types";

type UseProjectDetailOptions = {
  onUnauthorized: () => void;
};

export function useProjectDetail({ onUnauthorized }: UseProjectDetailOptions) {
  const [projectDetail, setProjectDetail] = useState<ProjectDetailData | null>(null);
  const [projectDetailError, setProjectDetailError] = useState<string | null>(null);
  const [isProjectDetailLoading, setIsProjectDetailLoading] = useState(false);
  const projectDetailRequestRef = useRef(0);

  const clearProjectDetail = () => {
    projectDetailRequestRef.current += 1;
    setProjectDetail(null);
    setProjectDetailError(null);
    setIsProjectDetailLoading(false);
  };

  const applyProjectSummaryToDetail = (updatedProject: ProjectSummary) => {
    setProjectDetail((currentDetail) =>
      currentDetail?.project.id === updatedProject.id
        ? {
            ...currentDetail,
            project: {
              ...currentDetail.project,
              isBookmarked: updatedProject.is_bookmarked === true,
              projectUrl: updatedProject.project_url ?? undefined,
              slug: updatedProject.slug ?? currentDetail.project.slug,
              tags: updatedProject.tags ?? currentDetail.project.tags,
              visibility: updatedProject.visibility,
            },
          }
        : currentDetail,
    );
  };

  const loadProjectDetail = async (
    projectId: string,
    fallbackProject: Project | null,
    signal?: AbortSignal,
    shouldApply: () => boolean = () => true,
  ) => {
    if (!shouldApply()) {
      return;
    }
    const requestId = projectDetailRequestRef.current + 1;
    projectDetailRequestRef.current = requestId;
    setIsProjectDetailLoading(true);
    setProjectDetailError(null);
    try {
      const payload = await fetchProjectDetailResources(projectId, signal);
      if (projectDetailRequestRef.current === requestId && shouldApply()) {
        setProjectDetail(projectDetailDataFromApi(payload, fallbackProject));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        setProjectDetail(null);
        return;
      }
      if (projectDetailRequestRef.current === requestId && shouldApply()) {
        setProjectDetailError(
          error instanceof Error ? error.message : "Project detail request failed",
        );
      }
    } finally {
      if (projectDetailRequestRef.current === requestId && shouldApply()) {
        setIsProjectDetailLoading(false);
      }
    }
  };

  const loadProjectMemoryArtifacts = async (
    projectId: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<ProjectMemoryArtifact[]> => {
    try {
      const artifacts = await fetchProjectMemoryArtifacts(projectId, limit, signal);
      return artifacts.map(projectMemoryArtifactFromApi);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return [];
      }
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
      }
      throw error;
    }
  };

  return {
    applyProjectSummaryToDetail,
    clearProjectDetail,
    isProjectDetailLoading,
    loadProjectDetail,
    loadProjectMemoryArtifacts,
    projectDetail,
    projectDetailError,
    setProjectDetail,
  };
}
