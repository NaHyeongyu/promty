import { useEffect, useState } from "react";

import { fetchEvents } from "../api/events";
import { EventTimeline } from "../components/EventTimeline";
import type { PromptHubEvent } from "../types/event";

export function TimelinePage() {
  const [events, setEvents] = useState<PromptHubEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load events");
      });
  }, []);

  if (error) {
    return <p>{error}</p>;
  }

  return <EventTimeline events={events} />;
}
