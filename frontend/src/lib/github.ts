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
      parsedRepositoryUrl.hostname.toLowerCase() !== "github.com"
    ) {
      return null;
    }
    return parsedRepositoryUrl.toString().replace(/\/$/, "");
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

  const normalizedRepositoryUrl = repositoryUrl
    .trim()
    .replace(/^git@github\.com:/i, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/")
    .replace(/\.git\/?$/i, "")
    .replace(/\/$/, "");

  let parsedRepositoryUrl: URL;
  try {
    parsedRepositoryUrl = new URL(normalizedRepositoryUrl);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsedRepositoryUrl.protocol)) {
    return null;
  }

  const encodedBranch = encodeGithubPath(branch?.trim() || "main");
  const encodedPath = encodeGithubPath(path.trim());
  return `${parsedRepositoryUrl.toString().replace(/\/$/, "")}/blob/${encodedBranch}/${encodedPath}`;
}
