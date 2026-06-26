import type { PromptHubEvent } from "../types/event";

type EventTimelineProps = {
  events: PromptHubEvent[];
};

function getEventSummary(event: PromptHubEvent): string {
  if (event.event_type === "PromptSubmitted") {
    return event.payload.prompt;
  }

  if (event.event_type === "FilesChanged") {
    return event.payload.files.join(", ");
  }

  if (event.event_type === "CommitCreated") {
    const hash = event.payload.hash ?? "";
    const message = event.payload.message ?? "";
    return [hash, message].filter(Boolean).join(" ");
  }

  if (event.event_type === "ResponseReceived") {
    const tokens = event.payload.tokens ? `${event.payload.tokens} tokens` : "";
    const duration = event.payload.duration_ms ? `${event.payload.duration_ms} ms` : "";
    return [tokens, duration].filter(Boolean).join(" ");
  }

  return event.event_type;
}

function getStringPayloadValue(event: PromptHubEvent, key: "model" | "cwd"): string | null {
  const payload = event.payload as Partial<Record<"model" | "cwd", unknown>>;
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

export function EventTimeline({ events }: EventTimelineProps) {
  if (events.length === 0) {
    return <p>No events yet.</p>;
  }

  const orderedEvents = [...events].sort((left, right) => {
    const sessionCompare = left.session_id.localeCompare(right.session_id);
    if (sessionCompare !== 0) {
      return sessionCompare;
    }
    return left.sequence - right.sequence;
  });

  return (
    <ol>
      {orderedEvents.map((event) => (
        <li key={event.id}>
          <article>
            <header>
              <strong>{event.event_type}</strong>
              <span>{event.tool}</span>
              <span>#{event.sequence}</span>
              <time dateTime={event.timestamp}>
                {new Date(event.timestamp).toLocaleString()}
              </time>
            </header>
            <p>{getEventSummary(event)}</p>
            <dl>
              <dt>Session</dt>
              <dd>{event.session_id}</dd>
              {getStringPayloadValue(event, "model") ? (
                <>
                  <dt>Model</dt>
                  <dd>{getStringPayloadValue(event, "model")}</dd>
                </>
              ) : null}
              {getStringPayloadValue(event, "cwd") ? (
                <>
                  <dt>Working directory</dt>
                  <dd>{getStringPayloadValue(event, "cwd")}</dd>
                </>
              ) : null}
            </dl>
          </article>
        </li>
      ))}
    </ol>
  );
}
