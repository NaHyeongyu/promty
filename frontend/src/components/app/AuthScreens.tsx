import {
  ArrowRight,
  FolderGit2,
  KeyRound,
  Laptop,
  LoaderCircle,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { API_URL, BRAND_NAME } from "../../config";
import { currentWorkspaceReturnUrl } from "../../workspace/navigation";
import { BrandLogo, GitHubIcon } from "./Branding";

export function CliLoginPage() {
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
          <h1 id="cli-login-title">Authorize this collector</h1>
          <p>
            Use your GitHub identity to send this machine's AI activity to the correct {" "}
            {BRAND_NAME} workspace.
          </p>
        </div>

        <div className="auth-role-list" aria-label="Collector authorization details">
          <AuthRole
            description="GitHub verifies your account using profile and email access."
            icon={UserRoundCheck}
            title="Account identity"
          />
          <AuthRole
            description={`A revocable ${BRAND_NAME} collector token is returned only to this machine.`}
            icon={KeyRound}
            title="Device token"
          />
          <AuthRole
            description="This step does not request GitHub repository access."
            icon={FolderGit2}
            title="Repository access"
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
          <span>Authorize collector</span>
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
        </a>

        <div className="cli-login-footer">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>Return to your terminal after GitHub approval.</span>
        </div>
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
  const authorizationError =
    new URLSearchParams(window.location.search).get("auth_error") ===
    "github_authorization_cancelled"
      ? "GitHub authorization was cancelled. No permissions were changed."
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
          <h1 id="web-login-title">Sign in to {BRAND_NAME}</h1>
          <p>Recover the decisions, responses, and code changes behind your AI work.</p>
        </div>

        {displayedError ? (
          <div className="auth-message" data-error={isError}>
            {displayedError}
          </div>
        ) : null}

        <div className="auth-role-list" aria-label="GitHub authorization details">
          <AuthRole
            description="GitHub verifies your account and keeps the workspace tied to you."
            icon={UserRoundCheck}
            title="Account sign-in"
          />
          <AuthRole
            description="Repository access is requested later, only when you connect source context."
            icon={FolderGit2}
            title="Repository permission"
          />
          <AuthRole
            description="Local prompts are collected only after you install a collector in a project."
            icon={Laptop}
            title="AI activity"
          />
        </div>

        <a className="github-login-button" href={loginUrl}>
          <GitHubIcon />
          <span>Sign in with GitHub</span>
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
        </a>

        <div className="cli-login-footer">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>This sign-in requests identity and email access only.</span>
        </div>
      </section>
    </main>
  );
}

export function AuthLoadingPage() {
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
          <h1 id="auth-loading-title">Checking your session</h1>
          <p>This takes a moment.</p>
        </div>

        <div className="auth-loading-indicator">
          <LoaderCircle
            aria-hidden="true"
            className="auth-loading-spinner"
            size={18}
            strokeWidth={1.5}
          />
          <span>Loading</span>
        </div>

        <div className="cli-login-footer">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>Secure sign-in is handled by GitHub.</span>
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
