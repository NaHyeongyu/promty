import type { PromptHubEvent } from "../types/event";

type EventTimelineProps = {
  events: PromptHubEvent[];
};

function getEventSummary(event: PromptHubEvent): string {
  if (event.event_type === "PROMPT_SENT" && typeof event.payload.prompt === "string") {
    return event.payload.prompt;
  }

  if (event.event_type === "FILES_CHANGED" && Array.isArray(event.payload.files)) {
    return event.payload.files.join(", ");
  }

  if (event.event_type === "COMMIT_CREATED") {
    const hash = typeof event.payload.hash === "string" ? event.payload.hash : "";
    const message = typeof event.payload.message === "string" ? event.payload.message : "";
    return [hash, message].filter(Boolean).join(" ");
  }

  return event.event_type.split("_").join(" ").toLowerCase();
}

export function EventTimeline({ events }: EventTimelineProps) {
  if (events.length === 0) {
    return <p>No events yet.</p>;
  }

  return (
    <ol>
      {events.map((event) => (
        <li key={event.id}>
          <article>
            <header>
              <strong>{event.event_type}</strong>
              <span>{event.tool}</span>
              <time dateTime={event.timestamp}>
                {new Date(event.timestamp).toLocaleString()}
              </time>
            </header>
            <p>{getEventSummary(event)}</p>
            <dl>
              <dt>Session</dt>
              <dd>{event.session_id}</dd>
              {typeof event.payload.model === "string" ? (
                <>
                  <dt>Model</dt>
                  <dd>{event.payload.model}</dd>
                </>
              ) : null}
              {typeof event.payload.cwd === "string" ? (
                <>
                  <dt>Working directory</dt>
                  <dd>{event.payload.cwd}</dd>
                </>
              ) : null}
            </dl>
          </article>
        </li>
      ))}
    </ol>
  );
}
