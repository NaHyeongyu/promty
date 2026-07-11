import { useState } from "react";
import {
  Check,
  Copy,
  Database,
  Folder,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Terminal,
  User,
} from "lucide-react";
import { formatOptionalTimestamp } from "../../lib/formatters";
import type {
  AccountCollectorToken,
  AccountCollectorTokenCreateResponse,
  AccountOverview,
  AuthUser,
} from "../../workspace/types";
import { GitHubIcon } from "./Branding";

function accountDisplayName(currentUser: AuthUser | null) {
  return currentUser?.username ?? "Signed in";
}

function tokenDateLabel(value: string | null | undefined) {
  return formatOptionalTimestamp(value, "Never");
}

function AccountStatus({
  error,
  isLoading,
}: {
  error?: string | null;
  isLoading?: boolean;
}) {
  if (!error && !isLoading) {
    return null;
  }

  return (
    <div
      className="settings-status"
      data-error={error ? "true" : undefined}
      role={error ? "alert" : "status"}
    >
      {error ?? "Loading account settings"}
    </div>
  );
}

export function UserProfilePage({
  accountError,
  accountOverview,
  connectedRepositoryCount,
  currentUser,
  isAccountLoading,
  latestActivityLabel,
  onLogout,
  projectCount,
}: {
  accountError?: string | null;
  accountOverview: AccountOverview | null;
  connectedRepositoryCount: number;
  currentUser: AuthUser | null;
  isAccountLoading?: boolean;
  latestActivityLabel: string;
  onLogout: () => void;
  projectCount: number;
}) {
  const displayName = accountDisplayName(currentUser);
  const email = currentUser?.email ?? "GitHub authenticated";
  const roleLabel = currentUser?.is_admin ? "Admin" : "Member";
  const userInitial = displayName.trim().charAt(0).toUpperCase() || "P";
  const userId = currentUser?.id ?? "Not available";
  const githubConnection = accountOverview?.github_connection;
  const activeTokenCount =
    accountOverview?.collector_tokens.filter((token) => token.status === "active")
      .length ?? 0;

  return (
    <section className="profile-page" aria-label="Profile settings">
      <AccountStatus error={accountError} isLoading={isAccountLoading} />
      <section className="profile-hero" aria-labelledby="profile-title">
        <div className="profile-avatar profile-avatar-large" aria-hidden="true">
          {currentUser?.avatar_url ? (
            <img alt="" src={currentUser.avatar_url} />
          ) : (
            <span>{userInitial}</span>
          )}
        </div>
        <div className="profile-hero-copy">
          <span>GitHub account</span>
          <h2 id="profile-title">{displayName}</h2>
          <p>{email}</p>
          <div className="profile-pill-row" aria-label="Account status">
            <span className="profile-pill" data-tone="success">
              Active session
            </span>
            <span className="profile-pill">{roleLabel}</span>
          </div>
        </div>
      </section>

      <div className="profile-grid">
        <section className="profile-section" aria-labelledby="profile-account-title">
          <div className="profile-section-header">
            <User aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="profile-account-title">Account</h3>
              <p>Identity used across this workspace.</p>
            </div>
          </div>
          <dl className="profile-setting-list">
            <div className="profile-setting-row">
              <dt>Display name</dt>
              <dd>{displayName}</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Email</dt>
              <dd>{email}</dd>
            </div>
            <div className="profile-setting-row">
              <dt>User ID</dt>
              <dd>
                <code>{userId}</code>
              </dd>
            </div>
            <div className="profile-setting-row">
              <dt>Workspace projects</dt>
              <dd>{projectCount.toLocaleString()}</dd>
            </div>
          </dl>
        </section>

        <section
          className="profile-section"
          aria-labelledby="profile-connections-title"
        >
          <div className="profile-section-header">
            <GitHubIcon />
            <div>
              <h3 id="profile-connections-title">Connected Accounts</h3>
              <p>Repository access for this account.</p>
            </div>
          </div>
          <dl className="profile-setting-list">
            <div className="profile-setting-row">
              <dt>GitHub</dt>
              <dd>{githubConnection?.connected ? "Connected" : "Not connected"}</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Scopes</dt>
              <dd>{githubConnection?.scopes.join(", ") || "Not available"}</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Connected repositories</dt>
              <dd>
                {connectedRepositoryCount.toLocaleString()} /{" "}
                {projectCount.toLocaleString()}
              </dd>
            </div>
            <div className="profile-setting-row">
              <dt>Latest activity</dt>
              <dd>{latestActivityLabel}</dd>
            </div>
          </dl>
        </section>

        <section className="profile-section" aria-labelledby="profile-security-title">
          <div className="profile-section-header">
            <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="profile-security-title">Security</h3>
              <p>Session and access controls.</p>
            </div>
          </div>
          <dl className="profile-setting-list">
            <div className="profile-setting-row">
              <dt>Current session</dt>
              <dd>Active</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Authentication</dt>
              <dd>GitHub OAuth</dd>
            </div>
            <div className="profile-setting-row">
              <dt>CLI tokens</dt>
              <dd>{activeTokenCount.toLocaleString()} active</dd>
            </div>
          </dl>
          <div className="profile-section-actions">
            <button className="toolbar-button" onClick={onLogout} type="button">
              <LogOut aria-hidden="true" size={15} strokeWidth={1.5} />
              <span>Log out</span>
            </button>
          </div>
        </section>

        <section
          className="profile-section"
          aria-labelledby="profile-privacy-title"
        >
          <div className="profile-section-header">
            <Database aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="profile-privacy-title">Data & Privacy</h3>
              <p>What Promty stores for this account.</p>
            </div>
          </div>
          <dl className="profile-setting-list">
            <div className="profile-setting-row">
              <dt>Project activity</dt>
              <dd>Prompts, sessions, file changes</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Memory artifacts</dt>
              <dd>Generated project memory</dd>
            </div>
            <div className="profile-setting-row">
              <dt>GitHub token</dt>
              <dd>{githubConnection?.connected ? "Encrypted at rest" : "Not stored"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}

function TokenRow({
  disabled,
  onRename,
  onRevoke,
  token,
}: {
  disabled?: boolean;
  onRename: (tokenId: string, name: string) => void;
  onRevoke: (tokenId: string) => void;
  token: AccountCollectorToken;
}) {
  const [nameDraft, setNameDraft] = useState(token.name);
  const isRevoked = token.status === "revoked";

  return (
    <li className="settings-token-row" data-revoked={isRevoked ? "true" : undefined}>
      <div className="settings-token-main">
        <input
          className="settings-control settings-token-name"
          disabled={disabled || isRevoked}
          onBlur={() => {
            const nextName = nameDraft.trim();
            if (nextName && nextName !== token.name) {
              onRename(token.id, nextName);
            } else {
              setNameDraft(token.name);
            }
          }}
          onChange={(event) => setNameDraft(event.target.value)}
          value={nameDraft}
        />
        <span className="settings-token-meta">
          Created {tokenDateLabel(token.created_at)} · Last used{" "}
          {tokenDateLabel(token.last_used_at)}
        </span>
      </div>
      <div className="settings-token-actions">
        <span
          className="settings-value-chip"
          data-tone={isRevoked ? "danger" : "success"}
        >
          {isRevoked ? "Revoked" : "Active"}
        </span>
        {!isRevoked ? (
          <button
            className="toolbar-button"
            disabled={disabled}
            onClick={() => onRevoke(token.id)}
            type="button"
          >
            Revoke
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function UserSettingsPage({
  accountError,
  accountOverview,
  apiUrl,
  canUseAdmin,
  connectedRepositoryCount,
  createdCollectorToken,
  currentUser,
  githubConnectUrl,
  isAccountLoading,
  isSaving,
  isRefreshing,
  latestActivityLabel,
  onClearCreatedCollectorToken,
  onCreateCollectorToken,
  onDisconnectGithub,
  onRefreshWorkspace,
  onRenameCollectorToken,
  onRevokeCollectorToken,
  projectCount,
}: {
  accountError?: string | null;
  accountOverview: AccountOverview | null;
  apiUrl: string;
  canUseAdmin: boolean;
  connectedRepositoryCount: number;
  createdCollectorToken: AccountCollectorTokenCreateResponse | null;
  currentUser: AuthUser | null;
  githubConnectUrl: string;
  isAccountLoading?: boolean;
  isSaving?: boolean;
  isRefreshing: boolean;
  latestActivityLabel: string;
  onClearCreatedCollectorToken: () => void;
  onCreateCollectorToken: (name?: string) => Promise<unknown>;
  onDisconnectGithub: () => Promise<void>;
  onRefreshWorkspace: () => void;
  onRenameCollectorToken: (tokenId: string, name: string) => Promise<void>;
  onRevokeCollectorToken: (tokenId: string) => Promise<void>;
  projectCount: number;
}) {
  const [collectorTokenName, setCollectorTokenName] = useState("Promty CLI");
  const [isTokenCopied, setIsTokenCopied] = useState(false);
  const roleLabel = currentUser?.is_admin ? "Admin" : "Member";
  const githubConnection = accountOverview?.github_connection;
  const collectorTokens = accountOverview?.collector_tokens ?? [];
  const activeCollectorTokens = collectorTokens.filter(
    (token) => token.status === "active",
  );
  const latestCollectorUse = activeCollectorTokens
    .map((token) => token.last_used_at)
    .filter((value): value is string => Boolean(value))
    .sort((first, second) => Date.parse(second) - Date.parse(first))[0];
  const latestCollectorUseAge = latestCollectorUse
    ? Date.now() - Date.parse(latestCollectorUse)
    : null;
  const collectorIngestion =
    activeCollectorTokens.length === 0
      ? { label: "Not configured", tone: "danger" }
      : !latestCollectorUse
        ? { label: "Waiting for first sync", tone: "warning" }
        : latestCollectorUseAge !== null &&
            latestCollectorUseAge <= 24 * 60 * 60 * 1000
          ? { label: "Connected", tone: "success" }
          : { label: "Sync stale", tone: "warning" };
  const repositoryCoverage =
    projectCount > 0
      ? `${connectedRepositoryCount.toLocaleString()} / ${projectCount.toLocaleString()}`
      : "No projects";
  const copyCreatedToken = async () => {
    if (!createdCollectorToken) {
      return;
    }
    await navigator.clipboard?.writeText(createdCollectorToken.token);
    setIsTokenCopied(true);
  };

  return (
    <section className="settings-page" aria-label="Workspace settings">
      <AccountStatus error={accountError} isLoading={isAccountLoading} />
      <section className="settings-hero" aria-labelledby="settings-title">
        <div className="settings-hero-copy">
          <span>Workspace controls</span>
          <h2 id="settings-title">Workspace status</h2>
          <p>Account access, repository connection, and collector tokens.</p>
        </div>
        <div className="settings-hero-actions">
          <button
            className="toolbar-button"
            disabled={isRefreshing || isAccountLoading}
            onClick={onRefreshWorkspace}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} strokeWidth={1.5} />
            <span>{isRefreshing || isAccountLoading ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </section>

      <div className="settings-grid">
        <section className="settings-section" aria-labelledby="settings-workspace-title">
          <div className="settings-section-header">
            <Folder aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="settings-workspace-title">Workspace</h3>
              <p>Current account workspace state.</p>
            </div>
          </div>
          <dl className="settings-list">
            <div className="settings-row">
              <dt>Projects</dt>
              <dd>{projectCount.toLocaleString()}</dd>
            </div>
            <div className="settings-row">
              <dt>Connected repositories</dt>
              <dd>{repositoryCoverage}</dd>
            </div>
            <div className="settings-row">
              <dt>Latest activity</dt>
              <dd>{latestActivityLabel}</dd>
            </div>
            <div className="settings-row">
              <dt>Role</dt>
              <dd>{roleLabel}</dd>
            </div>
          </dl>
        </section>

        <section className="settings-section" aria-labelledby="settings-sync-title">
          <div className="settings-section-header">
            <GitHubIcon />
            <div>
              <h3 id="settings-sync-title">GitHub</h3>
              <p>Repository access for file browsing and project creation.</p>
            </div>
          </div>
          <dl className="settings-list">
            <div className="settings-row">
              <dt>Status</dt>
              <dd>
                <span
                  className="settings-value-chip"
                  data-tone={githubConnection?.connected ? "success" : "danger"}
                >
                  {githubConnection?.connected ? "Connected" : "Not connected"}
                </span>
              </dd>
            </div>
            <div className="settings-row">
              <dt>Scopes</dt>
              <dd>{githubConnection?.scopes.join(", ") || "Not available"}</dd>
            </div>
            <div className="settings-row">
              <dt>Updated</dt>
              <dd>{formatOptionalTimestamp(githubConnection?.updated_at, "Never")}</dd>
            </div>
            <div className="settings-row">
              <dt>Connection</dt>
              <dd className="settings-row-control">
                <div className="settings-inline-actions">
                  <button
                    className="toolbar-button"
                    onClick={() => {
                      window.location.href = githubConnectUrl;
                    }}
                    type="button"
                  >
                    {githubConnection?.connected ? "Reconnect" : "Connect"}
                  </button>
                  <button
                    className="toolbar-button"
                    disabled={!githubConnection?.connected || isSaving}
                    onClick={() => {
                      if (window.confirm("Disconnect GitHub from this account?")) {
                        void onDisconnectGithub();
                      }
                    }}
                    type="button"
                  >
                    Disconnect
                  </button>
                </div>
              </dd>
            </div>
          </dl>
        </section>

        <section
          className="settings-section settings-section-wide"
          aria-labelledby="settings-collector-title"
        >
          <div className="settings-section-header">
            <Terminal aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="settings-collector-title">Collector</h3>
              <p>Local CLI tokens for event ingestion.</p>
            </div>
          </div>
          <dl className="settings-list">
            <div className="settings-row">
              <dt>API endpoint</dt>
              <dd>
                <code>{apiUrl}</code>
              </dd>
            </div>
            <div className="settings-row">
              <dt>Ingestion</dt>
              <dd>
                <span
                  className="settings-value-chip"
                  data-tone={collectorIngestion.tone}
                >
                  {collectorIngestion.label}
                </span>
              </dd>
            </div>
            <div className="settings-row">
              <dt>New token</dt>
              <dd className="settings-row-control">
                <form
                  className="settings-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setIsTokenCopied(false);
                    void onCreateCollectorToken(collectorTokenName);
                  }}
                >
                  <input
                    className="settings-control"
                    onChange={(event) => setCollectorTokenName(event.target.value)}
                    value={collectorTokenName}
                  />
                  <button
                    className="toolbar-button"
                    disabled={isSaving || !collectorTokenName.trim()}
                    type="submit"
                  >
                    <KeyRound aria-hidden="true" size={15} strokeWidth={1.5} />
                    <span>Create</span>
                  </button>
                </form>
              </dd>
            </div>
          </dl>
          {createdCollectorToken ? (
            <div className="settings-secret-box">
              <div>
                <strong>New collector token</strong>
                <code>{createdCollectorToken.token}</code>
              </div>
              <div className="settings-inline-actions">
                <button
                  className="toolbar-button"
                  onClick={() => {
                    void copyCreatedToken();
                  }}
                  type="button"
                >
                  {isTokenCopied ? (
                    <Check aria-hidden="true" size={15} strokeWidth={1.5} />
                  ) : (
                    <Copy aria-hidden="true" size={15} strokeWidth={1.5} />
                  )}
                  <span>{isTokenCopied ? "Copied" : "Copy"}</span>
                </button>
                <button
                  className="toolbar-button"
                  onClick={onClearCreatedCollectorToken}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          <ul className="settings-token-list">
            {collectorTokens.length > 0 ? (
              collectorTokens.map((token) => (
                <TokenRow
                  disabled={isSaving}
                  key={token.id}
                  onRename={(tokenId, name) => {
                    void onRenameCollectorToken(tokenId, name);
                  }}
                  onRevoke={(tokenId) => {
                    if (window.confirm("Revoke this collector token?")) {
                      void onRevokeCollectorToken(tokenId);
                    }
                  }}
                  token={token}
                />
              ))
            ) : (
              <li className="settings-token-empty">No collector tokens yet.</li>
            )}
          </ul>
        </section>

        <section className="settings-section" aria-labelledby="settings-access-title">
          <div className="settings-section-header">
            <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="settings-access-title">Access</h3>
              <p>Authentication and privileged controls.</p>
            </div>
          </div>
          <dl className="settings-list">
            <div className="settings-row">
              <dt>Authentication</dt>
              <dd>GitHub OAuth</dd>
            </div>
            <div className="settings-row">
              <dt>Admin console</dt>
              <dd>{canUseAdmin ? "Available" : "Restricted"}</dd>
            </div>
            <div className="settings-row">
              <dt>Session</dt>
              <dd>
                <span className="settings-value-chip" data-tone="success">
                  Active
                </span>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
