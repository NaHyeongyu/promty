import { lazy, Suspense, useEffect, useState } from "react";
import { AppLoadingPage, NotFoundPage } from "./components/app/AppStatusPages";
import {
  appRouteFromPathname,
  navigateToAppUrl,
  type AppRoute,
} from "./routing";
import "./App.css";

const loadAdminApp = () => import("./AdminApp");
const loadAuthenticatedApp = () => import("./AuthenticatedApp");
const loadAuthScreens = () => import("./components/app/AuthScreens");
const loadCollectorDocsPage = () => import("./components/docs/CollectorDocsPage");
const loadLandingPage = () => import("./components/marketing/LandingPage");
const loadProductPage = () => import("./components/marketing/ProductPage");

const AdminApp = lazy(() =>
  loadAdminApp().then((module) => ({ default: module.AdminApp })),
);
const AuthenticatedApp = lazy(() =>
  loadAuthenticatedApp().then((module) => ({
    default: module.AuthenticatedApp,
  })),
);
const CliLoginPage = lazy(() =>
  loadAuthScreens().then((module) => ({
    default: module.CliLoginPage,
  })),
);
const CollectorDocsPage = lazy(() =>
  loadCollectorDocsPage().then((module) => ({
    default: module.CollectorDocsPage,
  })),
);
const LandingPage = lazy(() =>
  loadLandingPage().then((module) => ({
    default: module.LandingPage,
  })),
);
const ProductPage = lazy(() =>
  loadProductPage().then((module) => ({
    default: module.ProductPage,
  })),
);

const routePreloaders: Partial<Record<AppRoute, () => Promise<unknown>>> = {
  admin: loadAdminApp,
  "cli-login": loadAuthScreens,
  "collector-docs": loadCollectorDocsPage,
  "collector-docs-ai": loadCollectorDocsPage,
  landing: loadLandingPage,
  product: loadProductPage,
  workspace: loadAuthenticatedApp,
};

function preloadAppHref(href: string) {
  try {
    const target = new URL(href, window.location.origin);
    if (target.origin !== window.location.origin) return;
    void routePreloaders[appRouteFromPathname(target.pathname)]?.();
  } catch {
    // Invalid and non-web links use the browser's default behavior.
  }
}

function App() {
  const [route, setRoute] = useState(() => appRouteFromPathname(window.location.pathname));

  useEffect(() => {
    const handleLocationChange = (event: PopStateEvent) => {
      setRoute(appRouteFromPathname(window.location.pathname));
      if (!event.state?.promtyAppNavigation) {
        return;
      }
      window.requestAnimationFrame(() => {
        if (window.location.hash) {
          document
            .getElementById(window.location.hash.slice(1))
            ?.scrollIntoView({ block: "start" });
          return;
        }
        window.scrollTo({ left: 0, top: 0 });
      });
    };
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (
        !anchor ||
        anchor.download ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.closest(".app-status-page")
      ) {
        return;
      }

      preloadAppHref(anchor.href);
      if (navigateToAppUrl(anchor.href)) {
        event.preventDefault();
      }
    };
    const handleLinkIntent = (event: Event) => {
      const target = event.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (anchor) preloadAppHref(anchor.href);
    };

    window.addEventListener("popstate", handleLocationChange);
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("focusin", handleLinkIntent);
    document.addEventListener("pointerover", handleLinkIntent);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("focusin", handleLinkIntent);
      document.removeEventListener("pointerover", handleLinkIntent);
    };
  }, []);

  let page;
  if (route === "admin") page = <AdminApp />;
  else if (route === "collector-docs") page = <CollectorDocsPage />;
  else if (route === "collector-docs-ai") page = <CollectorDocsPage audience="ai" />;
  else if (route === "cli-login") page = <CliLoginPage />;
  else if (route === "workspace") page = <AuthenticatedApp />;
  else if (route === "landing") page = <LandingPage />;
  else if (route === "product") page = <ProductPage />;
  else page = <NotFoundPage />;

  return <Suspense fallback={<AppLoadingPage />}>{page}</Suspense>;
}

export default App;
