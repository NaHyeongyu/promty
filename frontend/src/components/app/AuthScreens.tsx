import { ArrowRight, ShieldCheck } from "lucide-react";
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
      <section className="cli-login-panel" aria-labelledby="cli-login-title">
        <div className="cli-login-kicker">
          <BrandLogo className="is-kicker" />
          {BRAND_NAME} CLI
        </div>

        <div className="cli-login-copy">
          <h1 id="cli-login-title">Connect GitHub</h1>
          <p>
            Issue a local collector token for AI session history on this machine.
          </p>
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
          <span>Continue with GitHub</span>
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
        </a>

        <div className="cli-login-footer">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>Only a {BRAND_NAME} collector token is returned to your terminal.</span>
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
  const returnTo = currentWorkspaceReturnUrl();
  const loginUrl = `${API_URL}/api/auth/github/web/start?${new URLSearchParams({
    return_to: returnTo,
  }).toString()}`;

  return (
    <main className="cli-login-shell">
      <section className="cli-login-panel" aria-labelledby="web-login-title">
        <div className="cli-login-kicker">
          <BrandLogo className="is-kicker" />
          {BRAND_NAME}
        </div>

        <div className="cli-login-copy">
          <h1 id="web-login-title">Sign in to {BRAND_NAME}</h1>
          <p>Searchable memory for prompts, responses, and code changes.</p>
        </div>

        {errorMessage ? (
          <div className="auth-message" data-error={isError}>
            {errorMessage}
          </div>
        ) : null}

        <a className="github-login-button" href={loginUrl}>
          <GitHubIcon />
          <span>Continue with GitHub</span>
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
        </a>

        <div className="cli-login-footer">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>GitHub sign-in keeps project access tied to your workspace.</span>
        </div>
      </section>
    </main>
  );
}
