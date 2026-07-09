import { useState } from "react";
import { UnauthorizedError } from "../api/client";
import { fetchProjectFiles } from "../api/projects";
import type { FileTreeNode } from "../components/project-detail";

type UseProjectFilesOptions = {
  onUnauthorized: () => void;
};

export function useProjectFiles({ onUnauthorized }: UseProjectFilesOptions) {
  const [projectFiles, setProjectFiles] = useState<FileTreeNode[]>([]);
  const [projectFilesError, setProjectFilesError] = useState<string | null>(null);
  const [projectFilesTotal, setProjectFilesTotal] = useState<number | null>(null);
  const [projectFilesTruncated, setProjectFilesTruncated] = useState(false);
  const [isProjectFilesLoading, setIsProjectFilesLoading] = useState(false);

  const clearProjectFiles = () => {
    setProjectFiles([]);
    setProjectFilesError(null);
    setProjectFilesTotal(null);
    setProjectFilesTruncated(false);
    setIsProjectFilesLoading(false);
  };

  const loadProjectFiles = async (projectId: string, signal?: AbortSignal) => {
    setIsProjectFilesLoading(true);
    setProjectFilesError(null);
    try {
      const payload = await fetchProjectFiles(projectId, signal);
      setProjectFiles(payload.files);
      setProjectFilesTotal(payload.total);
      setProjectFilesTruncated(payload.truncated);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        clearProjectFiles();
        return;
      }
      setProjectFilesError(
        error instanceof Error ? error.message : "Tracked files request failed",
      );
    } finally {
      if (!signal?.aborted) {
        setIsProjectFilesLoading(false);
      }
    }
  };

  return {
    clearProjectFiles,
    isProjectFilesLoading,
    loadProjectFiles,
    projectFiles,
    projectFilesError,
    projectFilesTotal,
    projectFilesTruncated,
  };
}
