import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActivityNavigationState,
  ProjectDetailTabId,
} from "../components/project-detail";
import {
  readUrlNavigationState,
  writeUrlNavigationState,
  type UrlNavigationState,
} from "../workspace/navigation";
import type { SidebarItemId } from "../workspace/types";

type UseWorkspaceNavigationStateOptions = {
  initialNavigationState: UrlNavigationState;
  onPopState?: () => void;
  repositoryFileContentPath: string | null;
  setRepositoryFileContentPath: (path: string | null) => void;
};

export function useInitialWorkspaceNavigationState() {
  return useMemo(readUrlNavigationState, []);
}

export function useWorkspaceNavigationState({
  initialNavigationState,
  onPopState,
  repositoryFileContentPath,
  setRepositoryFileContentPath,
}: UseWorkspaceNavigationStateOptions) {
  const [activeItem, setActiveItem] = useState<SidebarItemId>(
    initialNavigationState.activeItem,
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialNavigationState.selectedProjectId,
  );
  const [selectedProjectRouteKey, setSelectedProjectRouteKey] = useState<string | null>(
    initialNavigationState.selectedProjectRouteKey,
  );
  const [selectedPublicProjectId, setSelectedPublicProjectId] = useState<string | null>(
    initialNavigationState.selectedPublicProjectId,
  );
  const [selectedCommunityFlowKey, setSelectedCommunityFlowKey] = useState<string | null>(
    initialNavigationState.selectedCommunityFlowKey,
  );
  const [activeDetailTab, setActiveDetailTab] =
    useState<ProjectDetailTabId>(initialNavigationState.activeDetailTab);
  const [activityNavigation, setActivityNavigation] =
    useState<ActivityNavigationState>(initialNavigationState.activityNavigation);

  const currentNavigationState = useMemo<UrlNavigationState>(
    () => ({
      activityNavigation,
      activeDetailTab,
      activeItem,
      repositoryFileContentPath,
      selectedProjectId,
      selectedProjectRouteKey,
      selectedPublicProjectId,
      selectedCommunityFlowKey,
    }),
    [
      activityNavigation,
      activeDetailTab,
      activeItem,
      repositoryFileContentPath,
      selectedProjectId,
      selectedProjectRouteKey,
      selectedPublicProjectId,
      selectedCommunityFlowKey,
    ],
  );

  const applyNavigationState = useCallback(
    (nextState: UrlNavigationState) => {
      setActiveItem(nextState.activeItem);
      setSelectedProjectId(nextState.selectedProjectId);
      setSelectedProjectRouteKey(nextState.selectedProjectRouteKey);
      setSelectedPublicProjectId(nextState.selectedPublicProjectId);
      setSelectedCommunityFlowKey(nextState.selectedCommunityFlowKey);
      setActiveDetailTab(nextState.activeDetailTab);
      setActivityNavigation(nextState.activityNavigation);
      setRepositoryFileContentPath(nextState.repositoryFileContentPath);
    },
    [setRepositoryFileContentPath],
  );

  useEffect(() => {
    writeUrlNavigationState(initialNavigationState, "replace");
  }, [initialNavigationState]);

  useEffect(() => {
    const handlePopState = () => {
      applyNavigationState(readUrlNavigationState());
      onPopState?.();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyNavigationState, onPopState]);

  return {
    activeDetailTab,
    activeItem,
    activityNavigation,
    applyNavigationState,
    currentNavigationState,
    selectedProjectId,
    selectedProjectRouteKey,
    selectedPublicProjectId,
    selectedCommunityFlowKey,
  };
}
