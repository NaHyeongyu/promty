import type { AccountSettingsController } from "../../hooks/useAccountSettings";
import type { AuthUser } from "../../workspace/types";
import { UserSettingsPage } from "./ProfilePages";

export function AccountWorkspaceRoute({
  account,
  activeTitle,
  apiUrl,
  canUseAdmin,
  connectedRepositoryCount,
  currentUser,
  githubConnectUrl,
  isEventsLoading,
  latestActivityLabel,
  latestMemoryLabel,
  memoryCount,
  onOpenRepositoryConnector,
  onOpenReviewQueue,
  onRefreshWorkspace,
  pendingMemoryCount,
  projectCount,
}: {
  account: AccountSettingsController;
  activeTitle: string;
  apiUrl: string;
  canUseAdmin: boolean;
  connectedRepositoryCount: number;
  currentUser: AuthUser | null;
  githubConnectUrl: string;
  isEventsLoading: boolean;
  latestActivityLabel: string;
  latestMemoryLabel: string;
  memoryCount: number;
  onOpenRepositoryConnector: () => void;
  onOpenReviewQueue: (returnFocusElement: HTMLElement) => void;
  onRefreshWorkspace: () => void;
  pendingMemoryCount: number;
  projectCount: number;
}) {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>{activeTitle}</h1>
        </div>
      </header>

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
          latestMemoryLabel={latestMemoryLabel}
          memoryCount={memoryCount}
          onClearCreatedCollectorToken={() => account.setCreatedCollectorToken(null)}
          onCreateCollectorToken={account.createCollectorToken}
          onDisconnectGithub={account.disconnectGithubConnection}
          onOpenRepositoryConnector={onOpenRepositoryConnector}
          onOpenReviewQueue={onOpenReviewQueue}
          onRefreshWorkspace={onRefreshWorkspace}
          onRenameCollectorToken={account.renameCollectorToken}
          onRevokeCollectorToken={account.revokeCollectorToken}
          onUpdatePreferredLocale={account.updatePreferredLocale}
          pendingMemoryCount={pendingMemoryCount}
          projectCount={projectCount}
        />
    </>
  );
}
