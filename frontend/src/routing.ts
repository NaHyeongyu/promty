export type AppRoute =
  | "admin"
  | "cli-login"
  | "collector-docs"
  | "collector-docs-ai"
  | "landing"
  | "not-found"
  | "product"
  | "workspace";

export function appRouteFromPathname(pathname: string): AppRoute {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPathname === "/") {
    return "workspace";
  }
  if (normalizedPathname === "/about") {
    return "landing";
  }
  if (normalizedPathname === "/product") {
    return "product";
  }
  if (normalizedPathname === "/app") {
    return "workspace";
  }
  if (normalizedPathname === "/admin") {
    return "admin";
  }
  if (normalizedPathname === "/docs/collector") {
    return "collector-docs";
  }
  if (normalizedPathname === "/docs/collector/ai") {
    return "collector-docs-ai";
  }
  if (normalizedPathname === "/cli/login") {
    return "cli-login";
  }
  return "not-found";
}

export function navigateToAppUrl(
  href: string,
  mode: "push" | "replace" = "push",
) {
  let target: URL;
  try {
    target = new URL(href, window.location.origin);
  } catch {
    return false;
  }

  if (
    target.origin !== window.location.origin ||
    appRouteFromPathname(target.pathname) === "not-found"
  ) {
    return false;
  }

  const nextUrl = `${target.pathname}${target.search}${target.hash}`;
  window.history[mode === "replace" ? "replaceState" : "pushState"](
    { promtyAppNavigation: true },
    "",
    nextUrl,
  );
  window.dispatchEvent(
    new PopStateEvent("popstate", { state: { promtyAppNavigation: true } }),
  );
  return true;
}

const LEGACY_WORKSPACE_QUERY_KEYS = new Set([
  "activity",
  "author",
  "community",
  "file",
  "profile",
  "project",
  "prompt",
  "public_project",
  "session",
  "tab",
  "view",
]);

export function isLegacyWorkspaceSearch(search: string) {
  const params = new URLSearchParams(search);
  return [...params.keys()].some((key) => LEGACY_WORKSPACE_QUERY_KEYS.has(key));
}
