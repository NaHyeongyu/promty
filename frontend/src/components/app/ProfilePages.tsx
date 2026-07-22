import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Database,
  Folder,
  KeyRound,
  LogOut,
  Moon,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  X,
} from "lucide-react";
import { formatOptionalTimestamp } from "../../lib/formatters";
import { getCollectorHealth } from "../../lib/collectorHealth";
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
import { useTheme } from "../../theme";
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
  isSaving,
  latestActivityLabel,
  onDeleteAccount,
  onLogout,
  onUpdateExternalAiConsent,
  projectCount,
}: {
  accountError?: string | null;
  accountOverview: AccountOverview | null;
  connectedRepositoryCount: number;
  currentUser: AuthUser | null;
  isAccountLoading?: boolean;
  isSaving?: boolean;
  latestActivityLabel: string;
  onDeleteAccount: (confirmation: string) => Promise<boolean>;
  onLogout: () => void;
  onUpdateExternalAiConsent: (allowExternalAi: boolean) => Promise<boolean>;
  projectCount: number;
}) {
  const { t } = useI18n();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [hasAcknowledgedDeletion, setHasAcknowledgedDeletion] = useState(false);
  const displayName = accountDisplayName(currentUser);
  const email = currentUser?.email ?? "GitHub authenticated";
  const roleLabel = currentUser?.is_admin ? "Admin" : "Member";
  const userInitial = displayName.trim().charAt(0).toUpperCase() || "P";
  const userId = currentUser?.id ?? "Not available";
  const githubConnection = accountOverview?.github_connection;
  const activeTokenCount =
    accountOverview?.collector_tokens.filter((token) => token.status === "active")
      .length ?? 0;
  const canDeleteAccount =
    !currentUser?.is_admin
    && deleteConfirmation === currentUser?.username
    && hasAcknowledgedDeletion
    && !isSaving;
  const closeDeleteDialog = () => {
    if (isSaving) {
      return;
    }
    setIsDeleteDialogOpen(false);
    setDeleteConfirmation("");
    setHasAcknowledgedDeletion(false);
  };

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
            <div className="profile-setting-row">
              <dt>{t("policyConsent.aiTitle")}</dt>
              <dd>
                <label className="settings-inline-toggle">
                  <input
                    checked={accountOverview?.policy_consents.external_ai_allowed ?? false}
                    disabled={isSaving || !accountOverview?.policy_consents.policy_accepted}
                    onChange={(event) => void onUpdateExternalAiConsent(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    {accountOverview?.policy_consents.external_ai_allowed
                      ? t("common.authorized")
                      : t("common.notAuthorized")}
                  </span>
                </label>
              </dd>
            </div>
          </dl>
          <div className="profile-section-actions">
            <a className="toolbar-button" href="/privacy">{t("policyConsent.privacy")}</a>
            <a className="toolbar-button" href="/terms">{t("policyConsent.terms")}</a>
            <button
              className="toolbar-button settings-danger-action"
              disabled={currentUser?.is_admin || isSaving}
              onClick={() => setIsDeleteDialogOpen(true)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} strokeWidth={1.5} />
              <span>{t("accountDeletion.open")}</span>
            </button>
          </div>
        </section>
      </div>

      {isDeleteDialogOpen ? (
        <div className="account-delete-backdrop" role="presentation">
          <section
            aria-labelledby="account-delete-title"
            aria-modal="true"
            className="account-delete-dialog"
            role="dialog"
          >
            <header>
              <div>
                <span>{t("accountDeletion.eyebrow")}</span>
                <h2 id="account-delete-title">{t("accountDeletion.title")}</h2>
              </div>
              <button
                aria-label={t("common.close")}
                disabled={isSaving}
                onClick={closeDeleteDialog}
                type="button"
              >
                <X aria-hidden="true" size={17} />
              </button>
            </header>
            <p>{t("accountDeletion.description")}</p>
            <ul>
              <li>{t("accountDeletion.dataProjects")}</li>
              <li>{t("accountDeletion.dataCommunity")}</li>
              <li>{t("accountDeletion.dataAccess")}</li>
            </ul>
            <label>
              <span>
                {t("accountDeletion.confirmation", {
                  username: currentUser?.username ?? "",
                })}
              </span>
              <input
                autoComplete="off"
                autoFocus
                disabled={isSaving}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                spellCheck="false"
                value={deleteConfirmation}
              />
            </label>
            <label className="account-delete-acknowledgement">
              <input
                checked={hasAcknowledgedDeletion}
                disabled={isSaving}
                onChange={(event) => setHasAcknowledgedDeletion(event.target.checked)}
                type="checkbox"
              />
              <span>{t("accountDeletion.acknowledgement")}</span>
            </label>
            <div className="account-delete-actions">
              <button disabled={isSaving} onClick={closeDeleteDialog} type="button">
                {t("common.cancel")}
              </button>
              <button
                className="is-danger"
                disabled={!canDeleteAccount}
                onClick={() => void onDeleteAccount(deleteConfirmation)}
                type="button"
              >
                <Trash2 aria-hidden="true" size={15} />
                {isSaving ? t("common.saving") : t("accountDeletion.confirm")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
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
  const { setTheme, theme } = useTheme();
  const [collectorTokenName, setCollectorTokenName] = useState("");
  const [isTokenCopied, setIsTokenCopied] = useState(false);
  const roleLabel = currentUser?.is_admin ? t("common.admin") : t("common.member");
  const themeCopy = locale === "ko"
      ? {
        bright: "브라이트",
        dark: "다크",
        label: "테마",
      }
    : {
        bright: "Bright",
        dark: "Dark",
        label: "Theme",
      };
  const githubConnection = accountOverview?.github_connection;
  const collectorTokens = accountOverview?.collector_tokens ?? [];
  const activeCollectorTokens = collectorTokens.filter(
    (token) => token.status === "active",
  );
  const revokedCollectorTokens = collectorTokens.filter(
    (token) => token.status === "revoked",
  );
  const collectorHealth = getCollectorHealth(accountOverview);
  const latestCollectorUse = collectorHealth.latestUsedAt;
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
  const collectorIngestion =
    collectorHealth.state === "not-configured"
      ? { label: t("settings.statusNotConfigured"), tone: "danger" }
      : collectorHealth.state === "waiting"
        ? { label: t("settings.statusWaitingSync"), tone: "warning" }
        : collectorHealth.state === "disconnected"
          ? { label: t("settings.statusDisconnected"), tone: "danger" }
          : collectorHealth.state === "delayed"
            ? { label: t("settings.statusStale"), tone: "warning" }
            : { label: t("settings.statusConnected"), tone: "success" };
  const repositoryCoverage =
    projectCount > 0
      ? `${connectedRepositoryCount.toLocaleString()} / ${projectCount.toLocaleString()}`
      : t("settings.noProjects");
  const hasConnectedRepository = connectedRepositoryCount > 0;
  const isCollectorRecent = ["connected", "update-required"].includes(
    collectorHealth.state,
  );
  const hasProjectMemory = memoryCount > 0 || pendingMemoryCount > 0;
  const completedStageCount = [
    Boolean(currentUser),
    hasConnectedRepository,
    activeCollectorTokens.length > 0,
    isCollectorRecent,
    hasProjectMemory,
  ].filter(Boolean).length;
  useEffect(() => {
    if (createdCollectorToken) {
      setCollectorTokenName("");
    }
  }, [createdCollectorToken]);
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
  const minimalCopy = locale === "ko"
    ? {
        accountDescription: "계정 정보와 화면 설정",
        accountTitle: "계정 및 환경",
        collectorDetails: "Collector 토큰 관리",
        connectionsDescription: "GitHub와 Collector 연결",
        connectionsTitle: "연결",
        dataDescription: "프로젝트 데이터가 정상적으로 처리되는지 확인합니다.",
        dataTitle: "데이터 상태",
        ready: "워크스페이스 준비 완료",
        review: "검토하기",
        setupProgress: `설정 ${completedStageCount}/5 완료`,
      }
    : {
        accountDescription: "Account details and display settings",
        accountTitle: "Account & preferences",
        collectorDetails: "Manage Collector tokens",
        connectionsDescription: "GitHub and Collector connections",
        connectionsTitle: "Connections",
        dataDescription: "Check that project data is moving through Promty.",
        dataTitle: "Data status",
        ready: "Workspace ready",
        review: "Review now",
        setupProgress: `${completedStageCount}/5 settings complete`,
      };
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
      <section className="settings-overview" aria-labelledby="settings-title">
        <div className="settings-overview-copy">
          <span className="settings-health" data-tone={completedStageCount === 5 ? "success" : "warning"}>
            <span aria-hidden="true" />
            {minimalCopy.setupProgress}
          </span>
          <h2 id="settings-title">
            {completedStageCount === 5 ? minimalCopy.ready : t("settings.serviceSetup")}
          </h2>
          <p>{overallMessage}</p>
        </div>
        <div className="settings-overview-actions">
          {pendingMemoryCount > 0 ? (
            <button
              className="toolbar-button"
              onClick={(event) => onOpenReviewQueue(event.currentTarget)}
              type="button"
            >
              {minimalCopy.review} · {pendingMemoryCount.toLocaleString()}
            </button>
          ) : null}
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

      <div className="settings-simple-grid">
        <section className="settings-simple-panel" aria-labelledby="settings-account-title">
          <header className="settings-simple-header">
            <div>
              <h3 id="settings-account-title">{minimalCopy.accountTitle}</h3>
              <p>{minimalCopy.accountDescription}</p>
            </div>
          </header>
          <div className="settings-simple-row">
            <span>{t("settings.accountLabel")}</span>
            <div className="settings-account-value">
              <strong>{currentUser?.username ?? t("common.signedIn")}</strong>
              <small>{currentUser?.email ?? t("settings.githubAuthenticated")}</small>
            </div>
          </div>
          <div className="settings-simple-row">
            <span>{t("settings.role")}</span>
            <strong>{roleLabel} · {canUseAdmin ? t("settings.adminConsole") : t("settings.standardMember")}</strong>
          </div>
          <div className="settings-simple-row">
            <label htmlFor="settings-language">{t("language.label")}</label>
            <div className="settings-simple-control">
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
            </div>
          </div>
          <div className="settings-simple-row">
            <span>{themeCopy.label}</span>
            <div className="settings-theme-compact" aria-label={themeCopy.label} role="radiogroup">
              <button
                aria-checked={theme === "dark"}
                data-active={theme === "dark" ? "true" : undefined}
                onClick={() => setTheme("dark")}
                role="radio"
                type="button"
              >
                <Moon aria-hidden="true" size={14} strokeWidth={1.5} />
                {themeCopy.dark}
              </button>
              <button
                aria-checked={theme === "bright"}
                data-active={theme === "bright" ? "true" : undefined}
                onClick={() => setTheme("bright")}
                role="radio"
                type="button"
              >
                <Sun aria-hidden="true" size={14} strokeWidth={1.5} />
                {themeCopy.bright}
              </button>
            </div>
          </div>
        </section>

        <section className="settings-simple-panel" aria-labelledby="settings-connections-title">
          <header className="settings-simple-header">
            <div>
              <h3 id="settings-connections-title">{minimalCopy.connectionsTitle}</h3>
              <p>{minimalCopy.connectionsDescription}</p>
            </div>
          </header>
          <div className="settings-connection-block">
            <div className="settings-connection-heading">
              <GitHubIcon />
              <div>
                <strong>GitHub</strong>
                <span>{repositoryCoverage} {t("settings.repositories").toLowerCase()}</span>
              </div>
              <span className="settings-health" data-tone={hasConnectedRepository ? "success" : "warning"}>
                <span aria-hidden="true" />
                {hasConnectedRepository ? t("settings.statusComplete") : t("settings.statusConnectGithub")}
              </span>
            </div>
            <div className="settings-connection-actions">
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
          <div className="settings-connection-block">
            <div className="settings-connection-heading">
              <Database aria-hidden="true" size={17} strokeWidth={1.5} />
              <div>
                <strong>{t("settings.collector")}</strong>
                <span>{activeCollectorTokens.length} {t("common.active")} · {tokenDateLabel(latestCollectorUse, t("common.never"))}</span>
              </div>
              <span className="settings-health" data-tone={collectorIngestion.tone}>
                <span aria-hidden="true" />
                {collectorIngestion.label}
              </span>
            </div>
          </div>
          <details className="settings-disclosure">
            <summary>
              <span>{minimalCopy.collectorDetails}</span>
              <ChevronDown aria-hidden="true" size={16} strokeWidth={1.5} />
            </summary>
            <div className="settings-disclosure-content">
              <dl className="settings-compact-metrics">
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
        </section>

        <section className="settings-simple-panel settings-simple-panel-wide" aria-labelledby="settings-data-title">
          <header className="settings-simple-header">
            <div>
              <h3 id="settings-data-title">{minimalCopy.dataTitle}</h3>
              <p>{minimalCopy.dataDescription}</p>
            </div>
            {pendingMemoryCount > 0 ? (
              <button
                className="settings-text-action"
                onClick={(event) => onOpenReviewQueue(event.currentTarget)}
                type="button"
              >
                {t("settings.openReviewQueue")} · {pendingMemoryCount.toLocaleString()}
              </button>
            ) : null}
          </header>
          <dl className="settings-data-list">
            <div>
              <dt>{t("settings.repository")}</dt>
              <dd>{repositoryCoverage}</dd>
              <dd className="settings-data-health"><span className="settings-health" data-tone={hasConnectedRepository ? "success" : "warning"}><span aria-hidden="true" />{hasConnectedRepository ? t("settings.statusComplete") : t("settings.statusSelectRepository")}</span></dd>
            </div>
            <div>
              <dt>{t("settings.collector")}</dt>
              <dd>{tokenDateLabel(latestCollectorUse, t("common.never"))}</dd>
              <dd className="settings-data-health"><span className="settings-health" data-tone={collectorIngestion.tone}><span aria-hidden="true" />{collectorIngestion.label}</span></dd>
            </div>
            <div>
              <dt>{t("settings.activity")}</dt>
              <dd>{latestActivityLabel}</dd>
              <dd className="settings-data-health"><span className="settings-health" data-tone={isCollectorRecent ? "success" : "warning"}><span aria-hidden="true" />{projectCount.toLocaleString()} {t("settings.projectsDetected").toLowerCase()}</span></dd>
            </div>
            <div>
              <dt>{t("settings.memory")}</dt>
              <dd>{memoryCount.toLocaleString()} · {latestMemoryLabel}</dd>
              <dd className="settings-data-health"><span className="settings-health" data-tone={pendingMemoryCount > 0 ? "warning" : hasProjectMemory ? "success" : "neutral"}><span aria-hidden="true" />{pendingMemoryCount > 0 ? `${pendingMemoryCount.toLocaleString()} ${t("settings.readyForReview").toLowerCase()}` : t("settings.statusComplete")}</span></dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
