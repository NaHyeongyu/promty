const RAW_EVENT_LOG_PATTERN =
  /\b(?:PromptSubmitted|ResponseReceived|FilesChanged)\b|\bevent\s+(?:id|for turn)\b|\bprompt submitted\s*:|\bAI response event\s*:|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

export function displayMemoryOutcome(
  outcome: string | null | undefined,
  summary: string | null | undefined,
) {
  const value = outcome?.trim();
  if (!value || value === summary?.trim() || RAW_EVENT_LOG_PATTERN.test(value)) {
    return null;
  }
  return value;
}
