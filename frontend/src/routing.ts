export type AppRoute =
  | "admin"
  | "cli-login"
  | "collector-docs"
  | "collector-docs-ai"
  | "not-found"
  | "workspace";

export function appRouteFromPathname(pathname: string): AppRoute {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPathname === "/") {
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
