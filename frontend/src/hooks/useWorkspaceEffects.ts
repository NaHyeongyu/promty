import { useEffect, useRef } from "react";
import type { ProjectDetailData, ProjectDetailTabId } from "../components/project-detail";
import type {
  AuthStatus,
  Project,
  SidebarItemId,
} from "../workspace/types";
import {
  isMockGithubUnlinkedProject,
  mockGithubUnlinkedProjectDetail,
} from "../workspace/previewData";
import type {
  UrlNavigationState,
  UrlNavigationWriteMode,
} from "../workspace/navigation";

type NavigateWorkspace = (
  state: Partial<UrlNavigationState>,
  mode?: UrlNavigationWriteMode,
) => void;

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useWorkspaceAdminEffect({
  activeItem,
  authStatus,
  currentUserIsAdmin,
  loadAdminOverview,
  navigateWorkspace,
}: {
  activeItem: SidebarItemId;
  authStatus: AuthStatus;
  currentUserIsAdmin: boolean | undefined;
  loadAdminOverview: (signal?: AbortSignal) => Promise<void>;
  navigateWorkspace: NavigateWorkspace;
}) {
  const loadAdminOverviewRef = useLatestRef(loadAdminOverview);
  const navigateWorkspaceRef = useLatestRef(navigateWorkspace);

  useEffect(() => {
    if (authStatus !== "authenticated" || activeItem !== "admin") {
      return;
    }
    if (!currentUserIsAdmin) {
      navigateWorkspaceRef.current(
        {
          activeItem: "projects",
          repositoryFileContentPath: null,
          selectedProjectId: null,
          selectedProjectRouteKey: null,
        },
        "replace",
      );
      return;
    }

    const controller = new AbortController();
    void loadAdminOverviewRef.current(controller.signal);
    return () => controller.abort();
  }, [
    activeItem,
    authStatus,
    currentUserIsAdmin,
    loadAdminOverviewRef,
    navigateWorkspaceRef,
  ]);
}

export function useWorkspaceProjectRouteEffect({
  allowUnlistedProject,
  activeItem,
  hasLoadedWorkspaceData,
  navigateWorkspace,
  onProjectRouteNotFound,
  projectCatalog,
  projectMatchesRouteKey,
  projectRouteKey,
  selectedProjectId,
  selectedProjectRouteKey,
}: {
  allowUnlistedProject?: boolean;
  activeItem: SidebarItemId;
  hasLoadedWorkspaceData: boolean;
  navigateWorkspace: NavigateWorkspace;
  onProjectRouteNotFound?: (routeKey: string | null) => void;
  projectCatalog: Project[];
  projectMatchesRouteKey: (project: Project, routeKey: string) => boolean;
  projectRouteKey: (project: Project | null | undefined) => string | null;
  selectedProjectId: string | null;
  selectedProjectRouteKey: string | null;
}) {
  const navigateWorkspaceRef = useLatestRef(navigateWorkspace);
  const onProjectRouteNotFoundRef = useLatestRef(onProjectRouteNotFound);
  const projectMatchesRouteKeyRef = useLatestRef(projectMatchesRouteKey);
  const projectRouteKeyRef = useLatestRef(projectRouteKey);

  useEffect(() => {
    if (!hasLoadedWorkspaceData || activeItem !== "projects") {
      onProjectRouteNotFoundRef.current?.(null);
      return;
    }

    if (!selectedProjectId && selectedProjectRouteKey) {
      const resolvedProject = projectCatalog.find((project) =>
        projectMatchesRouteKeyRef.current(project, selectedProjectRouteKey),
      );

      if (resolvedProject) {
        onProjectRouteNotFoundRef.current?.(null);
        navigateWorkspaceRef.current(
          {
            selectedProjectId: resolvedProject.id,
            selectedProjectRouteKey: projectRouteKeyRef.current(resolvedProject),
          },
          "replace",
        );
        return;
      }

      onProjectRouteNotFoundRef.current?.(selectedProjectRouteKey);
      return;
    }

    if (!selectedProjectId) {
      onProjectRouteNotFoundRef.current?.(null);
      return;
    }

    const resolvedProject =
      projectCatalog.find((project) => project.id === selectedProjectId) ??
      (selectedProjectRouteKey
        ? projectCatalog.find((project) =>
            projectMatchesRouteKeyRef.current(project, selectedProjectRouteKey),
          )
        : null);
    if (!resolvedProject) {
      if (allowUnlistedProject) {
        onProjectRouteNotFoundRef.current?.(null);
        return;
      }
      onProjectRouteNotFoundRef.current?.(
        selectedProjectRouteKey ?? selectedProjectId,
      );
      return;
    }

    onProjectRouteNotFoundRef.current?.(null);

    const resolvedProjectRouteKey = projectRouteKeyRef.current(resolvedProject);
    if (
      resolvedProjectRouteKey &&
      (selectedProjectId !== resolvedProject.id ||
        selectedProjectRouteKey !== resolvedProjectRouteKey)
    ) {
      navigateWorkspaceRef.current(
        {
          selectedProjectId: resolvedProject.id,
          selectedProjectRouteKey: resolvedProjectRouteKey,
        },
        "replace",
      );
    }
  }, [
    allowUnlistedProject,
    activeItem,
    hasLoadedWorkspaceData,
    navigateWorkspaceRef,
    onProjectRouteNotFoundRef,
    projectCatalog,
    projectMatchesRouteKeyRef,
    projectRouteKeyRef,
    selectedProjectId,
    selectedProjectRouteKey,
  ]);
}

