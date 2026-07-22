import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import "./styles-warm-human.css";
import { preloadCurrentUser } from "./api/auth";
import { AppErrorBoundary } from "./components/app/AppStatusPages";
import { I18nProvider } from "./i18n/I18nProvider";
import { appRouteFromLocation } from "./routing";
import { initializeTheme } from "./theme";

initializeTheme();

if (import.meta.env.PROD) {
  const pathname = window.location.pathname;
  const route = appRouteFromLocation(pathname, window.location.search);
  const communityPreview =
    pathname === "/" &&
    new URLSearchParams(window.location.search).get("preview") === "community";
  if ((route === "workspace" && !communityPreview) || route === "admin") {
    preloadCurrentUser();
  }
  if (route === "admin") {
    void import("./AdminApp");
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
