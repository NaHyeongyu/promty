import { useState } from "react";
import { UnauthorizedError } from "../api/client";
import {
  fetchProjectGithubFiles,
  fetchRepositoryFileContent,
} from "../api/projects";
import type { RepositoryFileContent } from "../components/project-detail";
import {
  projectGithubFilesFromApi,
  repositoryFileContentFromApi,
} from "../workspace/projectDetailMappers";
import type { ProjectGithubFilesState } from "../workspace/types";

type UseRepositoryFilesOptions = {
  initialPath: string | null;
  onUnauthorized: () => void;
};

export function useRepositoryFiles({
  initialPath,
  onUnauthorized,
}: UseRepositoryFilesOptions) {
  const [projectGithubFiles, setProjectGithubFiles] =
    useState<ProjectGithubFilesState | null>(null);
  const [projectGithubFilesError, setProjectGithubFilesError] = useState<string | null>(
    null,
  );
  const [isProjectGithubFilesLoading, setIsProjectGithubFilesLoading] = useState(false);
  const [repositoryFileContent, setRepositoryFileContent] =
    useState<RepositoryFileContent | null>(null);
  const [repositoryFileContentError, setRepositoryFileContentError] =
    useState<string | null>(null);
  const [repositoryFileContentPath, setRepositoryFileContentPath] =
    useState<string | null>(initialPath);
  const [isRepositoryFileContentLoading, setIsRepositoryFileContentLoading] =
    useState(false);

  const clearRepositoryFileContent = (path: string | null = null) => {
    setRepositoryFileContent(null);
    setRepositoryFileContentError(null);
    setRepositoryFileContentPath(path);
    setIsRepositoryFileContentLoading(false);
  };

  const clearRepositoryFileContentState = () => {
    setRepositoryFileContent(null);
    setRepositoryFileContentError(null);
    setIsRepositoryFileContentLoading(false);
  };

  const clearRepositoryBrowserState = () => {
    setProjectGithubFiles(null);
    setProjectGithubFilesError(null);
    setIsProjectGithubFilesLoading(false);
    clearRepositoryFileContentState();
  };

  const clearRepositoryFiles = () => {
    setProjectGithubFiles(null);
    setProjectGithubFilesError(null);
    setIsProjectGithubFilesLoading(false);
    clearRepositoryFileContent(null);
  };

  const loadProjectGithubFiles = async (
    projectId: string,
    signal?: AbortSignal,
  ) => {
    setIsProjectGithubFilesLoading(true);
    setProjectGithubFilesError(null);
    try {
      const payload = await fetchProjectGithubFiles(projectId, signal);
      setProjectGithubFiles(projectGithubFilesFromApi(payload));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        setProjectGithubFiles(null);
        return;
      }
      setProjectGithubFilesError(
        error instanceof Error ? error.message : "GitHub files request failed",
      );
    } finally {
      if (!signal?.aborted) {
        setIsProjectGithubFilesLoading(false);
      }
    }
  };

  const loadRepositoryFileContent = async (
    projectId: string,
    path: string,
    signal?: AbortSignal,
  ) => {
    setRepositoryFileContentPath(path);
    setRepositoryFileContent(null);
    setRepositoryFileContentError(null);
    setIsRepositoryFileContentLoading(true);
    try {
      const payload = await fetchRepositoryFileContent(projectId, path, signal);
      setRepositoryFileContent(repositoryFileContentFromApi(payload));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        setRepositoryFileContent(null);
        return;
      }
      setRepositoryFileContentError(
        error instanceof Error ? error.message : "GitHub file request failed",
      );
    } finally {
      if (!signal?.aborted) {
        setIsRepositoryFileContentLoading(false);
      }
    }
  };

  return {
    clearRepositoryBrowserState,
    clearRepositoryFileContent,
    clearRepositoryFileContentState,
    clearRepositoryFiles,
    isProjectGithubFilesLoading,
    isRepositoryFileContentLoading,
    loadProjectGithubFiles,
    loadRepositoryFileContent,
    projectGithubFiles,
    projectGithubFilesError,
    repositoryFileContent,
    repositoryFileContentError,
    repositoryFileContentPath,
    setRepositoryFileContentPath,
  };
}
