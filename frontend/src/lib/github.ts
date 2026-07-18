function encodeGithubPath(value: string) {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function githubRepositoryUrl(repositoryUrl: string | null | undefined) {
  if (!repositoryUrl?.trim()) {
    return null;
  }

  const normalizedRepositoryUrl = repositoryUrl
    .trim()
    .replace(/^git@github\.com:/i, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/")
    .replace(/\.git\/?$/i, "")
    .replace(/\/$/, "");

  try {
    const parsedRepositoryUrl = new URL(normalizedRepositoryUrl);
    if (
      parsedRepositoryUrl.protocol !== "https:" ||
      parsedRepositoryUrl.hostname.toLowerCase() !== "github.com" ||
      parsedRepositoryUrl.username ||
      parsedRepositoryUrl.password
    ) {
      return null;
    }
    const pathParts = parsedRepositoryUrl.pathname.split("/").filter(Boolean);
    if (
      pathParts.length !== 2 ||
      pathParts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part.replace(/\.git$/i, "")))
    ) {
      return null;
    }
    const repository = pathParts[1].replace(/\.git$/i, "");
    return `https://github.com/${pathParts[0]}/${repository}`;
  } catch {
    return null;
  }
}

export function githubFileUrl(
  repositoryUrl: string | null | undefined,
  branch: string | null | undefined,
  path: string,
) {
  if (!repositoryUrl?.trim() || !path.trim()) {
    return null;
  }

  const normalizedRepositoryUrl = githubRepositoryUrl(repositoryUrl);
  if (!normalizedRepositoryUrl) {
    return null;
  }

  const encodedBranch = encodeGithubPath(branch?.trim() || "main");
  const encodedPath = encodeGithubPath(path.trim());
  return `${normalizedRepositoryUrl}/blob/${encodedBranch}/${encodedPath}`;
}
