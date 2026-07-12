import { CliLoginPage } from "./components/app/AuthScreens";
import { CollectorDocsPage } from "./components/docs/CollectorDocsPage";
import { AuthenticatedApp } from "./AuthenticatedApp";
import "./App.css";

function App() {
  if (window.location.pathname === "/docs/collector") {
    return <CollectorDocsPage />;
  }

  if (window.location.pathname === "/docs/collector/ai") {
    return <CollectorDocsPage audience="ai" />;
  }

  if (window.location.pathname === "/cli/login") {
    return <CliLoginPage />;
  }

  return <AuthenticatedApp />;
}

export default App;