export function useWorkspaceProjectResourceEffects({
  activeDetailTab,
  activeItem,
  clearProjectDetail,
  clearProjectFiles,
  clearRepositoryBrowserState,
  clearRepositoryFileContentState,
  clearRepositoryFiles,
  loadProjectDetail,
  loadProjectFiles,
  loadProjectGithubFiles,
  loadRepositoryFileContent,
  repositoryFileContentPath,
  selectedProject,
  selectedProjectId,
  selectedProjectRouteKey,
  setProjectDetail,
}: {
  activeDetailTab: ProjectDetailTabId;
  activeItem: SidebarItemId;
  clearProjectDetail: () => void;
  clearProjectFiles: () => void;
  clearRepositoryBrowserState: () => void;
  clearRepositoryFileContentState: () => void;
  clearRepositoryFiles: () => void;
  loadProjectDetail: (
    projectId: string,
    fallbackProject: Project | null,
    signal?: AbortSignal,
  ) => Promise<void>;
  loadProjectFiles: (projectId: string, signal?: AbortSignal) => Promise<void>;
  loadProjectGithubFiles: (projectId: string, signal?: AbortSignal) => Promise<void>;
  loadRepositoryFileContent: (
    projectId: string,
    path: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  repositoryFileContentPath: string | null;
  selectedProject: Project | null;
  selectedProjectId: string | null;
  selectedProjectRouteKey: string | null;
  setProjectDetail: (data: ProjectDetailData | null) => void;
}) {
  const clearProjectDetailRef = useLatestRef(clearProjectDetail);
  const clearProjectFilesRef = useLatestRef(clearProjectFiles);
  const clearRepositoryBrowserStateRef = useLatestRef(clearRepositoryBrowserState);
  const clearRepositoryFileContentStateRef = useLatestRef(
    clearRepositoryFileContentState,
  );
  const clearRepositoryFilesRef = useLatestRef(clearRepositoryFiles);
  const loadProjectDetailRef = useLatestRef(loadProjectDetail);
  const loadProjectFilesRef = useLatestRef(loadProjectFiles);
  const loadProjectGithubFilesRef = useLatestRef(loadProjectGithubFiles);
  const loadRepositoryFileContentRef = useLatestRef(loadRepositoryFileContent);
  const setProjectDetailRef = useLatestRef(setProjectDetail);

  useEffect(() => {
    if (activeItem !== "projects" || (!selectedProjectId && !selectedProjectRouteKey)) {
      clearProjectDetailRef.current();
      clearProjectFilesRef.current();
      clearRepositoryFilesRef.current();
      return;
    }

    if (!selectedProjectId) {
      clearProjectDetailRef.current();
      clearProjectFilesRef.current();
      clearRepositoryBrowserStateRef.current();
      return;
    }

    if (isMockGithubUnlinkedProject(selectedProjectId) && selectedProject) {
      setProjectDetailRef.current(mockGithubUnlinkedProjectDetail(selectedProject));
      clearProjectFilesRef.current();
      clearRepositoryBrowserStateRef.current();
      return;
    }

    const detailController = new AbortController();
    const githubFilesController = new AbortController();
    clearProjectDetailRef.current();
    clearProjectFilesRef.current();
    clearRepositoryBrowserStateRef.current();
    void loadProjectDetailRef.current(
      selectedProjectId,
      selectedProject,
      detailController.signal,
    );
    void loadProjectGithubFilesRef.current(
      selectedProjectId,
      githubFilesController.signal,
    );
    return () => {
      detailController.abort();
      githubFilesController.abort();
    };
  }, [
    activeItem,
    clearProjectDetailRef,
    clearProjectFilesRef,
    clearRepositoryBrowserStateRef,
    clearRepositoryFilesRef,
    loadProjectDetailRef,
    loadProjectGithubFilesRef,
    selectedProject,
    selectedProjectId,
    selectedProjectRouteKey,
    setProjectDetailRef,
  ]);

  useEffect(() => {
    if (!selectedProjectId || activeItem !== "projects" || activeDetailTab !== "files") {
      return;
    }

    const controller = new AbortController();
    void loadProjectFilesRef.current(selectedProjectId, controller.signal);
    return () => controller.abort();
  }, [
    activeDetailTab,
    activeItem,
    loadProjectFilesRef,
    selectedProjectId,
  ]);

  useEffect(() => {
    if (
      !selectedProjectId ||
      activeItem !== "projects" ||
      activeDetailTab !== "files" ||
      !repositoryFileContentPath
    ) {
      clearRepositoryFileContentStateRef.current();
      return;
    }

    const controller = new AbortController();
    void loadRepositoryFileContentRef.current(
      selectedProjectId,
      repositoryFileContentPath,
      controller.signal,
    );
    return () => controller.abort();
  }, [
    activeDetailTab,
    activeItem,
    clearRepositoryFileContentStateRef,
    loadRepositoryFileContentRef,
    repositoryFileContentPath,
    selectedProjectId,
  ]);
}
