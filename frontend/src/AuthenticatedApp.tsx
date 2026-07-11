import { useEffect, useMemo, useState } from "react";
import { fetchCurrentUser, logoutSession } from "./api/auth";
import { UnauthorizedError } from "./api/client";
import { AdminDashboard } from "./components/app/AdminDashboard";
import { AccountWorkspaceRoute } from "./components/app/AccountWorkspaceRoute";
import { WebLoginPage } from "./components/app/AuthScreens";
import { ProjectsPage } from "./components/app/ProjectsPage";
import { RepositoryConnector } from "./components/app/RepositoryConnector";
import { WorkspaceSidebar } from "./components/app/WorkspaceSidebar";
import { LoadingScreen } from "./components/app/WorkspaceStates";
import {
  ProjectDetailPage,
  type ActivityNavigationState,
  type ProjectDetailTabId,
} from "./components/project-detail";
import { API_URL } from "./config";
import { useAccountSettings } from "./hooks/useAccountSettings";
import { useAdminOverview } from "./hooks/useAdminOverview";
import { useProjectActions } from "./hooks/useProjectActions";
import { useProjectCatalog } from "./hooks/useProjectCatalog";
import { useProjectDetail } from "./hooks/useProjectDetail";
import { useProjectFiles } from "./hooks/useProjectFiles";
import { useProjectSharing } from "./hooks/useProjectSharing";
import { useRepositoryConnector } from "./hooks/useRepositoryConnector";
import { useRepositoryFiles } from "./hooks/useRepositoryFiles";
import {
  useInitialWorkspaceNavigationState,
  useWorkspaceNavigationState,
} from "./hooks/useWorkspaceNavigationState";
import { useWorkspaceData } from "./hooks/useWorkspaceData";
import {
  useWorkspaceAdminEffect,
  useWorkspaceProjectResourceEffects,
  useWorkspaceProjectRouteEffect,
} from "./hooks/useWorkspaceEffects";
import {
  DEFAULT_URL_NAVIGATION_STATE,
  currentWorkspaceReturnUrl,
  normalizeUrlNavigationState,
  sanitizeProjectRouteKey,
  writeUrlNavigationState,
  type UrlNavigationState,
  type UrlNavigationWriteMode,
} from "./workspace/navigation";
import { emptyProjectDetailData } from "./workspace/projectDetailMappers";
import { isMockGithubUnlinkedProject } from "./workspace/previewData";
import type {
  AuthStatus,
  AuthUser,
  Project,
  SidebarItemId,
} from "./workspace/types";

function githubRepositoryConnectUrl() {
  return `${API_URL}/api/auth/github/web/start?${new URLSearchParams({
    return_to: currentWorkspaceReturnUrl(),
  })}`;
}

