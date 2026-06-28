import type { PromptHubMetrics } from "../../api/promptHub";

type PromptMetricsPanelProps = {
  metrics: PromptHubMetrics;
};

function metricValue(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "0";
}

export function PromptMetricsPanel({ metrics }: PromptMetricsPanelProps) {
  return (
    <dl className="bh-prompt-metrics">
      <div>
        <dt>Files changed</dt>
        <dd>{metricValue(metrics.files_changed)}</dd>
      </div>
      <div>
        <dt>Lines added</dt>
        <dd>{metricValue(metrics.lines_added)}</dd>
      </div>
      <div>
        <dt>Lines removed</dt>
        <dd>{metricValue(metrics.lines_removed)}</dd>
      </div>
      <div>
        <dt>Events</dt>
        <dd>{metricValue(metrics.events_count)}</dd>
      </div>
    </dl>
  );
}
