import { lazy, Suspense } from "react";
import { AppLoadingPage, NotFoundPage } from "./components/app/AppStatusPages";
import { appRouteFromPathname } from "./routing";
import "./App.css";

const AdminApp = lazy(() =>
  import("./AdminApp").then((module) => ({ default: module.AdminApp })),
);
const AuthenticatedApp = lazy(() =>
  import("./AuthenticatedApp").then((module) => ({
    default: module.AuthenticatedApp,
  })),
);
const CliLoginPage = lazy(() =>
  import("./components/app/AuthScreens").then((module) => ({
    default: module.CliLoginPage,
  })),
);
const CollectorDocsPage = lazy(() =>
  import("./components/docs/CollectorDocsPage").then((module) => ({
    default: module.CollectorDocsPage,
  })),
);

function App() {
  const route = appRouteFromPathname(window.location.pathname);

  let page;
  if (route === "admin") page = <AdminApp />;
  else if (route === "collector-docs") page = <CollectorDocsPage />;
  else if (route === "collector-docs-ai") page = <CollectorDocsPage audience="ai" />;
  else if (route === "cli-login") page = <CliLoginPage />;
  else page = route === "workspace" ? <AuthenticatedApp /> : <NotFoundPage />;

  return <Suspense fallback={<AppLoadingPage />}>{page}</Suspense>;
}

export default App;
