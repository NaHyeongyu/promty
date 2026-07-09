import {
  workTypeFilterOptions,
  type WorkTypeFilter,
} from "./activityHelpers";

export function WorkTypeFilterControl({
  ariaLabel,
  counts,
  onChange,
  value,
}: {
  ariaLabel: string;
  counts: Record<WorkTypeFilter, number>;
  onChange: (value: WorkTypeFilter) => void;
  value: WorkTypeFilter;
}) {
  return (
    <div className="bh-work-type-filter" role="group" aria-label={ariaLabel}>
      {workTypeFilterOptions.map((option) => (
        <button
          data-active={value === option.id}
          key={option.id}
          onClick={() => onChange(option.id)}
          type="button"
        >
          <span>{option.label}</span>
          <strong>{counts[option.id]}</strong>
        </button>
      ))}
    </div>
  );
}
