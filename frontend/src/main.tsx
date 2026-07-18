import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { preloadCurrentUser } from "./api/auth";
import { AppErrorBoundary } from "./components/app/AppStatusPages";
import { I18nProvider } from "./i18n/I18nProvider";

if (
  import.meta.env.PROD &&
  window.location.pathname === "/" &&
  new URLSearchParams(window.location.search).get("preview") !== "community"
) {
  preloadCurrentUser();
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
