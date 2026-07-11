import type { AccountSettingsController } from "../../hooks/useAccountSettings";
import type { AuthUser, SidebarItemId } from "../../workspace/types";
import { UserProfilePage, UserSettingsPage } from "./ProfilePages";

export function AccountWorkspaceRoute({
  account,
  activeItem,
  activeTitle,
  apiUrl,
  canUseAdmin,
  connectedRepositoryCount,
  currentUser,
  githubConnectUrl,
  isEventsLoading,
  latestActivityLabel,
  onLogout,
  onOpenProfile,
  onRefreshWorkspace,
  projectCount,
}: {
  account: AccountSettingsController;
  activeItem: SidebarItemId;
  activeTitle: string;
  apiUrl: string;
  canUseAdmin: boolean;
  connectedRepositoryCount: number;
  currentUser: AuthUser | null;
  githubConnectUrl: string;
  isEventsLoading: boolean;
  latestActivityLabel: string;
  onLogout: () => void;
  onOpenProfile: () => void;
  onRefreshWorkspace: () => void;
  projectCount: number;
}) {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>{activeTitle}</h1>
        </div>
      </header>

      {activeItem === "profile" ? (
        <UserProfilePage
          accountError={account.accountError}
          accountOverview={account.accountOverview}
          connectedRepositoryCount={connectedRepositoryCount}
          currentUser={currentUser}
          isAccountLoading={account.isAccountLoading}
          latestActivityLabel={latestActivityLabel}
          onLogout={onLogout}
          projectCount={projectCount}
        />
      ) : (
        <UserSettingsPage
          accountError={account.accountError}
          accountOverview={account.accountOverview}
          apiUrl={apiUrl}
          canUseAdmin={canUseAdmin}
          connectedRepositoryCount={connectedRepositoryCount}
          createdCollectorToken={account.createdCollectorToken}
          currentUser={currentUser}
          githubConnectUrl={githubConnectUrl}
          isAccountLoading={account.isAccountLoading}
          isSaving={account.isAccountSaving}
          isRefreshing={isEventsLoading}
          latestActivityLabel={latestActivityLabel}
          onClearCreatedCollectorToken={() => account.setCreatedCollectorToken(null)}
          onCreateCollectorToken={account.createCollectorToken}
          onDisconnectGithub={account.disconnectGithubConnection}
          onOpenProfile={onOpenProfile}
          onRefreshWorkspace={onRefreshWorkspace}
          onRenameCollectorToken={account.renameCollectorToken}
          onRevokeCollectorToken={account.revokeCollectorToken}
          projectCount={projectCount}
        />
      )}
    </>
  );
}
