import type { PromptHubEvent } from "../types/event";

export async function fetchEvents(apiBaseUrl = "/api"): Promise<PromptHubEvent[]> {
  const response = await fetch(`${apiBaseUrl}/events`);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }
  return response.json();
}
