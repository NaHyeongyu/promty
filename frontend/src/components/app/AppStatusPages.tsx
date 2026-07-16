import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, Home, LoaderCircle, RefreshCw } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { BrandLockup } from "./Branding";

function StatusPage({
  description,
  onRetry,
  title,
}: {
  description: string;
  onRetry?: () => void;
  title: string;
}) {
  const { t } = useI18n();

  return (
    <main className="app-status-page">
      <section aria-labelledby="app-status-title" className="app-status-card">
        <a aria-label={t("error.home")} className="app-status-brand" href="/">
          <BrandLockup />
        </a>
        <CircleAlert aria-hidden="true" className="app-status-icon" size={30} />
        <h1 id="app-status-title">{title}</h1>
        <p>{description}</p>
        <div className="app-status-actions">
          {onRetry ? (
            <button className="toolbar-button" onClick={onRetry} type="button">
              <RefreshCw aria-hidden="true" size={16} />
              <span>{t("common.retry")}</span>
            </button>
          ) : null}
          <a className="toolbar-button" href="/">
            <Home aria-hidden="true" size={16} />
            <span>{t("error.home")}</span>
          </a>
        </div>
      </section>
    </main>
  );
}

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <StatusPage
      description={t("error.notFoundDescription")}
      title={t("error.notFoundTitle")}
    />
  );
}

export function AppLoadingPage() {
  const { t } = useI18n();
  return (
    <main className="app-status-page">
      <section
        aria-label={t("auth.loading")}
        aria-live="polite"
        className="app-status-card"
        role="status"
      >
        <div className="app-status-brand">
          <BrandLockup />
        </div>
        <LoaderCircle
          aria-hidden="true"
          className="app-status-icon app-status-loading-icon"
          size={30}
        />
        <p>{t("auth.loading")}</p>
      </section>
    </main>
  );
}

function AppCrashPage() {
  const { t } = useI18n();
  return (
    <StatusPage
      description={t("error.appDescription")}
      onRetry={() => window.location.reload()}
      title={t("error.appTitle")}
    />
  );
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render failed", error, info);
  }

  render() {
    return this.state.hasError ? <AppCrashPage /> : this.props.children;
  }
}
