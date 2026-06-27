import type { OverviewItem } from "./types";

type OverviewCardProps = {
  item: OverviewItem;
};

export function OverviewCard({ item }: OverviewCardProps) {
  return (
    <article className="bh-overview-card">
      <div className="bh-overview-card-copy">
        <span>{item.title}</span>
        <strong>{item.value}</strong>
        {item.description ? <p>{item.description}</p> : null}
      </div>

      {item.actions ? (
        <div className="bh-overview-actions" aria-label={`${item.title} actions`}>
          {item.actions.map((action) => (
            <button key={action} type="button">
              {action}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