export function AuthenticatedApp() {
  const initialNavigationState = useInitialWorkspaceNavigationState();
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const handleUnauthorized = () => {
    setAuthStatus("unauthenticated");
    setCurrentUser(null);
  };
  const {
    clearWorkspaceData,
    errorMessage,
    hasLoadedWorkspaceData,
    isEventsLoading,
    loadEvents,
    mergeProjectSummary: mergeWorkspaceProjectSummary,
    projects,
    setErrorMessage,
  } = useWorkspaceData({
    onAuthenticated: () => setAuthStatus("authenticated"),
    onLoadError: () =>
      setAuthStatus((status) => (status === "loading" ? "error" : status)),
    onUnauthorized: handleUnauthorized,
  });
  const {
    applyProjectSummaryToDetail,
    clearProjectDetail,
    isProjectDetailLoading,
    loadProjectDetail,
    loadProjectMemoryArtifacts,
    projectDetail,
    projectDetailError,
    setProjectDetail,
  } = useProjectDetail({ onUnauthorized: handleUnauthorized });
  const {
    clearProjectFiles,
    isProjectFilesLoading,
    loadProjectFiles,
    projectFiles,
    projectFilesError,
    projectFilesTotal,
    projectFilesTruncated,
  } = useProjectFiles({ onUnauthorized: handleUnauthorized });
  const {
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
  } = useRepositoryFiles({
    initialPath: initialNavigationState.repositoryFileContentPath,
    onUnauthorized: handleUnauthorized,
  });
  const {
    closeRepositoryConnector,
    isRepositoryConnectorOpen,
    openRepositoryConnector,
    repositoryConnectorProjectId,
  } = useRepositoryConnector();
  const {
    activeDetailTab,
    activeItem,
    activityNavigation,
    applyNavigationState,
    currentNavigationState,
    selectedProjectId,
    selectedProjectRouteKey,
  } = useWorkspaceNavigationState({
    initialNavigationState,
    onPopState: closeRepositoryConnector,
    repositoryFileContentPath,
    setRepositoryFileContentPath,
  });
  const {
    adminError,
    adminOverview,
    clearAdminOverview,
    isAdminLoading,
    loadAdminOverview,
  } = useAdminOverview({ onUnauthorized: handleUnauthorized });
  const accountSettings = useAccountSettings({ onUnauthorized: handleUnauthorized });
  const previewMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("preview");
  }, []);
  const previewEmptyProjects = previewMode === "empty-projects";
  const previewGithubUnlinkedProject = previewMode === "github-unlinked-project";
  const previewProjectLoading = previewMode === "project-loading";
  const {
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
    sidebarBookmarkedProjects,
    visibleProjects,
  } = useProjectCatalog({
    previewEmptyProjects,
    previewGithubUnlinkedProject,
    projects,
    repositoryConnectorProjectId,
    selectedProjectId,
  });
  const activeTitle =
    activeItem === "projects"
      ? "Projects"
      : activeItem === "admin"
          ? "Admin"
        : activeItem === "settings"
          ? "Settings"
          : "Profile";
  const projectRouteKey = (project: Project | null | undefined) =>
    sanitizeProjectRouteKey(project?.slug) ?? project?.id ?? null;
  const projectMatchesRouteKey = (project: Project, routeKey: string) =>
    projectRouteKey(project) === routeKey || project.id === routeKey;
  const {
    bookmarkUpdatingProjectId,
    createProjectFromRepository,
    organizePendingMemory,
    saveProjectDescription,
    saveProjectMetadata,
    saveRepositoryConnection,
    toggleProjectBookmark,
  } = useProjectActions({
    applyProjectSummaryToDetail,
    clearRepositoryFiles,
    loadProjectDetail,
    loadProjectGithubFiles,
    mergeProjectSummary: mergeWorkspaceProjectSummary,
    onProjectSlugChange: (slug) => {
      const nextState = normalizeUrlNavigationState({
        ...currentNavigationState,
        selectedProjectRouteKey: slug,
      });
      applyNavigationState(nextState);
      writeUrlNavigationState(nextState, "replace");
    },
    onUnauthorized: handleUnauthorized,
    selectedProject,
    selectedProjectId,
    setErrorMessage,
  });
  const { copiedProjectId, shareProject } = useProjectSharing({
    projectRouteKey,
    setErrorMessage,
  });

  const navigateWorkspace = (
    state: Partial<UrlNavigationState>,
    mode: UrlNavigationWriteMode = "push",
  ) => {
    const requestedProjectId =
      state.selectedProjectId === undefined
        ? currentNavigationState.selectedProjectId
        : state.selectedProjectId;
    const requestedProject =
      requestedProjectId === null
        ? null
        : projectCatalog.find((project) => project.id === requestedProjectId) ?? null;
    const requestedProjectRouteKey = Object.prototype.hasOwnProperty.call(
      state,
      "selectedProjectRouteKey",
    )
      ? state.selectedProjectRouteKey
      : undefined;
    const fallbackProjectRouteKey =
      requestedProjectId === null
        ? null
        : projectRouteKey(requestedProject) ??
          requestedProjectId ??
          currentNavigationState.selectedProjectRouteKey;
    const nextState = normalizeUrlNavigationState({
      ...currentNavigationState,
      ...state,
      selectedProjectRouteKey:
        requestedProjectRouteKey !== undefined
          ? requestedProjectRouteKey
          : fallbackProjectRouteKey,
    });

    applyNavigationState(nextState);

    if (nextState.repositoryFileContentPath !== repositoryFileContentPath) {
      clearRepositoryFileContentState();
    }

    writeUrlNavigationState(nextState, mode);
  };

  const loadSession = async () => {
    setAuthStatus("loading");
    clearWorkspaceData();
    accountSettings.clearAccountSettings();
    setErrorMessage(null);
    try {
      setCurrentUser(await fetchCurrentUser());
      setAuthStatus("authenticated");
      await Promise.all([loadEvents(), accountSettings.loadAccountOverview()]);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        clearWorkspaceData();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Session request failed");
      setAuthStatus("error");
    }
  };

  const logout = async () => {
    await logoutSession().catch(() => undefined);
    setCurrentUser(null);
    clearWorkspaceData();
    applyNavigationState(DEFAULT_URL_NAVIGATION_STATE);
    clearProjectDetail();
    clearProjectFiles();
    clearRepositoryFiles();
    clearAdminOverview();
    accountSettings.clearAccountSettings();
    closeRepositoryConnector();
    setAuthStatus("unauthenticated");
    writeUrlNavigationState(DEFAULT_URL_NAVIGATION_STATE, "replace");
  };

  useEffect(() => {
    void loadSession();
  }, []);

  useWorkspaceAdminEffect({
    activeItem,
    authStatus,
    currentUserIsAdmin: currentUser?.is_admin,
    loadAdminOverview,
    navigateWorkspace,
  });
  useWorkspaceProjectRouteEffect({
    allowUnlistedProject: currentUser?.is_admin === true,
    activeItem,
    hasLoadedWorkspaceData,
    navigateWorkspace,
    projectCatalog,
    projectMatchesRouteKey,
    projectRouteKey,
    selectedProjectId,
    selectedProjectRouteKey,
  });
  useWorkspaceProjectResourceEffects({
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
  });

  const openProjectDetail = (projectId: string) => {
    closeRepositoryConnector();
    navigateWorkspace({
      activeDetailTab: "overview",
      activeItem: "projects",
      repositoryFileContentPath: null,
      selectedProjectId: projectId,
    });
  };
  const switchProjectDetail = (projectId: string) => {
    if (projectId === selectedProjectId) {
      return;
    }

    closeRepositoryConnector();
    clearProjectDetail();
    clearProjectFiles();
    clearRepositoryBrowserState();
    navigateWorkspace({
      activeDetailTab,
      activeItem: "projects",
      activityNavigation: DEFAULT_URL_NAVIGATION_STATE.activityNavigation,
      repositoryFileContentPath: null,
      selectedProjectId: projectId,
    });
  };
  const closeProjectDetail = () => {
    closeRepositoryConnector();
    navigateWorkspace({
      activeDetailTab: "overview",
      activeItem: "projects",
      repositoryFileContentPath: null,
      selectedProjectId: null,
    });
    clearProjectDetail();
    clearProjectFiles();
    clearRepositoryFiles();
  };
  const selectSidebarItem = (item: SidebarItemId) => {
    if (item === "admin" && !currentUser?.is_admin) {
      return;
    }

    if (item === "projects" && selectedProjectId) {
      closeProjectDetail();
      return;
    }

    closeRepositoryConnector();
    navigateWorkspace({
      activeDetailTab: "overview",
      activeItem: item,
      repositoryFileContentPath: null,
      selectedProjectId: null,
    });
  };
  const selectProjectDetailTab = (tab: ProjectDetailTabId) => {
    navigateWorkspace({
      activeDetailTab: tab,
      activeItem: "projects",
      repositoryFileContentPath:
        tab === "files" ? repositoryFileContentPath : null,
    });
  };
  const selectRepositoryFile = (path: string) => {
    navigateWorkspace({
      activeDetailTab: "files",
      activeItem: "projects",
      repositoryFileContentPath: path,
    });
  };
  const selectActivityNavigation = (nextActivityNavigation: ActivityNavigationState) => {
    navigateWorkspace({
      activeDetailTab: "ai-activity",
      activeItem: "projects",
      activityNavigation: nextActivityNavigation,
      repositoryFileContentPath: null,
    });
  };

  if (authStatus === "loading") {
    return <LoadingScreen />;
  }

  if (authStatus === "unauthenticated") {
    return <WebLoginPage errorMessage={null} />;
  }

  if (authStatus === "error") {
    return <WebLoginPage errorMessage={errorMessage} isError />;
  }

  const activeProjectId =
    selectedProject?.id ?? projectDetail?.project.id ?? selectedProjectId;
  const projectDetailBase =
    projectDetail ?? (selectedProject ? emptyProjectDetailData(selectedProject) : null);
  const selectedProjectDetailData =
    projectDetailBase === null
      ? null
      : {
          ...projectDetailBase,
          files: projectFiles,
          filesError: projectFilesError,
          filesLoading: isProjectFilesLoading,
          filesTotal: projectFilesTotal,
          filesTruncated: projectFilesTruncated,
          repositoryFileContent,
          repositoryFileContentError: repositoryFileContentError ?? undefined,
          repositoryFileContentLoading: isRepositoryFileContentLoading,
          repositoryFileSelectedPath: repositoryFileContentPath,
          repositoryFiles: projectGithubFiles?.files ?? [],
          repositoryFilesConnectUrl: githubRepositoryConnectUrl(),
          repositoryFilesLoading: isProjectGithubFilesLoading,
          repositoryFilesMessage: isProjectGithubFilesLoading
            ? "Loading GitHub repository files."
            : projectGithubFilesError ??
              projectGithubFiles?.message ??
              (projectDetailBase.project.repositoryUrl
                ? "Sign in again with GitHub repository access to browse repository files."
                : "This project does not have a GitHub repository remote."),
          repositoryFilesRepository: projectGithubFiles?.repository,
          repositoryFilesStatus: projectGithubFiles?.status,
          repositoryFilesTruncated: projectGithubFiles?.truncated,
        };
  const repositoryConnector = isRepositoryConnectorOpen ? (
    <RepositoryConnector
      onManualConnect={
        repositoryConnectorProjectId &&
        !isMockGithubUnlinkedProject(repositoryConnectorProjectId)
          ? (githubUrl) =>
              saveRepositoryConnection(repositoryConnectorProjectId, githubUrl)
          : repositoryConnectorProjectId === null
            ? async (githubUrl) => {
                const project = await createProjectFromRepository(githubUrl);
                navigateWorkspace({
                  activeDetailTab: "overview",
                  activeItem: "projects",
                  repositoryFileContentPath: null,
                  selectedProjectId: project.id,
                  selectedProjectRouteKey:
                    sanitizeProjectRouteKey(project.slug) ?? project.id,
                });
              }
            : undefined
      }
      onClose={closeRepositoryConnector}
      targetProjectName={repositoryConnectorProject?.name}
    />
  ) : null;
  const canUseAdmin = currentUser?.is_admin === true;
  const connectedRepositoryCount = projectCatalog.filter((project) =>
    Boolean(project.githubUrl),
  ).length;
  const latestProfileActivityLabel =
    projectCatalog[0]?.latestActivityLabel ?? "No project activity";
  const refreshWorkspaceAndAccount = () => {
    void Promise.all([loadEvents(), accountSettings.loadAccountOverview()]);
  };
  const pendingProjectRouteKey = selectedProjectRouteKey ?? selectedProjectId;
  const isResolvingProjectDetail =
    activeItem === "projects" &&
    projectDetail === null &&
    !projectDetailError &&
    Boolean(pendingProjectRouteKey);
  const isShowingProjectDetail =
    activeItem === "projects" &&
    (selectedProject !== null || projectDetail !== null || Boolean(pendingProjectRouteKey));
  const projectDetailRenderData =
    selectedProjectDetailData ?? emptyProjectDetailData(selectedProject);

  return (
    <div className="app-shell">
      <WorkspaceSidebar
        activeItem={activeItem}
        canUseAdmin={canUseAdmin}
        currentUser={currentUser}
        onLogout={logout}
        onOpenProject={openProjectDetail}
        onSelectItem={selectSidebarItem}
        savedProjectCount={bookmarkedProjects.length}
        savedProjects={sidebarBookmarkedProjects}
        selectedProjectId={selectedProjectId}
      />

      <main className="page">
        {isShowingProjectDetail ? (
          <>
            {repositoryConnector}
            <ProjectDetailPage
              activityNavigation={activityNavigation}
              activeTab={activeDetailTab}
              data={projectDetailRenderData}
              errorMessage={projectDetailError}
              isProjectResolving={isResolvingProjectDetail}
              isLoading={
                isResolvingProjectDetail ||
                (isProjectDetailLoading && projectDetail === null)
              }
              isBookmarkUpdating={
                selectedProject
                  ? bookmarkUpdatingProjectId === selectedProject.id
                  : false
              }
              isRefreshing={isProjectDetailLoading && projectDetail !== null}
              isShareCopied={
                selectedProject ? copiedProjectId === selectedProject.id : false
              }
              onActivityNavigationChange={selectActivityNavigation}
              onCheckpointMemory={selectedProject ? organizePendingMemory : undefined}
              onConnectRepository={
                selectedProject
                  ? () => openRepositoryConnector(selectedProject.id)
                  : undefined
              }
              onLoadMemoryArtifacts={
                activeProjectId
                  ? (limit) => loadProjectMemoryArtifacts(activeProjectId, limit)
                  : undefined
              }
              onOpenAllProjects={closeProjectDetail}
              onProjectSelect={selectedProject ? switchProjectDetail : undefined}
              onRepositoryFileSelect={activeProjectId ? selectRepositoryFile : undefined}
              onShareProject={
                selectedProject
                  ? () => {
                      void shareProject(selectedProject, activeDetailTab);
                    }
                  : undefined
              }
              onSaveProjectMetadata={selectedProject ? saveProjectMetadata : undefined}
              onSaveDescription={selectedProject ? saveProjectDescription : undefined}
              onTabChange={selectProjectDetailTab}
              onToggleBookmark={
                selectedProject
                  ? () => {
                      void toggleProjectBookmark(selectedProject);
                    }
                  : undefined
              }
              projectOptions={projectHeaderOptions}
              onRetry={
                activeProjectId
                  ? () => {
                      void loadProjectDetail(activeProjectId, selectedProject);
                      void loadProjectFiles(activeProjectId);
                      void loadProjectGithubFiles(activeProjectId);
                      if (repositoryFileContentPath) {
                        void loadRepositoryFileContent(
                          activeProjectId,
                          repositoryFileContentPath,
                        );
                      }
                    }
                  : undefined
              }
            />
          </>
        ) : activeItem === "projects" ? (
          <ProjectsPage
            activeTitle={activeTitle}
            displayProjects={displayProjects}
            errorMessage={errorMessage}
            isEventsLoading={isEventsLoading}
            onClearSearch={() => setProjectSearchQuery("")}
            onOpenProject={openProjectDetail}
            onOpenRepositoryConnector={() => openRepositoryConnector(null)}
            onRetry={loadEvents}
            onSearchChange={setProjectSearchQuery}
            onSortModeChange={setProjectSortMode}
            previewEmptyProjects={previewEmptyProjects}
            previewProjectLoading={previewProjectLoading}
            projectSearchQuery={projectSearchQuery}
            projectSortMode={projectSortMode}
            repositoryConnector={repositoryConnector}
            visibleProjects={visibleProjects}
          />
        ) : activeItem === "admin" && canUseAdmin ? (
          <>
            <header className="page-header">
              <div>
                <h1>{activeTitle}</h1>
              </div>
              <div className="page-actions">
                <span className="status-pill">Admin only</span>
              </div>
            </header>

            <AdminDashboard
              errorMessage={adminError}
              isLoading={isAdminLoading}
              onOpenProject={openProjectDetail}
              onRefresh={() => {
                void loadAdminOverview();
              }}
              overview={adminOverview}
            />
          </>
        ) : (
          <AccountWorkspaceRoute
            account={accountSettings}
            activeItem={activeItem}
            activeTitle={activeTitle}
            apiUrl={API_URL}
            canUseAdmin={canUseAdmin}
            connectedRepositoryCount={connectedRepositoryCount}
            currentUser={currentUser}
            githubConnectUrl={githubRepositoryConnectUrl()}
            isEventsLoading={isEventsLoading}
            latestActivityLabel={latestProfileActivityLabel}
            onLogout={() => {
              void logout();
            }}
            onOpenProfile={() => selectSidebarItem("profile")}
            onRefreshWorkspace={refreshWorkspaceAndAccount}
            projectCount={projectCatalog.length}
          />
        )}
      </main>
    </div>
  );
}
