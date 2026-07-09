import { CliLoginPage } from "./components/app/AuthScreens";
import { AuthenticatedApp } from "./AuthenticatedApp";
import "./App.css";

function App() {
  if (window.location.pathname === "/cli/login") {
    return <CliLoginPage />;
  }

  return <AuthenticatedApp />;
}

export default App;
