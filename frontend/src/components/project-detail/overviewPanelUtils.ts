export function projectTagsFromInput(value: string) {
  const tags = new Set<string>();
  for (const tag of value.split(",")) {
    const normalizedTag = tag.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalizedTag) {
      continue;
    }
    tags.add(normalizedTag.slice(0, 40));
    if (tags.size >= 12) {
      break;
    }
  }
  return Array.from(tags);
}

export function projectVisibilityFromValue(
  value: string | undefined,
): "private" | "public" {
  return value?.toLowerCase() === "public" ? "public" : "private";
}
