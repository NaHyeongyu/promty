function numericVersionParts(value: string | null | undefined): number[] | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^v/i, "").split("-", 1)[0];
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) return null;
  return normalized.split(".").map((part) => Number.parseInt(part, 10));
}

export function isCollectorUpdateAvailable(
  currentVersion: string | null | undefined,
  latestVersion: string | null | undefined,
) {
  const current = numericVersionParts(currentVersion);
  const latest = numericVersionParts(latestVersion);
  if (!current || !latest) return false;
  const length = Math.max(current.length, latest.length);
  for (let index = 0; index < length; index += 1) {
    const currentPart = current[index] ?? 0;
    const latestPart = latest[index] ?? 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  return false;
}
