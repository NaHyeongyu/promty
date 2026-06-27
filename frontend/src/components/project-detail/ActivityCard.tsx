import { ArrowRight } from "lucide-react";
import type { ActivityItem, PromptActivityItem } from "./types";

type ActivityCardProps = {
  activity: ActivityItem;
};

export function ActivityCard({ activity }: ActivityCardProps) {
  return (
    <a
      className="bh-activity-card"
      href="#activity-detail-placeholder"
      aria-label={`Open ${activity.model} activity detail`}
    >
      <div className="bh-activity-card-header">
        <div>
          <span>AI model</span>
          <strong>{activity.model}</strong>
        </div>
        <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
      </div>

      <dl className="bh-activity-meta">
        <div>
          <dt>Started</dt>
          <dd>{activity.startedAt}</dd>
        </div>
        <div>
          <dt>Last activity</dt>
          <dd>{activity.lastActivity}</dd>
        </div>
      </dl>

      <dl className="bh-activity-stats">
        <div>
          <dt>Prompts</dt>
          <dd>{activity.prompts}</dd>
        </div>
        <div>
          <dt>Responses</dt>
          <dd>{activity.responses}</dd>
        </div>
        <div>
          <dt>Events</dt>
          <dd>{activity.events}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{activity.filesChanged}</dd>
        </div>
      </dl>
    </a>
  );
}

type PromptActivityCardProps = {
  activity: PromptActivityItem;
};

export function PromptActivityCard({ activity }: PromptActivityCardProps) {
  return (
    <a
      className="bh-activity-card bh-prompt-activity-card"
      href="#activity-detail-placeholder"
      aria-label={`Open prompt submitted at ${activity.submittedAt}`}
    >
      <div className="bh-activity-card-header">
        <div>
          <span>Prompt</span>
          <strong>{activity.prompt}</strong>
        </div>
        <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
      </div>

      <dl className="bh-activity-meta bh-prompt-activity-meta">
        <div>
          <dt>Submitted</dt>
          <dd>{activity.submittedAt}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{activity.model}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{activity.sessionId.slice(0, 8)}</dd>
        </div>
        <div>
          <dt>Sequence</dt>
          <dd>#{activity.sequence}</dd>
        </div>
      </dl>
    </a>
  );
}
