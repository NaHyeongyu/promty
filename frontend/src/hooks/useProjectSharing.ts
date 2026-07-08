import { useEffect, useState } from "react";
import type { ProjectDetailTabId } from "../components/project-detail";
import { copyTextToClipboard } from "../lib/clipboard";
import { buildProjectShareUrl } from "../workspace/projectUrls";
import type { Project } from "../workspace/types";

type UseProjectSharingOptions = {
  projectRouteKey: (project: Project | null | undefined) => string | null;
  setErrorMessage: (message: string | null) => void;
};

export function useProjectSharing({
  projectRouteKey,
  setErrorMessage,
}: UseProjectSharingOptions) {
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedProjectId) {
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      setCopiedProjectId(null);
    }, 1800);
    return () => window.clearTimeout(timerId);
  }, [copiedProjectId]);

  const shareProject = async (
    project: Project,
    tab: ProjectDetailTabId = "overview",
  ) => {
    try {
      await copyTextToClipboard(
        buildProjectShareUrl(project, projectRouteKey(project), tab),
      );
      setCopiedProjectId(project.id);
    } catch {
      setErrorMessage("Project link could not be copied.");
    }
  };

  return {
    copiedProjectId,
    shareProject,
  };
}
