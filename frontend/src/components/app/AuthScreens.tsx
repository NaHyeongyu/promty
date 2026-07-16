import {
  ArrowRight,
  BookOpen,
  FolderGit2,
  KeyRound,
  Laptop,
  LoaderCircle,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { API_URL, BRAND_NAME } from "../../config";
import { useI18n } from "../../i18n/I18nProvider";
import { currentWorkspaceReturnUrl } from "../../workspace/navigation";
import { BrandLogo, GitHubIcon } from "./Branding";
import "../../styles-auth.css";

export function CliLoginPage() {
  const { t } = useI18n();
  const params = new URLSearchParams(window.location.search);
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? "";
  const apiUrl = (
    params.get("api_url") ??
    import.meta.env.VITE_PROMPTHUB_API_URL ??
    "http://127.0.0.1:8011"
  ).replace(/\/$/, "");
  const canConnect = redirectUri.length > 0 && state.length > 0;
  const githubLoginUrl = `${apiUrl}/api/auth/github/start?${new URLSearchParams(
    {
      redirect_uri: redirectUri,
      state,
    },
  ).toString()}`;

  return (
    <main className="cli-login-shell">
      <section
        className="cli-login-panel auth-login-panel"
        aria-labelledby="cli-login-title"
      >
        <div className="cli-login-kicker">
          <BrandLogo className="is-kicker" />
          {BRAND_NAME} CLI
        </div>

        <div className="cli-login-copy">
          <h1 id="cli-login-title">{t("auth.authorizeCollectorTitle")}</h1>
          <p>{t("auth.cliDescription", { brand: BRAND_NAME })}</p>
        </div>

        <div className="auth-role-list" aria-label={t("auth.collectorAuthorizationDetails")}>
          <AuthRole
            description={t("auth.identityAccessDescription")}
            icon={UserRoundCheck}
            title={t("auth.identity")}
          />
          <AuthRole
            description={t("auth.deviceTokenDescription", { brand: BRAND_NAME })}
            icon={KeyRound}
            title={t("auth.deviceToken")}
          />
          <AuthRole
            description={t("auth.noRepositoryAccess")}
            icon={FolderGit2}
            title={t("auth.repositoryPermission")}
          />
        </div>

        <a
          aria-disabled={!canConnect}
          className="github-login-button"
          data-disabled={!canConnect}
          href={canConnect ? githubLoginUrl : undefined}
          onClick={(event) => {
            if (!canConnect) {
              event.preventDefault();
            }
          }}
        >
          <GitHubIcon />
          <span>{t("auth.authorizeCollector")}</span>
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
        </a>

        <div className="cli-login-footer">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>{t("auth.returnTerminal")}</span>
        </div>
        <a
          className="auth-docs-link"
          href="/docs/collector"
          rel="noreferrer"
          target="_blank"
        >
          <BookOpen aria-hidden="true" size={15} strokeWidth={1.5} />
          {t("auth.collectorGuide")}
        </a>
      </section>
    </main>
  );
}

export function WebLoginPage({
  errorMessage,
  isError = false,
}: {
  errorMessage: string | null;
  isError?: boolean;
}) {
  const { t } = useI18n();
  const authorizationError =
    new URLSearchParams(window.location.search).get("auth_error") ===
    "github_authorization_cancelled"
      ? t("auth.authorizationCancelled")
      : null;
  const displayedError = errorMessage ?? authorizationError;
  const returnTo = currentWorkspaceReturnUrl();
  const loginUrl = `${API_URL}/api/auth/github/web/start?${new URLSearchParams({
    return_to: returnTo,
  }).toString()}`;

  return (
    <main className="cli-login-shell">
      <section
        className="cli-login-panel auth-login-panel"
        aria-labelledby="web-login-title"
      >
        <div className="cli-login-kicker">
          <BrandLogo className="is-kicker" />
          {BRAND_NAME}
        </div>

        <div className="cli-login-copy">
          <h1 id="web-login-title">{t("auth.signInTitle", { brand: BRAND_NAME })}</h1>
          <p>{t("auth.signInDescription")}</p>
        </div>

        {displayedError ? (
          <div className="auth-message" data-error={isError}>
            {displayedError}
          </div>
        ) : null}

        <div className="auth-role-list" aria-label={t("auth.authorizationDetails")}>
          <AuthRole
            description={t("auth.identityDescription")}
            icon={UserRoundCheck}
            title={t("auth.identity")}
          />
          <AuthRole
            description={t("auth.repositoryPermissionDescription")}
            icon={FolderGit2}
            title={t("auth.repositoryPermission")}
          />
          <AuthRole
            description={t("auth.aiActivityDescription")}
            icon={Laptop}
            title={t("auth.aiActivity")}
          />
        </div>

        <a className="github-login-button" href={loginUrl}>
          <GitHubIcon />
          <span>{t("auth.signInGithub")}</span>
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
        </a>

        <div className="cli-login-footer">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>{t("auth.signInScope")}</span>
        </div>
        <a
          className="auth-docs-link"
          href="/docs/collector"
          rel="noreferrer"
          target="_blank"
        >
          <BookOpen aria-hidden="true" size={15} strokeWidth={1.5} />
          {t("auth.learnCollector")}
        </a>
      </section>
    </main>
  );
}

export function AuthLoadingPage() {
  const { t } = useI18n();
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="cli-login-shell auth-loading-shell"
    >
      <section
        className="cli-login-panel auth-login-panel auth-loading-panel"
        aria-labelledby="auth-loading-title"
        role="status"
      >
        <div className="cli-login-kicker">
          <BrandLogo className="is-kicker" />
          {BRAND_NAME}
        </div>

        <div className="cli-login-copy">
          <h1 id="auth-loading-title">{t("auth.checkingSession")}</h1>
          <p>{t("auth.moment")}</p>
        </div>

        <div className="auth-loading-indicator">
          <LoaderCircle
            aria-hidden="true"
            className="auth-loading-spinner"
            size={18}
            strokeWidth={1.5}
          />
          <span>{t("auth.loading")}</span>
        </div>

        <div className="cli-login-footer">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>{t("auth.secureGithub")}</span>
        </div>
      </section>
    </main>
  );
}

function AuthRole({
  description,
  icon: RoleIcon,
  title,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="auth-role-item">
      <RoleIcon aria-hidden="true" size={17} strokeWidth={1.5} />
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </div>
  );
}
