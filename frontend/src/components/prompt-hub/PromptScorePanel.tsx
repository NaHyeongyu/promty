type PromptScorePanelProps = {
  scores: Array<{
    label: string;
    value: number | null;
  }>;
};

function scoreLabel(value: number | null) {
  return typeof value === "number" ? value.toFixed(1) : "Not scored";
}

export function PromptScorePanel({ scores }: PromptScorePanelProps) {
  return (
    <dl className="bh-prompt-score-panel">
      {scores.map((score) => (
        <div key={score.label}>
          <dt>{score.label}</dt>
          <dd>{scoreLabel(score.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
