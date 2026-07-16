import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  Database,
  Folder,
  KeyRound,
  LogOut,
  Minus,
  Pencil,
  RefreshCw,
  ShieldCheck,
  User,
} from "lucide-react";
import { formatOptionalTimestamp } from "../../lib/formatters";
import {
  APP_LANGUAGES,
  type AppLocale,
  useI18n,
} from "../../i18n/I18nProvider";
import type {
  AccountCollectorToken,
  AccountCollectorTokenCreateResponse,
  AccountOverview,
  AuthUser,
} from "../../workspace/types";
import { GitHubIcon } from "./Branding";
import { EmptyState } from "./WorkspaceStates";

function accountDisplayName(currentUser: AuthUser | null) {
  return currentUser?.username ?? "Signed in";
}

function tokenDateLabel(
  value: string | null | undefined,
  fallback = "Never",
) {
  return formatOptionalTimestamp(value, fallback);
}

function tokenTimestamp(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function AccountStatus({
  error,
  isLoading,
}: {
  error?: string | null;
  isLoading?: boolean;
}) {
  const { t } = useI18n();
  if (!error && !isLoading) {
    return null;
  }

  return (
    <div
      className="settings-status"
      data-error={error ? "true" : undefined}
      role={error ? "alert" : "status"}
    >
      {error ?? t("settings.loadingAccount")}
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
  isMostRecentlyUsed,
  onRename,
  onRevoke,
  token,
}: {
  disabled?: boolean;
  isMostRecentlyUsed?: boolean;
  onRename: (tokenId: string, name: string) => void;
  onRevoke: (tokenId: string) => void;
  token: AccountCollectorToken;
}) {
  const { t } = useI18n();
  const [nameDraft, setNameDraft] = useState(token.name);
  const [isEditing, setIsEditing] = useState(false);
  const isRevoked = token.status === "revoked";
  const hasBeenUsed = Boolean(token.last_used_at);
  const statusLabel = isRevoked
    ? t("settings.token.revoked")
    : isMostRecentlyUsed
      ? t("settings.token.recentlyUsed")
      : hasBeenUsed
        ? t("common.active")
        : t("common.unused");
  const statusTone = isRevoked
    ? "danger"
    : hasBeenUsed
      ? "success"
      : "warning";
  const saveName = () => {
    const nextName = nameDraft.trim();
    if (nextName && nextName !== token.name) {
      onRename(token.id, nextName);
    } else {
      setNameDraft(token.name);
    }
    setIsEditing(false);
  };

  return (
    <li className="settings-token-row" data-revoked={isRevoked ? "true" : undefined}>
      <div className="settings-token-main">
        <div className="settings-token-identity">
          {isEditing ? (
            <input
              aria-label={t("settings.token.nameLabel")}
              autoFocus
              className="settings-control settings-token-name"
              disabled={disabled}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  saveName();
                } else if (event.key === "Escape") {
                  setNameDraft(token.name);
                  setIsEditing(false);
                }
              }}
              value={nameDraft}
            />
          ) : (
            <strong>{token.name}</strong>
          )}
          <span className="settings-value-chip" data-tone={statusTone}>
            {statusLabel}
          </span>
        </div>
        <dl className="settings-token-details">
          <div><dt>{t("settings.token.created")}</dt><dd>{tokenDateLabel(token.created_at, t("common.never"))}</dd></div>
          <div><dt>{t("settings.token.lastUsed")}</dt><dd>{tokenDateLabel(token.last_used_at, t("common.never"))}</dd></div>
        </dl>
        {!isRevoked && !hasBeenUsed ? (
          <span className="settings-token-guidance">
            {t("settings.token.neverConnected")}
          </span>
        ) : null}
      </div>
      <div className="settings-token-actions">
        {isEditing ? (
          <>
            <button className="toolbar-button" disabled={disabled || !nameDraft.trim()} onClick={saveName} type="button">{t("common.save")}</button>
            <button className="toolbar-button" disabled={disabled} onClick={() => { setNameDraft(token.name); setIsEditing(false); }} type="button">{t("common.cancel")}</button>
          </>
        ) : !isRevoked ? (
          <>
            <button className="toolbar-button" disabled={disabled} onClick={() => setIsEditing(true)} type="button">
              <Pencil aria-hidden="true" size={14} strokeWidth={1.5} />
              <span>{t("common.rename")}</span>
            </button>
            <button className="toolbar-button settings-danger-action" disabled={disabled} onClick={() => onRevoke(token.id)} type="button">{t("settings.token.revoke")}</button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function StageStatus({
  label,
  tone,
}: {
  label: string;
  tone: "attention" | "complete" | "pending";
}) {
  const StatusIcon =
    tone === "complete" ? Check : tone === "attention" ? AlertCircle : Minus;

  return (
    <span className="settings-stage-status" data-tone={tone}>
      <StatusIcon aria-hidden="true" size={14} strokeWidth={1.5} />
      {label}
    </span>
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
  latestMemoryLabel,
  memoryCount,
  onClearCreatedCollectorToken,
  onCreateCollectorToken,
  onDisconnectGithub,
  onOpenRepositoryConnector,
  onOpenReviewQueue,
  onRefreshWorkspace,
  onRenameCollectorToken,
  onRevokeCollectorToken,
  onUpdatePreferredLocale,
  pendingMemoryCount,
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
  latestMemoryLabel: string;
  memoryCount: number;
  onClearCreatedCollectorToken: () => void;
  onCreateCollectorToken: (name?: string) => Promise<unknown>;
  onDisconnectGithub: () => Promise<void>;
  onOpenRepositoryConnector: () => void;
  onOpenReviewQueue: (returnFocusElement: HTMLElement) => void;
  onRefreshWorkspace: () => void;
  onRenameCollectorToken: (tokenId: string, name: string) => Promise<void>;
  onRevokeCollectorToken: (tokenId: string) => Promise<void>;
  onUpdatePreferredLocale: (locale: AppLocale) => Promise<void>;
  pendingMemoryCount: number;
  projectCount: number;
}) {
  const { locale, setLocale, t } = useI18n();
  const [collectorTokenName, setCollectorTokenName] = useState("");
  const [isTokenCopied, setIsTokenCopied] = useState(false);
  const roleLabel = currentUser?.is_admin ? t("common.admin") : t("common.member");
  const githubConnection = accountOverview?.github_connection;
  const collectorTokens = accountOverview?.collector_tokens ?? [];
  const activeCollectorTokens = collectorTokens.filter(
    (token) => token.status === "active",
  );
  const revokedCollectorTokens = collectorTokens.filter(
    (token) => token.status === "revoked",
  );
  const latestCollectorUse = activeCollectorTokens
    .map((token) => token.last_used_at)
    .filter((value): value is string => Boolean(value))
    .sort((first, second) => Date.parse(second) - Date.parse(first))[0];
  const sortedActiveCollectorTokens = [...activeCollectorTokens].sort(
    (first, second) => {
      const lastUsedDifference =
        tokenTimestamp(second.last_used_at) - tokenTimestamp(first.last_used_at);
      return (
        lastUsedDifference ||
        tokenTimestamp(second.created_at) - tokenTimestamp(first.created_at)
      );
    },
  );
  const mostRecentlyUsedTokenId = sortedActiveCollectorTokens.find(
    (token) => token.last_used_at,
  )?.id;
  const latestCollectorUseAge = latestCollectorUse
    ? Date.now() - Date.parse(latestCollectorUse)
    : null;
  const collectorIngestion =
    activeCollectorTokens.length === 0
      ? { label: t("settings.statusNotConfigured"), tone: "danger" }
      : !latestCollectorUse
        ? { label: t("settings.statusWaitingSync"), tone: "warning" }
        : latestCollectorUseAge !== null &&
            latestCollectorUseAge <= 24 * 60 * 60 * 1000
          ? { label: t("settings.statusConnected"), tone: "success" }
          : { label: t("settings.statusStale"), tone: "warning" };
  const repositoryCoverage =
    projectCount > 0
      ? `${connectedRepositoryCount.toLocaleString()} / ${projectCount.toLocaleString()}`
      : t("settings.noProjects");
  const hasConnectedRepository = connectedRepositoryCount > 0;
  const isCollectorRecent =
    latestCollectorUseAge !== null && latestCollectorUseAge <= 24 * 60 * 60 * 1000;
  const hasProjectMemory = memoryCount > 0 || pendingMemoryCount > 0;
  const completedStageCount = [
    Boolean(currentUser),
    hasConnectedRepository,
    activeCollectorTokens.length > 0,
    isCollectorRecent,
    hasProjectMemory,
  ].filter(Boolean).length;
  const nextStage = !currentUser
    ? 1
    : !hasConnectedRepository
      ? 2
      : activeCollectorTokens.length === 0
        ? 3
        : !isCollectorRecent
          ? 4
          : !hasProjectMemory
            ? 5
            : null;
  const [openStage, setOpenStage] = useState<number | null>(null);
  useEffect(() => {
    setOpenStage(nextStage);
  }, [nextStage]);
  useEffect(() => {
    if (createdCollectorToken) {
      setCollectorTokenName("");
    }
  }, [createdCollectorToken]);
  const handleStageToggle = (stage: number, isOpen: boolean) => {
    setOpenStage((current) => (isOpen ? stage : current === stage ? null : current));
  };
  const overallMessage = !githubConnection?.connected
    ? t("settings.message.connectGithub")
    : !hasConnectedRepository
      ? t("settings.message.chooseRepository")
      : activeCollectorTokens.length === 0
        ? t("settings.message.createToken")
        : !isCollectorRecent
          ? t("settings.message.runCollector")
          : !hasProjectMemory
            ? t("settings.message.memoryNext")
            : pendingMemoryCount > 0
              ? t("settings.message.pendingReview", { count: pendingMemoryCount.toLocaleString() })
              : t("settings.message.upToDate");
  const copyCreatedToken = async () => {
    if (!createdCollectorToken) {
      return;
    }
    await navigator.clipboard?.writeText(createdCollectorToken.token);
    setIsTokenCopied(true);
  };

  if (accountError && !accountOverview && !isAccountLoading) {
    return (
      <section className="settings-page" aria-label={t("settings.serviceSetup")}>
        <EmptyState
          description={accountError}
          icon={RefreshCw}
          title={t("settings.loadFailed")}
        >
          <button
            className="empty-state-button"
            onClick={onRefreshWorkspace}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>{t("common.retry")}</span>
          </button>
        </EmptyState>
      </section>
    );
  }

  if (!accountOverview) {
    return (
      <section className="settings-page" aria-label={t("settings.serviceSetup")}>
        <EmptyState
          description={t("auth.moment")}
          icon={RefreshCw}
          title={t("settings.loadingAccount")}
        />
      </section>
    );
  }

  return (
    <section className="settings-page" aria-label={t("settings.serviceSetup")}>
      <AccountStatus error={accountError} isLoading={isAccountLoading} />
      <section className="settings-hero" aria-labelledby="settings-title">
        <div className="settings-hero-copy">
          <span>{t("settings.serviceSetup")}</span>
          <h2 id="settings-title">{t("settings.stagesReady", { ready: completedStageCount })}</h2>
          <p>{overallMessage}</p>
        </div>
        <div className="settings-hero-actions">
          <button
            className="toolbar-button"
            disabled={isRefreshing || isAccountLoading}
            onClick={onRefreshWorkspace}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} strokeWidth={1.5} />
            <span>{isRefreshing || isAccountLoading ? t("common.refreshing") : t("common.refresh")}</span>
          </button>
        </div>
      </section>

      <div className="settings-stage-list">
        <details
          className="settings-stage"
          data-status={currentUser ? "complete" : "pending"}
          onToggle={(event) => handleStageToggle(1, event.currentTarget.open)}
          open={openStage === 1}
        >
          <summary className="settings-stage-header">
            <span className="settings-stage-marker" aria-hidden="true">01</span>
            <div className="settings-stage-heading">
              <h3>{t("settings.account")}</h3>
              <p>{t("settings.accountDescription")}</p>
            </div>
            <StageStatus label={currentUser ? t("settings.statusComplete") : t("settings.statusUnavailable")} tone={currentUser ? "complete" : "pending"} />
            <ChevronDown aria-hidden="true" className="settings-stage-chevron" size={16} strokeWidth={1.5} />
          </summary>
          <div className="settings-stage-content">
            <dl className="settings-stage-metrics">
              <div><dt>{t("settings.accountLabel")}</dt><dd>{currentUser?.username ?? t("common.signedIn")}</dd></div>
              <div><dt>{t("settings.email")}</dt><dd>{currentUser?.email ?? t("settings.githubAuthenticated")}</dd></div>
              <div><dt>{t("settings.role")}</dt><dd>{roleLabel}</dd></div>
              <div><dt>{t("settings.access")}</dt><dd>{canUseAdmin ? t("settings.adminConsole") : t("settings.standardMember")}</dd></div>
            </dl>
            <div className="settings-language-setting">
              <div>
                <label htmlFor="settings-language">{t("language.label")}</label>
                <span>{t("language.description")}</span>
              </div>
              <div>
                <select
                  className="settings-control"
                  id="settings-language"
                  disabled={isSaving}
                  onChange={(event) => {
                    const nextLocale = event.target.value as AppLocale;
                    const previousLocale = locale;
                    setLocale(nextLocale);
                    void onUpdatePreferredLocale(nextLocale).catch(() => {
                      setLocale(previousLocale);
                    });
                  }}
                  value={locale}
                >
                  {APP_LANGUAGES.map((language) => (
                    <option key={language.locale} value={language.locale}>{language.label}</option>
                  ))}
                </select>
                <small>{t("language.savedToAccount")}</small>
              </div>
            </div>
          </div>
        </details>

        <details
          className="settings-stage"
          data-status={hasConnectedRepository ? "complete" : "attention"}
          onToggle={(event) => handleStageToggle(2, event.currentTarget.open)}
          open={openStage === 2}
        >
          <summary className="settings-stage-header">
            <span className="settings-stage-marker" aria-hidden="true">02</span>
            <div className="settings-stage-heading">
              <h3>{t("settings.repository")}</h3>
              <p>{t("settings.repositoryDescription")}</p>
            </div>
            <StageStatus
              label={hasConnectedRepository ? t("settings.statusComplete") : githubConnection?.connected ? t("settings.statusSelectRepository") : t("settings.statusConnectGithub")}
              tone={hasConnectedRepository ? "complete" : "attention"}
            />
            <ChevronDown aria-hidden="true" className="settings-stage-chevron" size={16} strokeWidth={1.5} />
          </summary>
          <div className="settings-stage-content">
            <dl className="settings-stage-metrics">
              <div><dt>{t("settings.repositories")}</dt><dd>{repositoryCoverage}</dd></div>
              <div><dt>{t("settings.githubAccess")}</dt><dd>{githubConnection?.connected ? t("common.authorized") : t("common.notAuthorized")}</dd></div>
              <div><dt>{t("settings.scopes")}</dt><dd>{githubConnection?.scopes.join(", ") || t("common.notAvailable")}</dd></div>
              <div><dt>{t("settings.updated")}</dt><dd>{formatOptionalTimestamp(githubConnection?.updated_at, t("common.never"))}</dd></div>
            </dl>
            <div className="settings-stage-actions">
              <button className="toolbar-button" onClick={onOpenRepositoryConnector} type="button">
                <Folder aria-hidden="true" size={15} strokeWidth={1.5} />
                <span>{t("settings.manageRepositories")}</span>
              </button>
              <button
                className="toolbar-button"
                onClick={() => { window.location.href = githubConnectUrl; }}
                type="button"
              >
                {githubConnection?.connected ? t("settings.refreshGithub") : t("settings.statusConnectGithub")}
              </button>
              {githubConnection?.connected ? (
                <button
                  className="toolbar-button settings-danger-action"
                  disabled={isSaving}
                  onClick={() => {
                    if (window.confirm(t("settings.disconnectGithubConfirm"))) {
                      void onDisconnectGithub();
                    }
                  }}
                  type="button"
                >
                  {t("settings.disconnect")}
                </button>
              ) : null}
            </div>
          </div>
        </details>

        <details
          className="settings-stage"
          data-status={activeCollectorTokens.length > 0 ? "complete" : "attention"}
          onToggle={(event) => handleStageToggle(3, event.currentTarget.open)}
          open={openStage === 3}
        >
          <summary className="settings-stage-header">
            <span className="settings-stage-marker" aria-hidden="true">03</span>
            <div className="settings-stage-heading">
              <h3>{t("settings.collector")}</h3>
              <p>{t("settings.collectorDescription")}</p>
            </div>
            <StageStatus
              label={activeCollectorTokens.length > 0 ? `${activeCollectorTokens.length} ${t("common.active")}` : t("settings.statusCreateToken")}
              tone={activeCollectorTokens.length > 0 ? "complete" : "attention"}
            />
            <ChevronDown aria-hidden="true" className="settings-stage-chevron" size={16} strokeWidth={1.5} />
          </summary>
          <div className="settings-stage-content">
            <dl className="settings-stage-metrics">
              <div><dt>{t("settings.apiEndpoint")}</dt><dd><code>{apiUrl}</code></dd></div>
              <div><dt>{t("settings.ingestion")}</dt><dd><span className="settings-value-chip" data-tone={collectorIngestion.tone}>{collectorIngestion.label}</span></dd></div>
              <div><dt>{t("settings.latestVersion")}</dt><dd>{accountOverview?.latest_collector_version ?? t("settings.checking")}</dd></div>
              <div><dt>{t("settings.lastTokenUse")}</dt><dd>{tokenDateLabel(latestCollectorUse, t("common.never"))}</dd></div>
            </dl>
            <form
              className="settings-token-create"
              onSubmit={(event) => {
                event.preventDefault();
                setIsTokenCopied(false);
                void onCreateCollectorToken(collectorTokenName);
              }}
            >
              <div className="settings-token-create-copy">
                <label htmlFor="collector-token-name">{t("settings.token.create")}</label>
                <span id="collector-token-name-help">
                  {t("settings.token.deviceHint")}
                </span>
              </div>
              <div className="settings-inline-form">
                <input
                  aria-describedby="collector-token-name-help"
                  className="settings-control"
                  id="collector-token-name"
                  onChange={(event) => setCollectorTokenName(event.target.value)}
                  placeholder={t("settings.token.namePlaceholder")}
                  value={collectorTokenName}
                />
                <button className="toolbar-button" disabled={isSaving || !collectorTokenName.trim()} type="submit">
                  <KeyRound aria-hidden="true" size={15} strokeWidth={1.5} />
                  <span>{t("common.create")}</span>
                </button>
              </div>
            </form>
            {createdCollectorToken ? (
              <div className="settings-secret-box">
                <div>
                  <strong>{t("settings.token.copyNow")}</strong>
                  <span>{t("settings.token.shownOnce")}</span>
                  <code>{createdCollectorToken.token}</code>
                </div>
                <div className="settings-inline-actions">
                  <button className="toolbar-button" onClick={() => { void copyCreatedToken(); }} type="button">
                    {isTokenCopied ? <Check aria-hidden="true" size={15} strokeWidth={1.5} /> : <Copy aria-hidden="true" size={15} strokeWidth={1.5} />}
                    <span>{isTokenCopied ? t("common.copied") : t("common.copy")}</span>
                  </button>
                  <button className="toolbar-button" onClick={onClearCreatedCollectorToken} type="button">{t("common.dismiss")}</button>
                </div>
              </div>
            ) : null}
            <div className="settings-token-list-header">
              <div>
                <strong>{t("settings.token.activeTokens")}</strong>
                <span>{t("settings.token.keepCurrent")}</span>
              </div>
              <span>{activeCollectorTokens.length} {t("common.active")}</span>
            </div>
            <ul className="settings-token-list">
              {sortedActiveCollectorTokens.length > 0 ? sortedActiveCollectorTokens.map((token) => (
                <TokenRow
                  disabled={isSaving}
                  isMostRecentlyUsed={token.id === mostRecentlyUsedTokenId}
                  key={token.id}
                  onRename={(tokenId, name) => { void onRenameCollectorToken(tokenId, name); }}
                  onRevoke={(tokenId) => {
                    const usageNote = token.last_used_at
                      ? t("settings.token.lastUsedSentence", { date: tokenDateLabel(token.last_used_at, t("common.never")) })
                      : t("settings.token.neverUsedSentence");
                    if (window.confirm(t("settings.token.revokeConfirm", { name: token.name, usage: usageNote }))) {
                      void onRevokeCollectorToken(tokenId);
                    }
                  }}
                  token={token}
                />
              )) : <li className="settings-token-empty">{t("settings.token.empty")}</li>}
            </ul>
            {revokedCollectorTokens.length > 0 ? (
              <details className="settings-revoked-tokens">
                <summary>{t("settings.token.revokedTokens", { count: revokedCollectorTokens.length })}</summary>
                <ul className="settings-token-list">
                  {revokedCollectorTokens.map((token) => (
                    <TokenRow
                      disabled
                      key={token.id}
                      onRename={() => undefined}
                      onRevoke={() => undefined}
                      token={token}
                    />
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </details>

        <details
          className="settings-stage"
          data-status={isCollectorRecent ? "complete" : activeCollectorTokens.length > 0 ? "attention" : "pending"}
          onToggle={(event) => handleStageToggle(4, event.currentTarget.open)}
          open={openStage === 4}
        >
          <summary className="settings-stage-header">
            <span className="settings-stage-marker" aria-hidden="true">04</span>
            <div className="settings-stage-heading">
              <h3>{t("settings.activity")}</h3>
              <p>{t("settings.activityDescription")}</p>
            </div>
            <StageStatus
              label={isCollectorRecent ? t("settings.statusLive") : activeCollectorTokens.length > 0 ? t("settings.statusWaitingActivity") : t("settings.statusBlocked")}
              tone={isCollectorRecent ? "complete" : activeCollectorTokens.length > 0 ? "attention" : "pending"}
            />
            <ChevronDown aria-hidden="true" className="settings-stage-chevron" size={16} strokeWidth={1.5} />
          </summary>
          <div className="settings-stage-content">
            <dl className="settings-stage-metrics">
              <div><dt>{t("settings.collectorSync")}</dt><dd>{tokenDateLabel(latestCollectorUse, t("common.never"))}</dd></div>
              <div><dt>{t("settings.projectActivity")}</dt><dd>{latestActivityLabel}</dd></div>
              <div><dt>{t("settings.projectsDetected")}</dt><dd>{projectCount.toLocaleString()}</dd></div>
              <div><dt>{t("settings.connectionHealth")}</dt><dd>{collectorIngestion.label}</dd></div>
            </dl>
            {!isCollectorRecent ? (
              <p className="settings-stage-guidance">
                {activeCollectorTokens.length > 0
                  ? t("settings.runCollectorGuidance")
                  : t("settings.completeCollectorGuidance")}
              </p>
            ) : null}
          </div>
        </details>

        <details
          className="settings-stage"
          data-status={pendingMemoryCount > 0 ? "attention" : hasProjectMemory ? "complete" : isCollectorRecent ? "attention" : "pending"}
          onToggle={(event) => handleStageToggle(5, event.currentTarget.open)}
          open={openStage === 5}
        >
          <summary className="settings-stage-header">
            <span className="settings-stage-marker" aria-hidden="true">05</span>
            <div className="settings-stage-heading">
              <h3>{t("settings.memory")}</h3>
              <p>{t("settings.memoryDescription")}</p>
            </div>
            <StageStatus
              label={pendingMemoryCount > 0 ? t("settings.statusReviewNeeded") : memoryCount > 0 ? t("settings.statusComplete") : isCollectorRecent ? t("settings.statusAvailable") : t("settings.statusBlocked")}
              tone={pendingMemoryCount > 0 ? "attention" : memoryCount > 0 ? "complete" : isCollectorRecent ? "attention" : "pending"}
            />
            <ChevronDown aria-hidden="true" className="settings-stage-chevron" size={16} strokeWidth={1.5} />
          </summary>
          <div className="settings-stage-content">
            <dl className="settings-stage-metrics">
              <div><dt>{t("settings.generatedMemories")}</dt><dd>{memoryCount.toLocaleString()}</dd></div>
              <div><dt>{t("settings.readyForReview")}</dt><dd>{pendingMemoryCount.toLocaleString()}</dd></div>
              <div><dt>{t("settings.latestMemory")}</dt><dd>{latestMemoryLabel}</dd></div>
              <div><dt>{t("settings.workspaceProjects")}</dt><dd>{projectCount.toLocaleString()}</dd></div>
            </dl>
            {pendingMemoryCount > 0 ? (
              <div className="settings-stage-actions">
                <button
                  className="toolbar-button"
                  onClick={(event) => onOpenReviewQueue(event.currentTarget)}
                  type="button"
                >
                  {t("settings.openReviewQueue")}
                </button>
              </div>
            ) : null}
          </div>
        </details>
      </div>
    </section>
  );
}
