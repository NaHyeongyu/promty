import type { OverviewItem, ProjectDetailData } from "./types";

function overviewCompactNumber(value: number) {
  return Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function statisticDeltaParts(delta: string | undefined) {
  if (!delta) {
    return null;
  }

  const [value, ...labelParts] = delta.split(" ");
  const label = labelParts.join(" ");
  return {
    label,
    value,
  };
}

function statisticNumericValue(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const normalizedValue = value.trim().replace(/,/g, "");
  const match = normalizedValue.match(/^([+-]?\d+(?:\.\d+)?)([kmb])?/i);
  if (!match) {
    return 0;
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === "b"
      ? 1_000_000_000
      : suffix === "m"
        ? 1_000_000
        : suffix === "k"
          ? 1_000
          : 1;
  return amount * multiplier;
}

function statisticSparklinePoints(value: string, delta: string | undefined) {
  const currentValue = Math.max(0, statisticNumericValue(value));
  const deltaValue = Math.max(0, statisticNumericValue(delta?.split(" ")[0]));

  if (currentValue === 0 && deltaValue === 0) {
    return [0, 0, 0, 0, 0, 0, 0];
  }

  const trendUnit =
    deltaValue > 0 ? deltaValue : Math.max(1, Math.round(currentValue * 0.08));
  const startValue = Math.max(0, currentValue - trendUnit * 2);
  return [
    startValue,
    startValue + trendUnit * 0.28,
    startValue + trendUnit * 0.18,
    startValue + trendUnit * 0.62,
    startValue + trendUnit * 0.52,
    startValue + trendUnit * 0.86,
    currentValue,
  ];
}

function sparklinePointCoordinates(points: number[]) {
  const width = 96;
  const height = 28;
  const maxValue = Math.max(...points, 1);
  const minValue = Math.min(...points);
  const range = Math.max(maxValue - minValue, 1);

  return points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width;
    const y = height - ((point - minValue) / range) * (height - 4) - 2;
    return [x, y] as const;
  });
}

function SparklineChart({
  points,
  type,
}: {
  points: number[];
  type: "bar" | "line";
}) {
  const coordinates = sparklinePointCoordinates(points);
  const linePath = coordinates
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L 96 30 L 0 30 Z`;
  const maxValue = Math.max(...points, 1);

  return (
    <svg
      aria-hidden="true"
      className="bh-overview-stat-sparkline"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 96 30"
    >
      {type === "bar" ? (
        points.map((point, index) => {
          const barHeight = Math.max(3, (point / maxValue) * 24);
          return (
            <rect
              height={barHeight}
              key={`${point}-${index}`}
              rx="1.5"
              width="7"
              x={index * 14 + 2}
              y={28 - barHeight}
            />
          );
        })
      ) : (
        <>
          <path className="bh-overview-stat-sparkline-area" d={areaPath} />
          <path className="bh-overview-stat-sparkline-line" d={linePath} />
        </>
      )}
    </svg>
  );
}

export function OverviewStatistics({
  data,
  overviewItems,
}: {
  data: ProjectDetailData;
  overviewItems: Map<string, OverviewItem>;
}) {
  const filesChanged = data.activities.reduce(
    (total, activity) => total + activity.filesChanged,
    0,
  );
  const statisticItems = [
    {
      chart: "line" as const,
      delta: overviewItems.get("Sessions Added")?.value,
      label: "Sessions",
      tone: "sessions",
      value: overviewItems.get("Sessions")?.value ?? "0",
    },
    {
      chart: "line" as const,
      delta: overviewItems.get("Prompts Added")?.value,
      label: "Prompts",
      tone: "prompts",
      value: overviewItems.get("Prompts")?.value ?? "0",
    },
    {
      chart: "line" as const,
      delta: overviewItems.get("Files Changed Added")?.value,
      label: "Files changed",
      tone: "files",
      value: overviewCompactNumber(filesChanged),
    },
    {
      chart: "line" as const,
      delta: undefined,
      label: "Memories",
      tone: "memory",
      value: overviewCompactNumber(data.memory.totalArtifacts),
    },
  ];
  const renderedStatisticItems = statisticItems.map((item) => ({
    ...item,
    deltaParts: statisticDeltaParts(item.delta),
    sparklinePoints: statisticSparklinePoints(item.value, item.delta),
  }));

  return (
    <section className="bh-overview-statistics" aria-label="Project statistics">
      <dl>
        {renderedStatisticItems.map((item) => (
          <div
            className="bh-overview-stat-card"
            data-tone={item.tone}
            key={item.label}
          >
            <div className="bh-overview-stat-copy">
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
              {item.deltaParts ? (
                <span className="bh-overview-statistics-change">
                  <strong>{item.deltaParts.value}</strong>
                  {item.deltaParts.label ? (
                    <small>{item.deltaParts.label}</small>
                  ) : null}
                </span>
              ) : null}
            </div>
            <SparklineChart points={item.sparklinePoints} type={item.chart} />
          </div>
        ))}
      </dl>
    </section>
  );
}
