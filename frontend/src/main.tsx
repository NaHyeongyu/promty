import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import "./styles-warm-human.css";
import { preloadCurrentUser } from "./api/auth";
import { AppErrorBoundary } from "./components/app/AppStatusPages";
import { I18nProvider } from "./i18n/I18nProvider";

document.documentElement.dataset.designConcept = "warm-human";

if (import.meta.env.PROD) {
  const pathname = window.location.pathname;
  const communityPreview =
    pathname === "/" &&
    new URLSearchParams(window.location.search).get("preview") === "community";
  if (
    (pathname === "/" && !communityPreview) ||
    pathname === "/app" ||
    pathname === "/admin"
  ) {
    preloadCurrentUser();
  }
  if (pathname === "/admin") {
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
