import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import "./styles-warm-human.css";
import { preloadCurrentUser } from "./api/auth";
import { AppErrorBoundary } from "./components/app/AppStatusPages";
import { I18nProvider } from "./i18n/I18nProvider";
import { appRouteFromLocation, shouldPreloadCurrentUser } from "./routing";
import { initializeTheme } from "./theme";

initializeTheme();

if (import.meta.env.PROD) {
  const route = appRouteFromLocation(
    window.location.pathname,
    window.location.search,
  );
  if (shouldPreloadCurrentUser(window.location.pathname, window.location.search)) {
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
