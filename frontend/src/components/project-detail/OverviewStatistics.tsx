import type { ProjectDetailData } from "./types";
import { useI18n } from "../../i18n/I18nProvider";

function overviewCompactNumber(value: number, locale: string) {
  return Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
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
  label,
  points,
  type,
}: {
  label: string;
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
      aria-label={label}
      className="bh-overview-stat-sparkline"
      preserveAspectRatio="none"
      role="img"
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
}: {
  data: ProjectDetailData;
}) {
  const { localeTag, t } = useI18n();
  const history = data.metricHistory.slice(-14);
  const pointsFor = (
    key: "filesChanged" | "memories" | "prompts" | "sessions",
  ) => {
    const points = history.map((item) => item[key]);
    return points.length > 0 ? points : Array.from({ length: 14 }, () => 0);
  };
  const statisticItems = [
    {
      chart: "line" as const,
      label: t("project.sessions"),
      metricKey: "sessions" as const,
      points: pointsFor("sessions"),
      tone: "sessions",
    },
    {
      chart: "line" as const,
      label: t("project.prompts"),
      metricKey: "prompts" as const,
      points: pointsFor("prompts"),
      tone: "prompts",
    },
    {
      chart: "line" as const,
      label: t("project.filesChanged"),
      metricKey: "filesChanged" as const,
      points: pointsFor("filesChanged"),
      tone: "files",
    },
    {
      chart: "line" as const,
      label: t("project.memory"),
      metricKey: "memories" as const,
      points: pointsFor("memories"),
      tone: "memory",
    },
  ];
  const renderedStatisticItems = statisticItems.map((item) => ({
    ...item,
    value: overviewCompactNumber(
      item.points.reduce((total, point) => total + point, 0),
      localeTag,
    ),
  }));

  return (
    <section
      className="bh-overview-statistics"
      aria-label={t("project.statistics14Days")}
    >
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
              <span className="bh-overview-statistics-change">
                <small>{t("project.last14Days")}</small>
              </span>
            </div>
            <SparklineChart
              label={
                history.length > 0
                  ? t("project.metricPerDay", {
                      label: item.label,
                      details: history
                        .map((day) => `${day.date}: ${day[item.metricKey]}`)
                        .join(", "),
                    })
                  : t("project.metricPerDay", {
                      label: item.label,
                      details: t("project.noRecordedActivity"),
                    })
              }
              points={item.points}
              type={item.chart}
            />
          </div>
        ))}
      </dl>
    </section>
  );
}
